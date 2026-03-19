use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::error::AppError;
use crate::models::export::{ExportOptions, WorkspaceExportBundle, WorkspaceExportConfig};
use crate::models::workspace::Workspace;
use crate::state::AppState;

/// Pure inner function: build an export bundle from a workspace and database.
/// Takes concrete types instead of `State<AppState>`, making it testable.
pub(crate) fn build_export(
    ws: &Workspace,
    db: &Database,
    options: &ExportOptions,
) -> Result<WorkspaceExportBundle, AppError> {
    let workspace_config = WorkspaceExportConfig {
        name: ws.name.clone(),
        branch: ws.branch.clone(),
        sparse_dirs: ws.sparse_dirs.clone(),
        notes: ws.notes.clone(),
        auto_commit: ws.auto_commit,
        created_at: ws.created_at.to_rfc3339(),
    };

    let repo_settings = if options.include_repo_settings {
        let mut settings = db.get_repo_settings(&ws.repo_id)?;
        if !options.include_env_vars {
            settings.env_vars.clear();
        }
        Some(serde_json::to_value(&settings)?)
    } else {
        None
    };

    let chat_messages = if options.include_chat {
        let messages = db.list_chat_messages(&ws.id)?;
        Some(serde_json::to_value(&messages)?)
    } else {
        None
    };

    let todos = if options.include_todos {
        let items = db.list_todos(&ws.id)?;
        Some(serde_json::to_value(&items)?)
    } else {
        None
    };

    let bookmarks = if options.include_bookmarks {
        let items = db.list_bookmarks(&ws.repo_id)?;
        Some(serde_json::to_value(&items)?)
    } else {
        None
    };

    let snippets = if options.include_snippets {
        let items = db.list_snippets()?;
        Some(serde_json::to_value(&items)?)
    } else {
        None
    };

    Ok(WorkspaceExportBundle {
        fury_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        format_version: 1,
        workspace: workspace_config,
        repo_settings,
        chat_messages,
        todos,
        bookmarks,
        snippets,
    })
}

