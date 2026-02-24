use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    pub auto_commit: bool,
    pub pinned: bool,
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
    pub base_branch: Option<String>,
    pub auto_commit: Option<bool>,
    pub fetch_remote_branch: Option<bool>,
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
    pub auto_commit: bool,
    pub pinned: bool,
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
            auto_commit: ws.auto_commit,
            pinned: ws.pinned,
            created_at: ws.created_at,
            archived_at: ws.archived_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_status_as_str() {
        assert_eq!(WorkspaceStatus::Creating.as_str(), "creating");
        assert_eq!(WorkspaceStatus::Active.as_str(), "active");
        assert_eq!(WorkspaceStatus::Archived.as_str(), "archived");
        assert_eq!(WorkspaceStatus::Error("oops".into()).as_str(), "error");
    }

    #[test]
    fn test_workspace_status_from_str_known() {
        assert_eq!(
            WorkspaceStatus::from_str("creating", None),
            WorkspaceStatus::Creating
        );
        assert_eq!(
            WorkspaceStatus::from_str("active", None),
            WorkspaceStatus::Active
        );
        assert_eq!(
            WorkspaceStatus::from_str("archived", None),
            WorkspaceStatus::Archived
        );
    }

    #[test]
    fn test_workspace_status_from_str_error_with_message() {
        let status = WorkspaceStatus::from_str("error", Some("something broke".to_string()));
        assert_eq!(
            status,
            WorkspaceStatus::Error("something broke".to_string())
        );
    }

    #[test]
    fn test_workspace_status_from_str_error_without_message() {
        let status = WorkspaceStatus::from_str("error", None);
        assert_eq!(status, WorkspaceStatus::Error(String::new()));
    }

    #[test]
    fn test_workspace_status_from_str_unknown_defaults_to_active() {
        assert_eq!(
            WorkspaceStatus::from_str("invalid", None),
            WorkspaceStatus::Active
        );
    }

    #[test]
    fn test_workspace_info_from_workspace() {
        let ws = crate::test_helpers::test_workspace(Uuid::new_v4());
        let info = WorkspaceInfo::from(&ws);
        assert_eq!(info.id, ws.id);
        assert_eq!(info.repo_id, ws.repo_id);
        assert_eq!(info.name, ws.name);
        assert_eq!(info.branch, ws.branch);
        assert_eq!(info.status, ws.status);
        assert_eq!(info.port_base, ws.port_base);
        assert_eq!(info.auto_commit, ws.auto_commit);
        assert_eq!(info.pinned, ws.pinned);
    }

    #[test]
    fn test_workspace_serde_roundtrip() {
        let ws = crate::test_helpers::test_workspace(Uuid::new_v4());
        let json = serde_json::to_string(&ws).unwrap();
        let deserialized: Workspace = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, ws.id);
        assert_eq!(deserialized.name, ws.name);
    }
}
