use crate::error::AppError;
use crate::models::lsp::{
    InstallLspPluginRequest, LspCatalogEntry, LspPlugin, LspSuggestion, UninstallLspPluginRequest,
};
use crate::services::lsp as lsp_svc;

#[tauri::command]
pub async fn get_lsp_catalog() -> Result<Vec<LspCatalogEntry>, AppError> {
    Ok(lsp_svc::get_lsp_catalog())
}

#[tauri::command]
pub async fn list_lsp_plugins() -> Result<Vec<LspPlugin>, AppError> {
    tokio::task::spawn_blocking(lsp_svc::list_installed_lsp_plugins)
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn install_lsp_plugin(request: InstallLspPluginRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || lsp_svc::install_lsp_plugin(&request))
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn uninstall_lsp_plugin(request: UninstallLspPluginRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || lsp_svc::uninstall_lsp_plugin(&request))
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn detect_lsp_suggestions(repo_path: String) -> Result<Vec<LspSuggestion>, AppError> {
    tokio::task::spawn_blocking(move || lsp_svc::detect_lsp_suggestions(&repo_path))
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}
