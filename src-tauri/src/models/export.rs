use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub workspace_id: String,
    pub include_chat: bool,
    pub include_todos: bool,
    pub include_repo_settings: bool,
    pub include_env_vars: bool,
    pub include_bookmarks: bool,
    pub include_snippets: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExportBundle {
    pub fury_version: String,
    pub exported_at: String,
    pub format_version: u32,
    pub workspace: WorkspaceExportConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_settings: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_messages: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todos: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bookmarks: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippets: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExportConfig {
    pub name: String,
    pub branch: String,
    pub sparse_dirs: Option<Vec<String>>,
    pub notes: String,
    pub auto_commit: bool,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_options_serde_roundtrip() {
        let opts = ExportOptions {
            workspace_id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            include_chat: true,
            include_todos: true,
            include_repo_settings: true,
            include_env_vars: false,
            include_bookmarks: true,
            include_snippets: false,
        };
        let json = serde_json::to_string(&opts).unwrap();
        let deserialized: ExportOptions = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.workspace_id, opts.workspace_id);
        assert!(deserialized.include_chat);
        assert!(!deserialized.include_env_vars);
        assert!(!deserialized.include_snippets);
    }

    #[test]
    fn test_workspace_export_bundle_serde_roundtrip() {
        let bundle = WorkspaceExportBundle {
            fury_version: "1.0.0".to_string(),
            exported_at: "2025-01-01T00:00:00Z".to_string(),
            format_version: 1,
            workspace: WorkspaceExportConfig {
                name: "test-ws".to_string(),
                branch: "main".to_string(),
                sparse_dirs: Some(vec!["src".to_string()]),
                notes: "some notes".to_string(),
                auto_commit: true,
                created_at: "2025-01-01T00:00:00Z".to_string(),
            },
            repo_settings: None,
            chat_messages: Some(serde_json::json!([{"role": "user", "content": "hi"}])),
            todos: None,
            bookmarks: None,
            snippets: None,
        };
        let json = serde_json::to_string(&bundle).unwrap();
        let deserialized: WorkspaceExportBundle = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.fury_version, "1.0.0");
        assert_eq!(deserialized.format_version, 1);
        assert_eq!(deserialized.workspace.name, "test-ws");
        assert!(deserialized.repo_settings.is_none());
        assert!(deserialized.chat_messages.is_some());
        assert!(deserialized.todos.is_none());
    }

    #[test]
    fn test_bundle_skip_serializing_none() {
        let bundle = WorkspaceExportBundle {
            fury_version: "1.0.0".to_string(),
            exported_at: "2025-01-01T00:00:00Z".to_string(),
            format_version: 1,
            workspace: WorkspaceExportConfig {
                name: "ws".to_string(),
                branch: "main".to_string(),
                sparse_dirs: None,
                notes: String::new(),
                auto_commit: false,
                created_at: "2025-01-01T00:00:00Z".to_string(),
            },
            repo_settings: None,
            chat_messages: None,
            todos: None,
            bookmarks: None,
            snippets: None,
        };
        let json = serde_json::to_string(&bundle).unwrap();
        assert!(!json.contains("repoSettings"));
        assert!(!json.contains("chatMessages"));
        assert!(!json.contains("todos"));
        assert!(!json.contains("bookmarks"));
        assert!(!json.contains("snippets"));
    }
}
