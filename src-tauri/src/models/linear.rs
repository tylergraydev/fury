use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub state_name: Option<String>,
    pub priority: Option<i32>,
    pub team_name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkIssueRequest {
    pub workspace_id: String,
    pub issue_id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkIssueRequest {
    pub workspace_id: String,
    pub issue_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIssue {
    pub workspace_id: String,
    pub issue_id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub linked_at: String,
}
