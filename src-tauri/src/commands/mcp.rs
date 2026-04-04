use std::collections::HashMap;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::mcp::{
    AddMcpRequest, CursorMigrationResult, CursorRulesImportResult, McpScope, McpServer,
    RemoveMcpRequest,
};
use crate::models::settings::{AppSettings, ClaudeContextSettings};
use crate::services::claude_context as ctx_svc;
use crate::services::cursor_migration;
use crate::services::mcp as mcp_svc;
use crate::state::AppState;
use tauri::State;

/// Parse an optional scope string into McpScope.
pub(crate) fn parse_mcp_scope(scope: Option<&str>) -> McpScope {
    match scope {
        Some("project") => McpScope::Project,
        _ => McpScope::User,
    }
}

/// Resolve a repo path from state given a repo_id string.
pub(crate) fn resolve_repo_path(
    repositories: &HashMap<Uuid, crate::models::repository::Repository>,
    repo_id: &str,
) -> Result<std::path::PathBuf, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let repo = repositories.get(&id).ok_or(AppError::RepoNotFound(id))?;
    Ok(repo.path.clone())
}

/// Persist settings to DB and update in-memory state. Returns (old_settings, new_settings).
pub(crate) fn update_app_settings_inner(
    db: Option<&crate::db::Database>,
    _old_settings: &AppSettings,
    new_settings: &AppSettings,
) -> Result<(), AppError> {
    if let Some(db) = db {
        db.save_app_settings(new_settings)?;
    }
    Ok(())
}

/// Determine what MCP server registration action to take based on settings changes.
#[derive(Debug, PartialEq)]
pub(crate) enum McpRegistrationAction {
    /// No action needed
    None,
    /// Register or re-register the MCP server
    Register(ClaudeContextSettings),
    /// Remove the MCP server registration
    Remove,
}

pub(crate) fn compute_mcp_registration_action(
    old: &AppSettings,
    new: &AppSettings,
) -> McpRegistrationAction {
    let was_enabled = old.claude_context.enabled;
    let now_enabled = new.claude_context.enabled;
    let creds_changed = old.claude_context.openai_api_key != new.claude_context.openai_api_key
        || old.claude_context.zilliz_uri != new.claude_context.zilliz_uri
        || old.claude_context.zilliz_token != new.claude_context.zilliz_token;

    if now_enabled && (!was_enabled || creds_changed) {
        McpRegistrationAction::Register(new.claude_context.clone())
    } else if !now_enabled && was_enabled {
        McpRegistrationAction::Remove
    } else {
        McpRegistrationAction::None
    }
}

