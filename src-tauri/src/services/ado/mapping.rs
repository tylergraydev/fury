use uuid::Uuid;

use crate::models::pr::{PrCheck, PrInfo, PrListItem, WorkflowRun};

// --- Parsing helpers ---

pub fn parse_pr_info(pr: &serde_json::Value, workspace_id: Uuid) -> PrInfo {
    let pr_id = pr["pullRequestId"].as_u64();
    let status = pr["status"].as_str().unwrap_or("unknown");

    // Build the web URL from the API URL
    let pr_url = pr["url"].as_str().map(|api_url| {
        // The API URL is like: https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}
        // We need: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
        // For simplicity, construct from fields if available
        if let (Some(repo_url), Some(id)) = (pr["repository"]["webUrl"].as_str(), pr_id) {
            format!("{}/pullrequest/{}", repo_url, id)
        } else {
            api_url.to_string()
        }
    });

    let merge_status = pr["mergeStatus"].as_str().unwrap_or("unknown");
    let mergeable = match merge_status {
        "succeeded" => Some("MERGEABLE".to_string()),
        "conflicts" => Some("CONFLICTING".to_string()),
        _ => Some("UNKNOWN".to_string()),
    };

    PrInfo {
        workspace_id,
        pr_number: pr_id,
        pr_url,
        title: pr["title"].as_str().map(|s| s.to_string()),
        state: Some(map_pr_status(status)),
        checks: Vec::new(), // Checks are fetched separately
        mergeable,
    }
}

pub fn parse_pr_check(status: &serde_json::Value) -> PrCheck {
    let state = status["state"].as_str().unwrap_or("notSet");
    let (mapped_status, conclusion) = map_check_state(state);

    PrCheck {
        name: status["context"]["name"]
            .as_str()
            .or_else(|| status["context"]["genre"].as_str())
            .unwrap_or("Unknown check")
            .to_string(),
        status: mapped_status,
        conclusion,
        details_url: status["targetUrl"].as_str().map(|s| s.to_string()),
        description: status["description"].as_str().map(|s| s.to_string()),
    }
}

