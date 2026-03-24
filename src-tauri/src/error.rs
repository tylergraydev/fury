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

    #[error("Plugin operation failed: {0}")]
    PluginError(String),

    #[error("Copilot error: {0}")]
    CopilotError(String),

    #[error("Linear API error: {0}")]
    LinearError(String),

    #[error("Azure DevOps error: {0}")]
    AzureDevOpsError(String),

    #[error("Container error: {0}")]
    ContainerError(String),

    #[error("Path traversal denied: {0}")]
    PathTraversal(String),

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

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_display_repo_not_found() {
        let id = Uuid::new_v4();
        let err = AppError::RepoNotFound(id);
        assert_eq!(err.to_string(), format!("Repository not found: {}", id));
    }

    #[test]
    fn test_display_workspace_not_found() {
        let id = Uuid::new_v4();
        let err = AppError::WorkspaceNotFound(id);
        assert_eq!(err.to_string(), format!("Workspace not found: {}", id));
    }

    #[test]
    fn test_display_port_exhausted() {
        let err = AppError::PortExhausted;
        assert_eq!(
            err.to_string(),
            "Port allocation failed: no ports available"
        );
    }

    #[test]
    fn test_display_git_error() {
        let err = AppError::GitError("merge failed".to_string());
        assert_eq!(err.to_string(), "Git operation failed: merge failed");
    }

    #[test]
    fn test_display_db_error() {
        let err = AppError::DbError("connection lost".to_string());
        assert_eq!(err.to_string(), "Database error: connection lost");
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        assert!(matches!(app_err, AppError::IoError(_)));
        assert!(app_err.to_string().contains("file not found"));
    }

    #[test]
    fn test_from_json_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("invalid").unwrap_err();
        let app_err: AppError = json_err.into();
        assert!(matches!(app_err, AppError::JsonError(_)));
    }

    #[test]
    fn test_from_rusqlite_error() {
        let rusqlite_err = rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(1),
            Some("test error".to_string()),
        );
        let app_err: AppError = rusqlite_err.into();
        assert!(matches!(app_err, AppError::DbError(_)));
    }

    #[test]
    fn test_display_path_traversal() {
        let err = AppError::PathTraversal("escape attempt".to_string());
        assert_eq!(err.to_string(), "Path traversal denied: escape attempt");
    }

    #[test]
    fn test_serialize_produces_string() {
        let err = AppError::PortExhausted;
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"Port allocation failed: no ports available\"");
    }
}
