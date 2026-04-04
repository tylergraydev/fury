use serde::{Deserialize, Serialize};

/// A catalog entry for a known official LSP plugin.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LspCatalogEntry {
    pub plugin_name: String,
    pub language: String,
    pub binary_name: String,
    pub extensions: Vec<String>,
    pub install_hint: String,
}

/// An installed LSP plugin with runtime status.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LspPlugin {
    pub name: String,
    pub scope: String,
    pub enabled: bool,
    pub binary_found: bool,
    pub binary_name: String,
    pub install_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct InstallLspPluginRequest {
    pub plugin_name: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UninstallLspPluginRequest {
    pub plugin_name: String,
    pub scope: String,
}

/// A suggestion for an LSP plugin based on workspace file analysis.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LspSuggestion {
    pub plugin_name: String,
    pub language: String,
    pub file_count: usize,
    pub binary_name: String,
    pub install_hint: String,
}

#[cfg(test)]
mod tests {
    use super::*;

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
            name: "typescript-lsp".to_string(),
            scope: "user".to_string(),
            enabled: true,
            binary_found: true,
            binary_name: "typescript-language-server".to_string(),
            install_hint: "npm install -g typescript-language-server".to_string(),
        };
        let json = serde_json::to_string(&plugin).unwrap();
        let deserialized: LspPlugin = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "typescript-lsp");
        assert!(deserialized.enabled);
        assert!(deserialized.binary_found);
    }

    #[test]
    fn test_install_request_serde_roundtrip() {
        let request = InstallLspPluginRequest {
            plugin_name: "rust-analyzer-lsp".to_string(),
            scope: "user".to_string(),
        };
        let json = serde_json::to_string(&request).unwrap();
        let deserialized: InstallLspPluginRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.plugin_name, "rust-analyzer-lsp");
        assert_eq!(deserialized.scope, "user");
    }

    #[test]
    fn test_lsp_suggestion_serde_roundtrip() {
        let suggestion = LspSuggestion {
            plugin_name: "pyright-lsp".to_string(),
            language: "Python".to_string(),
            file_count: 42,
            binary_name: "pyright-langserver".to_string(),
            install_hint: "npm install -g pyright".to_string(),
        };
        let json = serde_json::to_string(&suggestion).unwrap();
        let deserialized: LspSuggestion = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.file_count, 42);
    }
}