pub fn parse_pr_list_item(pr: &serde_json::Value) -> PrListItem {
    let pr_id = pr["pullRequestId"].as_u64().unwrap_or(0) as u32;
    let source = pr["sourceRefName"]
        .as_str()
        .unwrap_or("")
        .strip_prefix("refs/heads/")
        .unwrap_or("")
        .to_string();
    let target = pr["targetRefName"]
        .as_str()
        .unwrap_or("")
        .strip_prefix("refs/heads/")
        .unwrap_or("")
        .to_string();

    let web_url = pr["repository"]["webUrl"]
        .as_str()
        .map(|base| format!("{}/pullrequest/{}", base, pr_id))
        .unwrap_or_default();

    PrListItem {
        number: pr_id,
        title: pr["title"].as_str().unwrap_or("").to_string(),
        head_branch: source,
        base_branch: target,
        state: map_pr_status(pr["status"].as_str().unwrap_or("unknown")),
        author: pr["createdBy"]["displayName"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string(),
        url: web_url,
    }
}

pub fn parse_workflow_run(build: &serde_json::Value) -> WorkflowRun {
    WorkflowRun {
        id: build["id"].as_u64().unwrap_or(0),
        name: build["buildNumber"].as_str().unwrap_or("").to_string(),
        workflow_name: build["definition"]["name"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        status: map_build_status(build["status"].as_str().unwrap_or("")),
        conclusion: build["result"].as_str().map(map_build_result),
        event: build["reason"].as_str().unwrap_or("manual").to_string(),
        created_at: build["startTime"]
            .as_str()
            .or_else(|| build["queueTime"].as_str())
            .unwrap_or("")
            .to_string(),
    }
}

// --- Mapping helpers ---

/// Map ADO PR status to a GitHub-compatible state string.
pub fn map_pr_status(status: &str) -> String {
    match status {
        "active" => "OPEN".to_string(),
        "completed" => "MERGED".to_string(),
        "abandoned" => "CLOSED".to_string(),
        other => other.to_uppercase(),
    }
}

/// Map ADO reviewer vote to a review state string.
pub fn map_vote_to_state(vote: i64) -> String {
    match vote {
        10 => "APPROVED".to_string(),
        5 => "APPROVED".to_string(), // Approved with suggestions
        -5 => "CHANGES_REQUESTED".to_string(), // Waiting for author
        -10 => "CHANGES_REQUESTED".to_string(), // Rejected
        _ => "COMMENTED".to_string(),
    }
}

/// Map ADO check/status state to (status, conclusion) pair.
pub fn map_check_state(state: &str) -> (String, Option<String>) {
    match state {
        "succeeded" => ("completed".to_string(), Some("success".to_string())),
        "failed" | "error" => ("completed".to_string(), Some("failure".to_string())),
        "pending" => ("in_progress".to_string(), None),
        "notApplicable" => ("completed".to_string(), Some("neutral".to_string())),
        _ => ("queued".to_string(), None),
    }
}

/// Map ADO build status to a normalized string.
pub fn map_build_status(status: &str) -> String {
    match status {
        "completed" => "completed".to_string(),
        "inProgress" => "in_progress".to_string(),
        "notStarted" => "queued".to_string(),
        "cancelling" => "in_progress".to_string(),
        "postponed" => "queued".to_string(),
        other => other.to_string(),
    }
}

/// Map ADO build result to a normalized conclusion string.
pub fn map_build_result(result: &str) -> String {
    match result {
        "succeeded" => "success".to_string(),
        "partiallySucceeded" => "success".to_string(),
        "failed" => "failure".to_string(),
        "canceled" => "cancelled".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_pr_status() {
        assert_eq!(map_pr_status("active"), "OPEN");
        assert_eq!(map_pr_status("completed"), "MERGED");
        assert_eq!(map_pr_status("abandoned"), "CLOSED");
    }

    #[test]
    fn test_map_vote_to_state() {
        assert_eq!(map_vote_to_state(10), "APPROVED");
        assert_eq!(map_vote_to_state(5), "APPROVED");
        assert_eq!(map_vote_to_state(-5), "CHANGES_REQUESTED");
        assert_eq!(map_vote_to_state(-10), "CHANGES_REQUESTED");
        assert_eq!(map_vote_to_state(0), "COMMENTED");
    }

    #[test]
    fn test_map_check_state() {
        let (status, conclusion) = map_check_state("succeeded");
        assert_eq!(status, "completed");
        assert_eq!(conclusion.unwrap(), "success");

        let (status, conclusion) = map_check_state("failed");
        assert_eq!(status, "completed");
        assert_eq!(conclusion.unwrap(), "failure");

        let (status, conclusion) = map_check_state("pending");
        assert_eq!(status, "in_progress");
        assert!(conclusion.is_none());
    }

    #[test]
    fn test_map_build_status() {
        assert_eq!(map_build_status("completed"), "completed");
        assert_eq!(map_build_status("inProgress"), "in_progress");
        assert_eq!(map_build_status("notStarted"), "queued");
    }

    #[test]
    fn test_map_build_result() {
        assert_eq!(map_build_result("succeeded"), "success");
        assert_eq!(map_build_result("failed"), "failure");
        assert_eq!(map_build_result("canceled"), "cancelled");
    }

    #[test]
    fn test_parse_pr_info() {
        let ws_id = Uuid::new_v4();
        let pr_json = serde_json::json!({
            "pullRequestId": 42,
            "title": "Test PR",
            "status": "active",
            "mergeStatus": "succeeded",
            "url": "https://dev.azure.com/org/project/_apis/git/repositories/repo/pullRequests/42",
            "repository": {
                "webUrl": "https://dev.azure.com/org/project/_git/repo"
            }
        });

        let info = parse_pr_info(&pr_json, ws_id);
        assert_eq!(info.workspace_id, ws_id);
        assert_eq!(info.pr_number, Some(42));
        assert_eq!(info.title.as_deref(), Some("Test PR"));
        assert_eq!(info.state.as_deref(), Some("OPEN"));
        assert_eq!(info.mergeable.as_deref(), Some("MERGEABLE"));
        assert_eq!(
            info.pr_url.as_deref(),
            Some("https://dev.azure.com/org/project/_git/repo/pullrequest/42")
        );
    }

    #[test]
    fn test_parse_pr_check() {
        let status_json = serde_json::json!({
            "state": "succeeded",
            "context": {
                "name": "Build",
                "genre": "continuous-integration"
            },
            "targetUrl": "https://dev.azure.com/org/project/_build/123",
            "description": "Build succeeded"
        });

        let check = parse_pr_check(&status_json);
        assert_eq!(check.name, "Build");
        assert_eq!(check.status, "completed");
        assert_eq!(check.conclusion.as_deref(), Some("success"));
    }

    #[test]
    fn test_parse_pr_list_item() {
        let pr_json = serde_json::json!({
            "pullRequestId": 10,
            "title": "Feature branch",
            "sourceRefName": "refs/heads/feature/test",
            "targetRefName": "refs/heads/main",
            "status": "active",
            "createdBy": { "displayName": "Dev User" },
            "repository": {
                "webUrl": "https://dev.azure.com/org/project/_git/repo"
            }
        });

        let item = parse_pr_list_item(&pr_json);
        assert_eq!(item.number, 10);
        assert_eq!(item.title, "Feature branch");
        assert_eq!(item.head_branch, "feature/test");
        assert_eq!(item.base_branch, "main");
        assert_eq!(item.state, "OPEN");
        assert_eq!(item.author, "Dev User");
    }

    #[test]
    fn test_parse_workflow_run() {
        let build_json = serde_json::json!({
            "id": 999,
            "buildNumber": "20260101.1",
            "definition": { "name": "CI Pipeline" },
            "status": "completed",
            "result": "succeeded",
            "reason": "individualCI",
            "startTime": "2026-01-01T00:00:00Z"
        });

        let run = parse_workflow_run(&build_json);
        assert_eq!(run.id, 999);
        assert_eq!(run.name, "20260101.1");
        assert_eq!(run.workflow_name, "CI Pipeline");
        assert_eq!(run.status, "completed");
        assert_eq!(run.conclusion.as_deref(), Some("success"));
    }
}
