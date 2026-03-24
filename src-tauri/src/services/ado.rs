use base64::Engine;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::pr::{
    MergeResult, PrCheck, PrComment, PrInfo, PrListItem, PrReview, WorkflowJob, WorkflowRun,
    WorkflowStep,
};

/// Build a `reqwest::Client` with the ADO PAT as Basic auth.
fn client(pat: &str) -> Result<reqwest::Client, AppError> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!(":{}", pat));
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Basic {}", encoded))
            .map_err(|e| AppError::AzureDevOpsError(format!("Invalid PAT: {}", e)))?,
    );

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| AppError::AzureDevOpsError(format!("Failed to build HTTP client: {}", e)))
}

fn api_base(org: &str, project: &str) -> String {
    format!("https://dev.azure.com/{}/{}/_apis", org, project)
}

fn ado_err(msg: impl std::fmt::Display) -> AppError {
    AppError::AzureDevOpsError(msg.to_string())
}

/// Verify PAT authentication by listing projects.
#[allow(dead_code)]
pub async fn check_auth(pat: &str, org: &str) -> Result<(), AppError> {
    let c = client(pat)?;
    let url = format!(
        "https://dev.azure.com/{}/_apis/projects?api-version=7.1&$top=1",
        org
    );
    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Authentication failed (HTTP {}): {}",
            status, text
        )));
    }
    Ok(())
}

/// Create a pull request via the Azure DevOps REST API.
#[allow(clippy::too_many_arguments)]
pub async fn create_pr(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    source_branch: &str,
    target_branch: &str,
    title: &str,
    body: &str,
    draft: bool,
    workspace_id: Uuid,
) -> Result<PrInfo, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests?api-version=7.1",
        api_base(org, project),
        repo_name
    );

    let payload = serde_json::json!({
        "sourceRefName": format!("refs/heads/{}", source_branch),
        "targetRefName": format!("refs/heads/{}", target_branch),
        "title": title,
        "description": body,
        "isDraft": draft,
    });

    let resp = c.post(&url).json(&payload).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Create PR failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_pr_info(&raw, workspace_id))
}

/// Get PR info for the current branch.
pub async fn get_pr_by_branch(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    branch: &str,
    workspace_id: Uuid,
) -> Result<Option<PrInfo>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests?searchCriteria.sourceRefName=refs/heads/{}&searchCriteria.status=active&api-version=7.1",
        api_base(org, project),
        repo_name,
        branch
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Get PR by branch failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let prs = raw["value"].as_array();

    match prs.and_then(|arr| arr.first()) {
        Some(pr) => Ok(Some(parse_pr_info(pr, workspace_id))),
        None => Ok(None),
    }
}

/// Get build status checks for a PR.
pub async fn get_pr_checks(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: u64,
) -> Result<Vec<PrCheck>, AppError> {
    let c = client(pat)?;
    // Get build statuses associated with the PR
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}/statuses?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        // Fall back to empty checks rather than erroring
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let statuses = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(statuses.iter().map(parse_pr_check).collect())
}

/// Merge (complete) a pull request.
pub async fn merge_pr(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: u64,
    method: &str,
) -> Result<MergeResult, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_id
    );

    let merge_strategy = match method {
        "squash" => "squash",
        "rebase" => "rebaseMerge",
        _ => "noFastForward",
    };

    // First get the last merge source commit
    let get_resp = c.get(&url).send().await.map_err(ado_err)?;
    if !get_resp.status().is_success() {
        return Err(ado_err("Failed to fetch PR for merge"));
    }
    let pr_data: serde_json::Value = get_resp.json().await.map_err(ado_err)?;
    let last_merge_source_commit = pr_data["lastMergeSourceCommit"]["commitId"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let payload = serde_json::json!({
        "status": "completed",
        "lastMergeSourceCommit": {
            "commitId": last_merge_source_commit
        },
        "completionOptions": {
            "mergeStrategy": merge_strategy,
            "deleteSourceBranch": true,
        }
    });

    let resp = c.patch(&url).json(&payload).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!("Merge failed (HTTP {}): {}", status, text)));
    }

    Ok(MergeResult {
        success: true,
        message: "Pull request completed".to_string(),
        merge_method: method.to_string(),
    })
}

/// Get PR threads (reviews + comments).
pub async fn get_pr_threads(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: u64,
) -> Result<(Vec<PrReview>, Vec<PrComment>), AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}/threads?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok((Vec::new(), Vec::new()));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let threads = raw["value"].as_array().cloned().unwrap_or_default();

    let mut reviews = Vec::new();
    let mut comments = Vec::new();

    for thread in &threads {
        let thread_context = thread.get("threadContext");
        let is_file_comment = thread_context
            .and_then(|tc| tc.get("filePath"))
            .and_then(|fp| fp.as_str())
            .is_some();

        if let Some(thread_comments) = thread["comments"].as_array() {
            for comment in thread_comments {
                let comment_type = comment["commentType"].as_str().unwrap_or("");
                let author = comment["author"]["displayName"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string();
                let body = comment["content"].as_str().unwrap_or("").to_string();
                let created_at = comment["publishedDate"].as_str().unwrap_or("").to_string();
                let id = comment["id"].as_u64().unwrap_or(0);

                if comment_type == "system" {
                    continue;
                }

                if is_file_comment {
                    let path = thread_context
                        .and_then(|tc| tc["filePath"].as_str())
                        .map(|s| s.to_string());
                    let line = thread_context
                        .and_then(|tc| tc["rightFileEnd"].as_object())
                        .and_then(|rfe| rfe["line"].as_u64())
                        .map(|l| l as u32);

                    comments.push(PrComment {
                        id,
                        author,
                        body,
                        created_at,
                        path,
                        line,
                    });
                } else {
                    // Treat top-level thread comments as reviews
                    reviews.push(PrReview {
                        id,
                        author,
                        state: "COMMENTED".to_string(),
                        body,
                        submitted_at: created_at,
                    });
                }
            }
        }
    }

    Ok((reviews, comments))
}

