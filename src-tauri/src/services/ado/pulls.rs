use uuid::Uuid;

use crate::error::AppError;
use crate::models::pr::{MergeResult, PrCheck, PrComment, PrDetail, PrInfo, PrListItem, PrReview};

use super::{ado_err, api_base, client};
use super::mapping::{
    map_pr_status, map_vote_to_state, parse_pr_check, parse_pr_info, parse_pr_list_item,
};

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

#[allow(dead_code)]
fn parse_pr_detail(pr: &serde_json::Value) -> PrDetail {
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

    PrDetail {
        number: pr_id,
        title: pr["title"].as_str().unwrap_or("").to_string(),
        head_branch: source,
        base_branch: target,
        body: pr["description"].as_str().unwrap_or("").to_string(),
        state: map_pr_status(pr["status"].as_str().unwrap_or("unknown")),
        url: web_url,
    }
}

/// Get detailed information for a single pull request.
#[allow(dead_code)]
pub async fn get_pr_detail(
    pat: &str,
    org: &str,
    project: &str,
    repo_name: &str,
    pr_number: u32,
) -> Result<PrDetail, AppError> {
    let c = client(pat)?;
    let url = format!(
        "{}/git/repositories/{}/pullrequests/{}?api-version=7.1",
        api_base(org, project),
        repo_name,
        pr_number
    );

    let resp = c.get(&url).send().await.map_err(ado_err)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(ado_err(format!(
            "Get PR detail failed (HTTP {}): {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp.json().await.map_err(ado_err)?;
    Ok(parse_pr_detail(&raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pr_detail() {
        let json = serde_json::json!({
            "pullRequestId": 42,
            "title": "Feature branch",
            "sourceRefName": "refs/heads/feature/test",
            "targetRefName": "refs/heads/main",
            "description": "This adds a new feature",
            "status": "active",
            "repository": {
                "webUrl": "https://dev.azure.com/org/project/_git/repo"
            }
        });
        let detail = parse_pr_detail(&json);
        assert_eq!(detail.number, 42);
        assert_eq!(detail.title, "Feature branch");
        assert_eq!(detail.head_branch, "feature/test");
        assert_eq!(detail.base_branch, "main");
        assert_eq!(detail.body, "This adds a new feature");
        assert_eq!(detail.state, "OPEN");
    }
}
