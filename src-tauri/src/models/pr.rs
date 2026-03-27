use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrInfo {
    pub workspace_id: Uuid,
    pub pr_number: Option<u64>,
    pub pr_url: Option<String>,
    pub title: Option<String>,
    pub state: Option<String>,
    pub checks: Vec<PrCheck>,
    pub mergeable: Option<String>,
}

impl PrInfo {
    pub fn empty(workspace_id: Uuid) -> Self {
        Self {
            workspace_id,
            pr_number: None,
            pr_url: None,
            title: None,
            state: None,
            checks: Vec::new(),
            mergeable: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrCheck {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub details_url: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePrRequest {
    pub workspace_id: Uuid,
    pub title: String,
    pub body: String,
    pub draft: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub success: bool,
    pub message: String,
    pub merge_method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrComment {
    pub id: u64,
    pub author: String,
    pub body: String,
    pub created_at: String,
    pub path: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReview {
    pub id: u64,
    pub author: String,
    pub state: String,
    pub body: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrFullData {
    pub info: PrInfo,
    pub reviews: Vec<PrReview>,
    pub review_comments: Vec<PrComment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewsAndComments {
    pub reviews: Vec<PrReview>,
    pub review_comments: Vec<PrComment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrListItem {
    pub number: u32,
    pub title: String,
    pub head_branch: String,
    pub base_branch: String,
    pub state: String,
    pub author: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDetail {
    pub number: u32,
    pub title: String,
    pub head_branch: String,
    pub base_branch: String,
    pub body: String,
    pub state: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueListItem {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub state: String,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDetail {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub state: String,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: u64,
    pub name: String,
    pub workflow_name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub event: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowJob {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub steps: Vec<WorkflowStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStep {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLogsResult {
    pub logs: String,
    pub truncated: bool,
    pub task_logs: Option<Vec<TaskLog>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLog {
    pub task_name: String,
    pub job_name: String,
    pub log_content: String,
    pub status: String,
    pub conclusion: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pr_info_empty() {
        let ws_id = Uuid::new_v4();
        let info = PrInfo::empty(ws_id);
        assert_eq!(info.workspace_id, ws_id);
        assert!(info.pr_number.is_none());
        assert!(info.pr_url.is_none());
        assert!(info.title.is_none());
        assert!(info.state.is_none());
        assert!(info.checks.is_empty());
        assert!(info.mergeable.is_none());
    }

    #[test]
    fn test_pr_list_item_serde_roundtrip() {
        let item = PrListItem {
            number: 42,
            title: "Fix bug".to_string(),
            head_branch: "fix/bug".to_string(),
            base_branch: "main".to_string(),
            state: "OPEN".to_string(),
            author: "dev".to_string(),
            url: "https://github.com/repo/pull/42".to_string(),
        };
        let json = serde_json::to_string(&item).unwrap();
        let deserialized: PrListItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.number, 42);
        assert_eq!(deserialized.title, "Fix bug");
    }
}