#[tauri::command]
pub async fn export_workspace(
    state: State<'_, AppState>,
    options: ExportOptions,
) -> Result<String, AppError> {
    let ws_id = Uuid::parse_str(&options.workspace_id)
        .map_err(|e| AppError::DbError(format!("Invalid workspace ID: {}", e)))?;

    let ws = {
        let workspaces = state.workspaces.read().unwrap();
        workspaces
            .get(&ws_id)
            .cloned()
            .ok_or(AppError::WorkspaceNotFound(ws_id))?
    };

    // Extract data from DB
    let bundle = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
        build_export(&ws, db, &options)?
    };

    // Serialize off the main thread
    tokio::task::spawn_blocking(move || {
        let json = serde_json::to_string_pretty(&bundle)?;
        Ok(json)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    fn setup_db_with_data() -> (crate::db::Database, Uuid, Uuid) {
        let db = test_db();
        let (repo, ws) = insert_test_repo_and_workspace(&db);

        // Insert repo settings with env vars
        let mut settings = test_repo_settings();
        settings.setup_script = Some("npm install".to_string());
        settings
            .env_vars
            .insert("API_KEY".to_string(), "secret123".to_string());
        db.upsert_repo_settings(&repo.id, &settings).unwrap();

        // Insert chat messages
        let msg = test_chat_message(ws.id);
        db.insert_chat_message(&msg).unwrap();

        // Insert todos
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();

        // Insert bookmarks
        let bookmark = test_bookmark(repo.id);
        db.insert_bookmark(&bookmark).unwrap();

        // Insert snippets
        let snippet = test_snippet();
        db.insert_snippet(&snippet).unwrap();

        (db, repo.id, ws.id)
    }

    fn make_test_workspace(ws_id: Uuid, repo_id: Uuid) -> Workspace {
        use crate::models::workspace::WorkspaceStatus;
        use chrono::Utc;
        use std::path::PathBuf;

        Workspace {
            id: ws_id,
            repo_id,
            name: "test-workspace".to_string(),
            branch: "feature-branch".to_string(),
            worktree_path: PathBuf::from("/tmp/test"),
            status: WorkspaceStatus::Active,
            port_base: 10000,
            sparse_dirs: Some(vec!["src".to_string()]),
            notes: "test notes".to_string(),
            auto_commit: true,
            pinned: false,
            created_at: Utc::now(),
            archived_at: None,
            devcontainer_config: None,
        }
    }

    // ── build_export tests ──

    #[test]
    fn test_build_export_full() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: true,
            include_todos: true,
            include_repo_settings: true,
            include_env_vars: true,
            include_bookmarks: true,
            include_snippets: true,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        assert_eq!(bundle.format_version, 1);
        assert_eq!(bundle.workspace.name, "test-workspace");
        assert_eq!(bundle.workspace.branch, "feature-branch");
        assert_eq!(bundle.workspace.notes, "test notes");
        assert!(bundle.workspace.auto_commit);
        assert!(bundle.repo_settings.is_some());
        assert!(bundle.chat_messages.is_some());
        assert!(bundle.todos.is_some());
        assert!(bundle.bookmarks.is_some());
        assert!(bundle.snippets.is_some());

        // Verify env vars are included
        let settings = bundle.repo_settings.unwrap();
        let env_vars = settings.get("envVars").unwrap().as_object().unwrap();
        assert!(env_vars.contains_key("API_KEY"));
    }

    #[test]
    fn test_build_export_partial() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: true,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        assert!(bundle.chat_messages.is_none());
        assert!(bundle.todos.is_some());
        assert!(bundle.repo_settings.is_none());
        assert!(bundle.bookmarks.is_none());
        assert!(bundle.snippets.is_none());
    }

    #[test]
    fn test_build_export_excludes_env_vars() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: true,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        let settings = bundle.repo_settings.unwrap();
        let env_vars = settings.get("envVars").unwrap().as_object().unwrap();
        assert!(env_vars.is_empty());
    }

    #[test]
    fn test_build_export_format_version() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        assert_eq!(bundle.format_version, 1);
        assert_eq!(bundle.fury_version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn test_build_export_serializes_to_valid_json() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: true,
            include_todos: true,
            include_repo_settings: true,
            include_env_vars: true,
            include_bookmarks: true,
            include_snippets: true,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();
        let json = serde_json::to_string_pretty(&bundle).unwrap();
        let roundtrip: WorkspaceExportBundle = serde_json::from_str(&json).unwrap();

        assert_eq!(roundtrip.format_version, bundle.format_version);
        assert_eq!(roundtrip.workspace.name, bundle.workspace.name);
        assert_eq!(roundtrip.workspace.branch, bundle.workspace.branch);
    }

    #[test]
    fn test_build_export_sparse_dirs_preserved() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        assert_eq!(
            bundle.workspace.sparse_dirs,
            Some(vec!["src".to_string()])
        );
    }

    #[test]
    fn test_build_export_empty_db() {
        let db = test_db();
        let repo_id = Uuid::new_v4();
        let ws_id = Uuid::new_v4();

        // Insert just the repo so get_repo_settings doesn't fail
        let repo = crate::models::repository::Repository {
            id: repo_id,
            name: "empty-repo".to_string(),
            path: std::path::PathBuf::from("/tmp/empty"),
            default_branch: "main".to_string(),
            current_branch: None,
            provider: Default::default(),
            remote_url: None,
        };
        db.insert_repository(&repo).unwrap();

        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: true,
            include_todos: true,
            include_repo_settings: true,
            include_env_vars: true,
            include_bookmarks: true,
            include_snippets: true,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        // All sections present but empty arrays
        assert!(bundle.chat_messages.is_some());
        assert!(bundle.todos.is_some());
        assert!(bundle.repo_settings.is_some());
        assert!(bundle.bookmarks.is_some());
        assert!(bundle.snippets.is_some());

        // Verify they are empty arrays/objects
        let chats = bundle.chat_messages.unwrap();
        assert_eq!(chats.as_array().unwrap().len(), 0);
    }

    #[test]
    fn test_build_export_workspace_config_fields() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let ws = make_test_workspace(ws_id, repo_id);
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let bundle = build_export(&ws, &db, &options).unwrap();

        assert_eq!(bundle.workspace.name, "test-workspace");
        assert_eq!(bundle.workspace.branch, "feature-branch");
        assert_eq!(bundle.workspace.notes, "test notes");
        assert!(bundle.workspace.auto_commit);
        assert!(!bundle.workspace.created_at.is_empty());
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    #[tokio::test]
    async fn test_export_workspace_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();

        // Set up DB data and in-memory workspace
        let (repo_id, ws_id) = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (repo, ws) = insert_test_repo_and_workspace(db);

            // Insert repo settings
            let settings = test_repo_settings();
            db.upsert_repo_settings(&repo.id, &settings).unwrap();

            (repo.id, ws.id)
        };

        // Insert workspace into in-memory state (export_workspace reads from state.workspaces)
        let ws = make_test_workspace(ws_id, repo_id);
        state.workspaces.write().unwrap().insert(ws_id, ws);

        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: true,
            include_todos: true,
            include_repo_settings: true,
            include_env_vars: false,
            include_bookmarks: true,
            include_snippets: true,
        };

        let result = export_workspace(state, options).await;
        assert!(result.is_ok());

        // Result should be valid JSON
        let json_str = result.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(parsed["formatVersion"], 1);
        assert_eq!(parsed["workspace"]["name"], "test-workspace");
    }

    #[tokio::test]
    async fn test_export_workspace_command_not_found() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();

        let options = ExportOptions {
            workspace_id: Uuid::new_v4().to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let result = export_workspace(state, options).await;
        assert!(result.is_err());
    }
}