#[tauri::command]
#[specta::specta]
pub async fn list_mcp_servers(scope: Option<String>) -> Result<Vec<McpServer>, AppError> {
    let mcp_scope = parse_mcp_scope(scope.as_deref());
    tokio::task::spawn_blocking(move || mcp_svc::list_mcp_servers(&mcp_scope))
        .await
        .map_err(|e| AppError::McpError(format!("Task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn add_mcp_server(request: AddMcpRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        mcp_svc::add_mcp_server(
            &request.name,
            &request.command,
            &request.args,
            &request.env,
            &request.scope,
        )
    })
    .await
    .map_err(|e| AppError::McpError(format!("Task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn remove_mcp_server(request: RemoveMcpRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        mcp_svc::remove_mcp_server(&request.name, &request.scope)
    })
    .await
    .map_err(|e| AppError::McpError(format!("Task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn detect_cursor_config() -> Result<bool, AppError> {
    tokio::task::spawn_blocking(|| Ok(cursor_migration::detect_cursor_config().is_some()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn import_cursor_config() -> Result<CursorMigrationResult, AppError> {
    tokio::task::spawn_blocking(cursor_migration::import_cursor_mcp_servers)
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    let settings = state.settings.read().unwrap().clone();
    Ok(settings)
}

#[tauri::command]
#[specta::specta]
pub async fn update_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    let old_settings = state.settings.read().unwrap().clone();

    // Persist to database
    let old_settings_clone = old_settings.clone();
    let settings_clone = settings.clone();
    state.with_db(move |db| {
        update_app_settings_inner(Some(db), &old_settings_clone, &settings_clone)
    }).await?;

    // Update in-memory state
    {
        let mut current = state.settings.write().unwrap();
        *current = settings.clone();
    }

    // Handle Claude Context MCP server registration changes
    match compute_mcp_registration_action(&old_settings, &settings) {
        McpRegistrationAction::Register(ctx_settings) => {
            std::thread::spawn(move || {
                if let Err(e) = ctx_svc::ensure_mcp_server_registered(&ctx_settings) {
                    eprintln!("[claude-context] Failed to register MCP server: {}", e);
                }
            });
        }
        McpRegistrationAction::Remove => {
            std::thread::spawn(|| {
                if let Err(e) = ctx_svc::remove_mcp_server_registration() {
                    eprintln!("[claude-context] Failed to remove MCP server: {}", e);
                }
            });
        }
        McpRegistrationAction::None => {}
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_last_active_context(
    state: State<'_, AppState>,
) -> Result<(Option<String>, Option<String>), AppError> {
    let db = state.db.lock().unwrap();
    db.as_ref()
        .ok_or_else(|| AppError::DbError("DB not initialized".into()))?
        .get_last_active_context()
}

#[tauri::command]
#[specta::specta]
pub async fn save_last_active_context(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
    repo_id: Option<String>,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.as_ref()
        .ok_or_else(|| AppError::DbError("DB not initialized".into()))?
        .save_last_active_context(workspace_id.as_deref(), repo_id.as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn detect_cursorrules(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<bool, AppError> {
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        resolve_repo_path(&repos, &repo_id)?
    };
    tokio::task::spawn_blocking(move || Ok(cursor_migration::detect_cursorrules(&repo_path)))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn import_cursorrules(
    state: State<'_, AppState>,
    repo_id: String,
    overwrite: bool,
) -> Result<CursorRulesImportResult, AppError> {
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        resolve_repo_path(&repos, &repo_id)?
    };
    tokio::task::spawn_blocking(move || cursor_migration::import_cursorrules(&repo_path, overwrite))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_parse_mcp_scope_project() {
        assert_eq!(parse_mcp_scope(Some("project")), McpScope::Project);
    }

    #[test]
    fn test_parse_mcp_scope_user_explicit() {
        assert_eq!(parse_mcp_scope(Some("user")), McpScope::User);
    }

    #[test]
    fn test_parse_mcp_scope_none() {
        assert_eq!(parse_mcp_scope(None), McpScope::User);
    }

    #[test]
    fn test_parse_mcp_scope_unknown_defaults_to_user() {
        assert_eq!(parse_mcp_scope(Some("unknown")), McpScope::User);
    }

    #[test]
    fn test_resolve_repo_path_valid() {
        let repo = test_repo();
        let mut repos = HashMap::new();
        let id = repo.id;
        let expected_path = repo.path.clone();
        repos.insert(id, repo);
        let result = resolve_repo_path(&repos, &id.to_string()).unwrap();
        assert_eq!(result, expected_path);
    }

    #[test]
    fn test_resolve_repo_path_invalid_uuid() {
        let repos = HashMap::new();
        let result = resolve_repo_path(&repos, "not-a-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_repo_path_not_found() {
        let repos = HashMap::new();
        let fake_id = Uuid::new_v4().to_string();
        let result = resolve_repo_path(&repos, &fake_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_app_settings_inner_persists_to_db() {
        let db = test_db();
        let old = AppSettings::default();
        let mut new = AppSettings::default();
        new.analytics_enabled = true;
        update_app_settings_inner(Some(&db), &old, &new).unwrap();
        // Verify persisted
        let loaded = db.get_app_settings().unwrap();
        assert!(loaded.analytics_enabled);
    }

    #[test]
    fn test_update_app_settings_inner_no_db() {
        let old = AppSettings::default();
        let new = AppSettings::default();
        // Should not error when db is None
        let result = update_app_settings_inner(None, &old, &new);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compute_mcp_action_enable() {
        let old = AppSettings::default();
        let mut new = AppSettings::default();
        new.claude_context.enabled = true;
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::Register(new.claude_context.clone())
        );
    }

    #[test]
    fn test_compute_mcp_action_disable() {
        let mut old = AppSettings::default();
        old.claude_context.enabled = true;
        let new = AppSettings::default();
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::Remove
        );
    }

    #[test]
    fn test_compute_mcp_action_creds_changed() {
        let mut old = AppSettings::default();
        old.claude_context.enabled = true;
        old.claude_context.openai_api_key = Some("old-key".to_string());
        let mut new = AppSettings::default();
        new.claude_context.enabled = true;
        new.claude_context.openai_api_key = Some("new-key".to_string());
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::Register(new.claude_context.clone())
        );
    }

    #[test]
    fn test_compute_mcp_action_no_change() {
        let old = AppSettings::default();
        let new = AppSettings::default();
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::None
        );
    }

    #[test]
    fn test_compute_mcp_action_both_enabled_no_cred_change() {
        let mut old = AppSettings::default();
        old.claude_context.enabled = true;
        old.claude_context.openai_api_key = Some("key".to_string());
        let mut new = AppSettings::default();
        new.claude_context.enabled = true;
        new.claude_context.openai_api_key = Some("key".to_string());
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::None
        );
    }

    #[test]
    fn test_compute_mcp_action_zilliz_uri_changed() {
        let mut old = AppSettings::default();
        old.claude_context.enabled = true;
        old.claude_context.zilliz_uri = Some("old-uri".to_string());
        let mut new = AppSettings::default();
        new.claude_context.enabled = true;
        new.claude_context.zilliz_uri = Some("new-uri".to_string());
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::Register(new.claude_context.clone())
        );
    }

    #[test]
    fn test_compute_mcp_action_zilliz_token_changed() {
        let mut old = AppSettings::default();
        old.claude_context.enabled = true;
        old.claude_context.zilliz_token = Some("old-token".to_string());
        let mut new = AppSettings::default();
        new.claude_context.enabled = true;
        new.claude_context.zilliz_token = Some("new-token".to_string());
        assert_eq!(
            compute_mcp_registration_action(&old, &new),
            McpRegistrationAction::Register(new.claude_context.clone())
        );
    }

    #[test]
    fn test_add_mcp_request_serde_roundtrip() {
        let request = AddMcpRequest {
            name: "test".to_string(),
            command: "node".to_string(),
            args: vec!["server.js".to_string()],
            env: HashMap::from([("KEY".to_string(), "VAL".to_string())]),
            scope: McpScope::Project,
        };
        let json = serde_json::to_string(&request).unwrap();
        let deserialized: AddMcpRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test");
        assert_eq!(deserialized.scope, McpScope::Project);
    }

    #[test]
    fn test_remove_mcp_request_serde_roundtrip() {
        let request = RemoveMcpRequest {
            name: "test".to_string(),
            scope: McpScope::User,
        };
        let json = serde_json::to_string(&request).unwrap();
        let deserialized: RemoveMcpRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test");
        assert_eq!(deserialized.scope, McpScope::User);
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_get_app_settings_command() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = get_app_settings(state).await;
        assert!(result.is_ok());
        let settings = result.unwrap();
        // Default settings should be returned
        assert!(!settings.analytics_enabled);
    }

    #[tokio::test]
    async fn test_get_app_settings_command_reflects_state() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        // Modify in-memory settings
        {
            let mut s = state.settings.write().unwrap();
            s.analytics_enabled = true;
        }

        let result = get_app_settings(state).await;
        assert!(result.is_ok());
        assert!(result.unwrap().analytics_enabled);
    }

    #[tokio::test]
    async fn test_detect_cursorrules_command_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let fake_id = uuid::Uuid::new_v4().to_string();
        let result = detect_cursorrules(state, fake_id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_detect_cursorrules_command_with_repo() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let repo = test_repo();
        state.repositories.write().unwrap().insert(repo.id, repo.clone());

        let result = detect_cursorrules(state, repo.id.to_string()).await;
        assert!(result.is_ok());
        // test repo path doesn't exist, so no cursorrules detected
        assert!(!result.unwrap());
    }

    // -----------------------------------------------------------------------
    // Additional async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_update_app_settings() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let mut settings = AppSettings::default();
        settings.analytics_enabled = true;

        let result = update_app_settings(state, settings).await;
        assert!(result.is_ok());

        // Verify in-memory state was updated
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let loaded = get_app_settings(state2).await.unwrap();
        assert!(loaded.analytics_enabled);
    }

    #[tokio::test]
    async fn test_cmd_update_app_settings_persists_to_db() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let mut settings = AppSettings::default();
        settings.analytics_enabled = true;
        update_app_settings(state, settings).await.unwrap();

        // Verify persisted in DB
        let app_state = app.state::<crate::state::AppState>();
        let db_lock = app_state.db.lock().unwrap();
        let db = db_lock.as_ref().unwrap();
        let loaded = db.get_app_settings().unwrap();
        assert!(loaded.analytics_enabled);
    }

    #[tokio::test]
    async fn test_cmd_import_cursorrules_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = import_cursorrules(state, Uuid::new_v4().to_string(), false).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_import_cursorrules_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = import_cursorrules(state, "bad-id".to_string(), false).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_detect_cursorrules_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_cursorrules(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_update_app_settings_multiple_times() {
        use tauri::Manager;
        let app = mock_app_with_state();

        // Update once
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let mut settings1 = AppSettings::default();
        settings1.analytics_enabled = true;
        update_app_settings(state, settings1).await.unwrap();

        // Update again
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let mut settings2 = AppSettings::default();
        settings2.analytics_enabled = false;
        update_app_settings(state2, settings2).await.unwrap();

        // Verify final state
        let state3: tauri::State<'_, crate::state::AppState> = app.state();
        let loaded = get_app_settings(state3).await.unwrap();
        assert!(!loaded.analytics_enabled);
    }

    #[tokio::test]
    async fn test_cmd_import_cursorrules_with_real_dir() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();

        // Create a temp dir with a .cursorrules file
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".cursorrules"), "some cursor rules").unwrap();

        let mut repo = test_repo();
        repo.path = dir.path().to_path_buf();
        let repo_id = repo.id;
        state_ref.repositories.write().unwrap().insert(repo_id, repo);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = import_cursorrules(state, repo_id.to_string(), false).await;
        assert!(result.is_ok());
    }
}