/// Get reviewer votes as reviews.
pub async fn get_pr_reviewers(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_id: u64,
) -> Result<Vec<PrReview>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}/reviewers?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let reviewers = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(reviewers
        .iter()
        .filter_map(|r| {
            let vote = r["vote"].as_i64().unwrap_or(0);
            if vote == 0 {
                return None; // No vote yet
            }
            Some(PrReview {
                id: r["id"]
                    .as_str()
                    .map(|s| s.parse::<u64>().unwrap_or(0))
                    .unwrap_or(0),
                author: r["displayName"].as_str().unwrap_or("Unknown").to_string(),
                state: map_vote_to_state(vote),
                body: String::new(),
                submitted_at: String::new(),
            })
        })
        .collect())
}

/// List pull requests for a repository.
pub async fn list_prs(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
) -> Result<Vec<PrListItem>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests?searchCriteria.status=all&$top=50&api-version=7.1",
        api_base(org, project),
        repo_name
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "List PRs failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let prs = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(prs.iter().map(parse_pr_list_item).collect())
}

/// Get pipeline/build runs for a branch.
pub async fn get_pipeline_runs(
    pat: &str,
    org: &str,
    project: &str,
    branch: &str,
) -> Result<Vec<WorkflowRun>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/build/builds?branchName=refs/heads/{}&$top=20&api-version=7.1",
        api_base(org, project),
        branch
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let builds = raw["value"].as_array().cloned().unwrap_or_default();

    Ok(builds.iter().map(parse_workflow_run).collect())
}

/// Get build timeline (jobs/steps).
pub async fn get_build_timeline(
    pat: &str,
    org: &str,
    project: &str,
    build_id: u64,
) -> Result<Vec<WorkflowJob>, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/build/builds/{}/timeline?api-version=7.1",
        api_base(org, project),
        build_id
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    let records = raw["records"].as_array().cloned().unwrap_or_default();

    // ADO timeline has a flat list of records with parentId relationships.
    // Jobs have type "Job", steps have type "Task" with a parentId pointing to a Job.
    let mut jobs: Vec<WorkflowJob> = Vec::new();

    // First pass: collect jobs
    let job_records: Vec<&serde_json::Value> = records
        .iter()
        .filter(|r| r["type"].as_str() == Some("Job"))
        .collect();

    for job in &job_records {
        let job_id = job["id"].as_str().unwrap_or("");

        // Collect steps for this job
        let steps: Vec<WorkflowStep> = records
            .iter()
            .filter(|r| {
                r["type"].as_str() == Some("Task") && r["parentId"].as_str() == Some(job_id)
            })
            .map(|step| WorkflowStep {
                name: step["name"].as_str().unwrap_or("").to_string(),
                status: map_build_status(step["state"].as_str().unwrap_or("")),
                conclusion: step["result"].as_str().map(map_build_result),
            })
            .collect();

        jobs.push(WorkflowJob {
            id: job["id"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0),
            name: job["name"].as_str().unwrap_or("").to_string(),
            status: map_build_status(job["state"].as_str().unwrap_or("")),
            conclusion: job["result"].as_str().map(map_build_result),
            steps,
        });
    }

    Ok(jobs)
}

// --- Parsing helpers ---

fn parse_pr_info(pr: &serde_json::Value, workspace_id: Uuid) -> PrInfo {
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

fn parse_pr_check(status: &serde_json::Value) -> PrCheck {
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

fn parse_pr_list_item(pr: &serde_json::Value) -> PrListItem {
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

fn parse_workflow_run(build: &serde_json::Value) -> WorkflowRun {
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
fn map_pr_status(status: &str) -> String {
    match status {
        "active" => "OPEN".to_string(),
        "completed" => "MERGED".to_string(),
        "abandoned" => "CLOSED".to_string(),
        other => other.to_uppercase(),
    }
}

/// Map ADO reviewer vote to a review state string.
fn map_vote_to_state(vote: i64) -> String {
    match vote {
        10 => "APPROVED".to_string(),
        5 => "APPROVED".to_string(), // Approved with suggestions
        -5 => "CHANGES_REQUESTED".to_string(), // Waiting for author
        -10 => "CHANGES_REQUESTED".to_string(), // Rejected
        _ => "COMMENTED".to_string(),
    }
}

/// Map ADO check/status state to (status, conclusion) pair.
fn map_check_state(state: &str) -> (String, Option<String>) {
    match state {
        "succeeded" => ("completed".to_string(), Some("success".to_string())),
        "failed" | "error" => ("completed".to_string(), Some("failure".to_string())),
        "pending" => ("in_progress".to_string(), None),
        "notApplicable" => ("completed".to_string(), Some("neutral".to_string())),
        _ => ("queued".to_string(), None),
    }
}

/// Map ADO build status to a normalized string.
fn map_build_status(status: &str) -> String {
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
fn map_build_result(result: &str) -> String {
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
