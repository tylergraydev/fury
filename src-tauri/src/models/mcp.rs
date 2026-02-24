use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpScope {
    #[default]
    User,
    Project,
}

impl McpScope {
    pub fn as_str(&self) -> &str {
        match self {
            McpScope::User => "user",
            McpScope::Project => "project",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub scope: McpScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMcpRequest {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub scope: McpScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveMcpRequest {
    pub name: String,
    pub scope: McpScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorMigrationResult {
    pub mcp_servers_found: usize,
    pub mcp_servers_imported: usize,
    pub rules_found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorRulesImportResult {
    pub rules_found: bool,
    pub claude_md_existed: bool,
    pub written: bool,
    pub claude_md_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_scope_as_str() {
        assert_eq!(McpScope::User.as_str(), "user");
        assert_eq!(McpScope::Project.as_str(), "project");
    }

    #[test]
    fn test_mcp_scope_default_is_user() {
        assert_eq!(McpScope::default(), McpScope::User);
    }

    #[test]
    fn test_mcp_server_serde_roundtrip() {
        let server = McpServer {
            name: "test-server".to_string(),
            command: "node".to_string(),
            args: vec!["server.js".to_string()],
            env: HashMap::from([("PORT".to_string(), "3000".to_string())]),
            scope: McpScope::Project,
        };
        let json = serde_json::to_string(&server).unwrap();
        let deserialized: McpServer = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test-server");
        assert_eq!(deserialized.scope, McpScope::Project);
    }
}
