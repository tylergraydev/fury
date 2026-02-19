use crate::error::AppError;
use crate::models::mcp::{
    AddMcpRequest, CursorMigrationResult, McpScope, McpServer, RemoveMcpRequest,
};
use crate::models::settings::AppSettings;
use crate::services::cursor_migration;
use crate::services::mcp as mcp_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_mcp_servers(scope: Option<String>) -> Result<Vec<McpServer>, AppError> {
    let mcp_scope = match scope.as_deref() {
        Some("project") => McpScope::Project,
        _ => McpScope::Global,
    };
    mcp_svc::list_mcp_servers(&mcp_scope)
}

#[tauri::command]
pub fn add_mcp_server(request: AddMcpRequest) -> Result<(), AppError> {
    mcp_svc::add_mcp_server(
        &request.name,
        &request.command,
        &request.args,
        &request.env,
        &request.scope,
    )
}

#[tauri::command]
pub fn remove_mcp_server(request: RemoveMcpRequest) -> Result<(), AppError> {
    mcp_svc::remove_mcp_server(&request.name, &request.scope)
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
    let settings = state.settings.lock().unwrap();
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    // Persist to database
    let db_guard = state.db.lock().unwrap();
    if let Some(ref db) = *db_guard {
        db.save_app_settings(&settings)?;
    }

    // Update in-memory state
    let mut current = state.settings.lock().unwrap();
    *current = settings;

    Ok(())
}
