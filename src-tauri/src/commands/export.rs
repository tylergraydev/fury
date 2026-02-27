use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::export::{ExportOptions, WorkspaceExportBundle, WorkspaceExportConfig};
use crate::state::AppState;

#[tauri::command]
pub fn export_workspace(
    state: State<'_, AppState>,
    options: ExportOptions,
) -> Result<String, AppError> {
    let ws_id = Uuid::parse_str(&options.workspace_id)
        .map_err(|e| AppError::DbError(format!("Invalid workspace ID: {}", e)))?;

    let ws = {
        let workspaces = state.workspaces.lock().unwrap();
        workspaces
            .get(&ws_id)
            .cloned()
            .ok_or(AppError::WorkspaceNotFound(ws_id))?
    };

    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;

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
        let messages = db.list_chat_messages(&ws_id)?;
        Some(serde_json::to_value(&messages)?)
    } else {
        None
    };

    let todos = if options.include_todos {
        let items = db.list_todos(&ws_id)?;
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

    let bundle = WorkspaceExportBundle {
        fury_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        format_version: 1,
        workspace: workspace_config,
        repo_settings,
        chat_messages,
        todos,
        bookmarks,
        snippets,
    };

    let json = serde_json::to_string_pretty(&bundle)?;
    Ok(json)
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

    fn export_with_db(
        db: &crate::db::Database,
        ws_id: Uuid,
        repo_id: Uuid,
        options: ExportOptions,
    ) -> Result<String, AppError> {
        use crate::models::workspace::{Workspace, WorkspaceStatus};
        use chrono::Utc;
        use std::path::PathBuf;

        let ws = Workspace {
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
        };

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

        let bundle = WorkspaceExportBundle {
            fury_version: env!("CARGO_PKG_VERSION").to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            format_version: 1,
            workspace: workspace_config,
            repo_settings,
            chat_messages,
            todos,
            bookmarks,
            snippets,
        };

        serde_json::to_string_pretty(&bundle).map_err(AppError::from)
    }

    #[test]
    fn test_export_full() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: true,
            include_todos: true,
            include_repo_settings: true,
            include_env_vars: true,
            include_bookmarks: true,
            include_snippets: true,
        };

        let json = export_with_db(&db, ws_id, repo_id, options).unwrap();
        let bundle: WorkspaceExportBundle = serde_json::from_str(&json).unwrap();

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
    fn test_export_partial() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: true,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let json = export_with_db(&db, ws_id, repo_id, options).unwrap();
        let bundle: WorkspaceExportBundle = serde_json::from_str(&json).unwrap();

        assert!(bundle.chat_messages.is_none());
        assert!(bundle.todos.is_some());
        assert!(bundle.repo_settings.is_none());
        assert!(bundle.bookmarks.is_none());
        assert!(bundle.snippets.is_none());
    }

    #[test]
    fn test_export_excludes_env_vars() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: true,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let json = export_with_db(&db, ws_id, repo_id, options).unwrap();
        let bundle: WorkspaceExportBundle = serde_json::from_str(&json).unwrap();

        let settings = bundle.repo_settings.unwrap();
        let env_vars = settings.get("envVars").unwrap().as_object().unwrap();
        assert!(env_vars.is_empty());
    }

    #[test]
    fn test_export_format_version() {
        let (db, repo_id, ws_id) = setup_db_with_data();
        let options = ExportOptions {
            workspace_id: ws_id.to_string(),
            include_chat: false,
            include_todos: false,
            include_repo_settings: false,
            include_env_vars: false,
            include_bookmarks: false,
            include_snippets: false,
        };

        let json = export_with_db(&db, ws_id, repo_id, options).unwrap();
        let bundle: WorkspaceExportBundle = serde_json::from_str(&json).unwrap();

        assert_eq!(bundle.format_version, 1);
        assert_eq!(bundle.fury_version, env!("CARGO_PKG_VERSION"));
    }
}
