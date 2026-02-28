use uuid::Uuid;

use crate::error::AppError;
use crate::models::mcp::{
    AddMcpRequest, CursorMigrationResult, CursorRulesImportResult, McpScope, McpServer,
    RemoveMcpRequest,
};
use crate::models::settings::AppSettings;
use crate::services::claude_context as ctx_svc;
use crate::services::cursor_migration;
use crate::services::mcp as mcp_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_mcp_servers(scope: Option<String>) -> Result<Vec<McpServer>, AppError> {
    let mcp_scope = match scope.as_deref() {
        Some("project") => McpScope::Project,
        _ => McpScope::User,
    };
    tokio::task::spawn_blocking(move || mcp_svc::list_mcp_servers(&mcp_scope))
        .await
        .map_err(|e| AppError::McpError(format!("Task failed: {}", e)))?
}

#[tauri::command]
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
pub async fn remove_mcp_server(request: RemoveMcpRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        mcp_svc::remove_mcp_server(&request.name, &request.scope)
    })
    .await
    .map_err(|e| AppError::McpError(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub fn detect_cursor_config() -> Result<bool, AppError> {
    Ok(cursor_migration::detect_cursor_config().is_some())
}

#[tauri::command]
pub fn import_cursor_config() -> Result<CursorMigrationResult, AppError> {
    cursor_migration::import_cursor_mcp_servers()
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    let settings = state.settings.read().unwrap();
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    let old_settings = state.settings.read().unwrap().clone();

    // Persist to database
    let db_guard = state.db.lock().unwrap();
    if let Some(ref db) = *db_guard {
        db.save_app_settings(&settings)?;
    }
    drop(db_guard);

    // Update in-memory state
    {
        let mut current = state.settings.write().unwrap();
        *current = settings.clone();
    }

    // Handle Claude Context MCP server registration changes
    let was_enabled = old_settings.claude_context.enabled;
    let now_enabled = settings.claude_context.enabled;
    let creds_changed = old_settings.claude_context.openai_api_key
        != settings.claude_context.openai_api_key
        || old_settings.claude_context.zilliz_uri != settings.claude_context.zilliz_uri
        || old_settings.claude_context.zilliz_token != settings.claude_context.zilliz_token;

    if now_enabled && (!was_enabled || creds_changed) {
        let ctx_settings = settings.claude_context.clone();
        std::thread::spawn(move || {
            if let Err(e) = ctx_svc::ensure_mcp_server_registered(&ctx_settings) {
                eprintln!("[claude-context] Failed to register MCP server: {}", e);
            }
        });
    } else if !now_enabled && was_enabled {
        std::thread::spawn(|| {
            if let Err(e) = ctx_svc::remove_mcp_server_registration() {
                eprintln!("[claude-context] Failed to remove MCP server: {}", e);
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub fn detect_cursorrules(state: State<'_, AppState>, repo_id: String) -> Result<bool, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let repos = state.repositories.read().unwrap();
    let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
    Ok(cursor_migration::detect_cursorrules(&repo.path))
}

#[tauri::command]
pub fn import_cursorrules(
    state: State<'_, AppState>,
    repo_id: String,
    overwrite: bool,
) -> Result<CursorRulesImportResult, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let repos = state.repositories.read().unwrap();
    let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
    cursor_migration::import_cursorrules(&repo.path, overwrite)
}
