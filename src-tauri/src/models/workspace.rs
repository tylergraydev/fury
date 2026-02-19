use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkspaceStatus {
    Creating,
    Active,
    Archived,
    Error(String),
}

impl WorkspaceStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Creating => "creating",
            Self::Active => "active",
            Self::Archived => "archived",
            Self::Error(_) => "error",
        }
    }

    pub fn from_str(s: &str, error_msg: Option<String>) -> Self {
        match s {
            "creating" => Self::Creating,
            "active" => Self::Active,
            "archived" => Self::Archived,
            "error" => Self::Error(error_msg.unwrap_or_default()),
            _ => Self::Active,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub name: String,
    pub branch: String,
    pub worktree_path: PathBuf,
    pub status: WorkspaceStatus,
    pub port_base: u16,
    pub sparse_dirs: Option<Vec<String>>,
    pub notes: String,
    pub created_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub repo_id: Uuid,
    pub workspace_name: String,
    pub branch_name: String,
    pub sparse_dirs: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub name: String,
    pub branch: String,
    pub status: WorkspaceStatus,
    pub port_base: u16,
    pub created_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

impl From<&Workspace> for WorkspaceInfo {
    fn from(ws: &Workspace) -> Self {
        Self {
            id: ws.id,
            repo_id: ws.repo_id,
            name: ws.name.clone(),
            branch: ws.branch.clone(),
            status: ws.status.clone(),
            port_base: ws.port_base,
            created_at: ws.created_at,
            archived_at: ws.archived_at,
        }
    }
}
