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
