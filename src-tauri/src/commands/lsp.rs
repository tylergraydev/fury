use crate::error::AppError;
use crate::models::lsp::{
    InstallLspPluginRequest, LspCatalogEntry, LspPlugin, LspSuggestion, UninstallLspPluginRequest,
};
use crate::services::lsp as lsp_svc;

/// Get the LSP catalog (pure delegation, no state).
pub(crate) fn get_lsp_catalog_inner() -> Vec<LspCatalogEntry> {
    lsp_svc::get_lsp_catalog()
}

#[tauri::command]
#[specta::specta]
pub async fn get_lsp_catalog() -> Result<Vec<LspCatalogEntry>, AppError> {
    Ok(get_lsp_catalog_inner())
}

#[tauri::command]
#[specta::specta]
pub async fn list_lsp_plugins() -> Result<Vec<LspPlugin>, AppError> {
    tokio::task::spawn_blocking(lsp_svc::list_installed_lsp_plugins)
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn install_lsp_plugin(request: InstallLspPluginRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || lsp_svc::install_lsp_plugin(&request))
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_lsp_plugin(request: UninstallLspPluginRequest) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || lsp_svc::uninstall_lsp_plugin(&request))
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn detect_lsp_suggestions(repo_path: String) -> Result<Vec<LspSuggestion>, AppError> {
    tokio::task::spawn_blocking(move || lsp_svc::detect_lsp_suggestions(&repo_path))
        .await
        .map_err(|e| AppError::PluginError(format!("Task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::lsp::*;

    #[test]
    fn test_get_lsp_catalog_inner_returns_entries() {
        let catalog = get_lsp_catalog_inner();
        // The catalog should contain known entries (at least one)
        assert!(!catalog.is_empty(), "LSP catalog should not be empty");
        // Each entry should have required fields populated
        for entry in &catalog {
            assert!(!entry.plugin_name.is_empty());
            assert!(!entry.language.is_empty());
            assert!(!entry.binary_name.is_empty());
            assert!(!entry.extensions.is_empty());
            assert!(!entry.install_hint.is_empty());
        }
    }

    #[test]
    fn test_lsp_catalog_entry_serde_roundtrip() {
        let entry = LspCatalogEntry {
            plugin_name: "typescript-lsp".to_string(),
            language: "TypeScript".to_string(),
            binary_name: "typescript-language-server".to_string(),
            extensions: vec![".ts".to_string(), ".tsx".to_string()],
            install_hint: "npm install -g typescript-language-server".to_string(),
        };
        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: LspCatalogEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.plugin_name, "typescript-lsp");
        assert_eq!(deserialized.extensions.len(), 2);
    }

    #[test]
    fn test_lsp_plugin_serde_roundtrip() {
        let plugin = LspPlugin {
            name: "rust-analyzer-lsp".to_string(),
            scope: "user".to_string(),
            enabled: true,
            binary_found: false,
            binary_name: "rust-analyzer".to_string(),
            install_hint: "rustup component add rust-analyzer".to_string(),
        };
        let json = serde_json::to_string(&plugin).unwrap();
        let deserialized: LspPlugin = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "rust-analyzer-lsp");
        assert!(deserialized.enabled);
        assert!(!deserialized.binary_found);
    }

    #[test]
    fn test_install_lsp_plugin_request_serde() {
        let request = InstallLspPluginRequest {
            plugin_name: "pyright-lsp".to_string(),
            scope: "project".to_string(),
        };
        let json = serde_json::to_string(&request).unwrap();
        let deserialized: InstallLspPluginRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.plugin_name, "pyright-lsp");
        assert_eq!(deserialized.scope, "project");
    }

    #[test]
    fn test_uninstall_lsp_plugin_request_serde() {
        let request = UninstallLspPluginRequest {
            plugin_name: "pyright-lsp".to_string(),
            scope: "user".to_string(),
        };
        let json = serde_json::to_string(&request).unwrap();
        let deserialized: UninstallLspPluginRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.plugin_name, "pyright-lsp");
        assert_eq!(deserialized.scope, "user");
    }

    #[test]
    fn test_lsp_suggestion_serde_roundtrip() {
        let suggestion = LspSuggestion {
            plugin_name: "golang-lsp".to_string(),
            language: "Go".to_string(),
            file_count: 100,
            binary_name: "gopls".to_string(),
            install_hint: "go install golang.org/x/tools/gopls@latest".to_string(),
        };
        let json = serde_json::to_string(&suggestion).unwrap();
        let deserialized: LspSuggestion = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.plugin_name, "golang-lsp");
        assert_eq!(deserialized.file_count, 100);
    }

    #[test]
    fn test_catalog_has_no_duplicate_plugin_names() {
        let catalog = get_lsp_catalog_inner();
        let mut seen = std::collections::HashSet::new();
        for entry in &catalog {
            assert!(
                seen.insert(&entry.plugin_name),
                "Duplicate plugin name: {}",
                entry.plugin_name
            );
        }
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_get_lsp_catalog_command() {
        let result = get_lsp_catalog().await;
        assert!(result.is_ok());
        let catalog = result.unwrap();
        assert!(!catalog.is_empty());
        for entry in &catalog {
            assert!(!entry.plugin_name.is_empty());
            assert!(!entry.language.is_empty());
        }
    }
}
