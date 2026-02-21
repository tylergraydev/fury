use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Repository not found: {0}")]
    RepoNotFound(uuid::Uuid),

    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(uuid::Uuid),

    #[error("Git operation failed: {0}")]
    GitError(String),

    #[error("Agent process error: {0}")]
    AgentError(String),

    #[error("Script execution failed: {0}")]
    ScriptError(String),

    #[error("Port allocation failed: no ports available")]
    PortExhausted,

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Database error: {0}")]
    DbError(String),

    #[error("Checkpoint error: {0}")]
    CheckpointError(String),

    #[error("Branch already in use by workspace: {0}")]
    BranchInUse(String),

    #[error("PR operation failed: {0}")]
    PrError(String),

    #[error("MCP operation failed: {0}")]
    McpError(String),

    #[error("Copilot error: {0}")]
    CopilotError(String),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

// Tauri commands require the error to implement Serialize
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::DbError(e.to_string())
    }
}
