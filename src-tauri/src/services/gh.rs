use std::path::Path;

use crate::error::AppError;
use crate::models::pr::{
    IssueDetail, IssueListItem, MergeResult, PrCheck, PrComment, PrDetail, PrInfo, PrListItem,
    PrReview, RunLogsResult, WorkflowJob, WorkflowRun, WorkflowStep,
};
use crate::platform;

pub fn find_gh_binary() -> Result<std::path::PathBuf, AppError> {
    which::which("gh").map_err(|_| {
        AppError::PrError(
            "GitHub CLI (gh) not found in PATH. Install it from https://cli.github.com/"
                .to_string(),
        )
    })
}

pub fn check_gh_auth() -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["auth", "status"])
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh auth status: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(
            "Not authenticated with GitHub CLI. Run `gh auth login` first.".to_string(),
        ));
    }
    Ok(())
}

pub fn push_branch(worktree_path: &Path, branch: &str) -> Result<(), AppError> {
    let output = platform::command("git")
        .args(["push", "-u", "origin", branch])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run git push: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "git push failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(())
}

/// Check if the worktree has uncommitted changes (staged or unstaged).
pub fn has_uncommitted_changes(worktree_path: &Path) -> Result<bool, AppError> {
    let output = platform::command("git")
        .args(["status", "--porcelain"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::GitError(format!("Failed to run git status: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::GitError(format!(
            "git status failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(!output.stdout.is_empty())
}

/// Stage all changes and create a commit with the given message.
pub fn stage_and_commit(worktree_path: &Path, message: &str) -> Result<(), AppError> {
    let add_output = platform::command("git")
        .args(["add", "-A"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::GitError(format!("Failed to run git add: {}", e)))?;

    if !add_output.status.success() {
        return Err(AppError::GitError(format!(
            "git add failed: {}",
            String::from_utf8_lossy(&add_output.stderr)
        )));
    }

    let commit_output = platform::command("git")
        .args(["commit", "-m", message])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::GitError(format!("Failed to run git commit: {}", e)))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        if stderr.contains("nothing to commit") || stdout.contains("nothing to commit") {
            return Ok(());
        }
        return Err(AppError::GitError(format!("git commit failed: {}", stderr)));
    }

    Ok(())
}

/// Build the argument list for `gh pr create`.
pub fn build_create_pr_args(
    title: &str,
    body: &str,
    base_branch: &str,
    draft: bool,
) -> Vec<String> {
    let mut args = vec![
        "pr".to_string(),
        "create".to_string(),
        "--title".to_string(),
        title.to_string(),
        "--body".to_string(),
        body.to_string(),
        "--base".to_string(),
        base_branch.to_string(),
    ];
    if draft {
        args.push("--draft".to_string());
    }
    args
}

pub fn create_pr(
    worktree_path: &Path,
    title: &str,
    body: &str,
    base_branch: &str,
    draft: bool,
) -> Result<PrInfo, AppError> {
    let gh = find_gh_binary()?;
    let args = build_create_pr_args(title, body, base_branch, draft);

    let output = platform::command(&gh)
        .args(&args)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr create: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh pr create failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    // Fetch full PR info now that it's created
    get_pr_info(worktree_path)?
        .ok_or_else(|| AppError::PrError("PR was created but could not be fetched".to_string()))
}

/// Parse a `PrInfo` from the JSON returned by `gh pr view --json number,url,title,state,mergeable`.
/// The `workspace_id` is set to `Uuid::nil()` — callers should replace it.
pub fn parse_pr_info_from_json(raw: &serde_json::Value) -> PrInfo {
    PrInfo {
        workspace_id: uuid::Uuid::nil(),
        pr_number: raw.get("number").and_then(|v| v.as_u64()),
        pr_url: raw.get("url").and_then(|v| v.as_str()).map(String::from),
        title: raw.get("title").and_then(|v| v.as_str()).map(String::from),
        state: raw.get("state").and_then(|v| v.as_str()).map(String::from),
        checks: Vec::new(),
        mergeable: raw
            .get("mergeable")
            .and_then(|v| v.as_str())
            .map(String::from),
    }
}

pub fn get_pr_info(worktree_path: &Path) -> Result<Option<PrInfo>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "view", "--json", "number,url,title,state,mergeable"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        // No PR exists for this branch
        return Ok(None);
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh output: {}", e)))?;

    Ok(Some(parse_pr_info_from_json(&raw)))
}

/// Maps `gh pr checks` `state` field to `(status, conclusion)` to match the
/// frontend's expected shape. The `state` field combines lifecycle and outcome:
/// terminal states like SUCCESS/FAILURE map to status=COMPLETED with a conclusion,
/// while in-progress states map to their lifecycle name with no conclusion.
fn map_check_state(state: &str) -> (String, Option<String>) {
    match state {
        "SUCCESS" => ("COMPLETED".to_string(), Some("SUCCESS".to_string())),
        "FAILURE" | "ERROR" | "STARTUP_FAILURE" => {
            ("COMPLETED".to_string(), Some("FAILURE".to_string()))
        }
        "NEUTRAL" => ("COMPLETED".to_string(), Some("NEUTRAL".to_string())),
        "CANCELLED" => ("COMPLETED".to_string(), Some("CANCELLED".to_string())),
        "TIMED_OUT" => ("COMPLETED".to_string(), Some("TIMED_OUT".to_string())),
        "SKIPPED" => ("COMPLETED".to_string(), Some("SKIPPED".to_string())),
        "ACTION_REQUIRED" => ("COMPLETED".to_string(), Some("ACTION_REQUIRED".to_string())),
        "STALE" => ("COMPLETED".to_string(), Some("STALE".to_string())),
        "PENDING" | "EXPECTED" => ("IN_PROGRESS".to_string(), None),
        "QUEUED" => ("QUEUED".to_string(), None),
        other => (other.to_string(), None),
    }
}

/// Parse a list of `PrCheck` from the JSON array returned by `gh pr checks --json name,state,link,description`.
pub fn parse_pr_checks_from_json(raw: &[serde_json::Value]) -> Vec<PrCheck> {
    raw.iter()
        .map(|check| {
            let state = check
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("UNKNOWN");
            let (status, conclusion) = map_check_state(state);
            PrCheck {
                name: check
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                status,
                conclusion,
                details_url: check.get("link").and_then(|v| v.as_str()).map(String::from),
                description: check
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            }
        })
        .collect()
}

/// Check whether a stderr message from `gh pr checks` or `gh run list` indicates
/// a benign "not found" condition rather than a real error.
pub fn is_benign_not_found(stderr: &str) -> bool {
    stderr.contains("no pull request")
        || stderr.contains("no checks")
        || stderr.contains("could not find")
        || stderr.contains("no runs")
}

pub fn get_pr_checks(worktree_path: &Path) -> Result<Vec<PrCheck>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "checks", "--json", "name,state,link,description"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr checks: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_benign_not_found(&stderr) {
            return Ok(Vec::new());
        }
        return Err(AppError::PrError(format!(
            "gh pr checks failed: {}",
            stderr
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse checks output: {}", e)))?;

    Ok(parse_pr_checks_from_json(&raw))
}

/// Map a merge method string to the corresponding `gh pr merge` flag.
pub fn merge_method_to_flag(method: &str) -> &'static str {
    match method {
        "squash" => "--squash",
        "rebase" => "--rebase",
        _ => "--merge",
    }
}

/// Build a `MergeResult` from the outcome of a merge command.
pub fn build_merge_result(success: bool, output_text: &str, method: &str) -> MergeResult {
    MergeResult {
        success,
        message: output_text.trim().to_string(),
        merge_method: method.to_string(),
    }
}

pub fn merge_pr(worktree_path: &Path, method: &str) -> Result<MergeResult, AppError> {
    let gh = find_gh_binary()?;
    let merge_flag = merge_method_to_flag(method);

    let output = platform::command(&gh)
        .args(["pr", "merge", merge_flag, "--delete-branch"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr merge: {}", e)))?;

    let success = output.status.success();
    let text = if success {
        String::from_utf8_lossy(&output.stdout)
    } else {
        String::from_utf8_lossy(&output.stderr)
    };

    Ok(build_merge_result(success, &text, method))
}

/// Combined `gh pr view` that fetches both PR info and reviews in a single CLI call.
/// Returns (PrInfo, Vec<PrReview>) or None if no PR exists.
pub fn get_pr_info_with_reviews(
    worktree_path: &Path,
) -> Result<Option<(PrInfo, Vec<PrReview>)>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "pr",
            "view",
            "--json",
            "number,url,title,state,mergeable,latestReviews",
        ])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Ok(None);
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh output: {}", e)))?;

    let info = parse_pr_info_from_json(&raw);
    let reviews = parse_reviews_from_json(&raw);

    Ok(Some((info, reviews)))
}

/// Extract `(owner, repo)` from a GitHub PR URL like `https://github.com/owner/repo/pull/123`.
pub fn parse_owner_repo_from_url(pr_url: &str) -> Result<(&str, &str), AppError> {
    let parts: Vec<&str> = pr_url.split('/').collect();
    if parts.len() < 5 {
        return Err(AppError::PrError(format!(
            "Could not parse owner/repo from URL: {}",
            pr_url
        )));
    }
    Ok((parts[parts.len() - 4], parts[parts.len() - 3]))
}

/// Build the GitHub API path for PR review comments.
pub fn build_review_comments_api_path(owner: &str, repo: &str, pr_number: u64) -> String {
    format!("repos/{}/{}/pulls/{}/comments", owner, repo, pr_number)
}

/// Fetch review comments given known PR metadata, avoiding a redundant `gh pr view` call.
pub fn get_pr_review_comments_for_pr(
    worktree_path: &Path,
    pr_number: u64,
    pr_url: &str,
) -> Result<Vec<PrComment>, AppError> {
    let gh = find_gh_binary()?;

    let (owner, repo) = parse_owner_repo_from_url(pr_url)?;

    let api_path = build_review_comments_api_path(owner, repo, pr_number);
    let api_output = platform::command(&gh)
        .args(["api", &api_path, "--paginate"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh api: {}", e)))?;

    if !api_output.status.success() {
        let stderr = String::from_utf8_lossy(&api_output.stderr);
        return Err(AppError::PrError(format!("gh api failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&api_output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse review comments: {}", e)))?;

    Ok(parse_comments_from_json(&raw))
}

/// Fetch reviews and comments in an optimized way: single `gh pr view` for reviews + PR metadata,
/// then use that metadata to fetch comments without a redundant call.
pub fn get_reviews_and_comments(
    worktree_path: &Path,
) -> Result<(Vec<PrReview>, Vec<PrComment>), AppError> {
    let gh = find_gh_binary()?;

    let output = platform::command(&gh)
        .args(["pr", "view", "--json", "number,url,latestReviews"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Ok((Vec::new(), Vec::new()));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse reviews output: {}", e)))?;

    let reviews = parse_reviews_from_json(&raw);

    let pr_number = raw.get("number").and_then(|v| v.as_u64());
    let pr_url = raw.get("url").and_then(|v| v.as_str());

    let comments = match (pr_number, pr_url) {
        (Some(number), Some(url)) => get_pr_review_comments_for_pr(worktree_path, number, url)?,
        _ => Vec::new(),
    };

    Ok((reviews, comments))
}

pub(crate) fn parse_reviews_from_json(raw: &serde_json::Value) -> Vec<PrReview> {
    raw.get("latestReviews")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|r| PrReview {
                    id: r.get("id").and_then(|v| v.as_u64()).unwrap_or(0),
                    author: r
                        .get("author")
                        .and_then(|v| v.get("login"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    state: r
                        .get("state")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    body: r
                        .get("body")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    submitted_at: r
                        .get("submittedAt")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn parse_comments_from_json(raw: &[serde_json::Value]) -> Vec<PrComment> {
    raw.iter()
        .map(|c| PrComment {
            id: c.get("id").and_then(|v| v.as_u64()).unwrap_or(0),
            author: c
                .get("user")
                .and_then(|v| v.get("login"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            body: c
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: c
                .get("created_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            path: c.get("path").and_then(|v| v.as_str()).map(String::from),
            line: c
                .get("line")
                .and_then(|v| v.as_u64())
                .or_else(|| c.get("original_line").and_then(|v| v.as_u64()))
                .map(|v| v as u32),
        })
        .collect()
}

pub fn get_pr_reviews(worktree_path: &Path) -> Result<Vec<PrReview>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "view", "--json", "latestReviews"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse reviews output: {}", e)))?;

    Ok(parse_reviews_from_json(&raw))
}

pub fn get_pr_review_comments(worktree_path: &Path) -> Result<Vec<PrComment>, AppError> {
    let gh = find_gh_binary()?;

    // First get PR number and URL to extract owner/repo
    let pr_output = platform::command(&gh)
        .args(["pr", "view", "--json", "number,url"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !pr_output.status.success() {
        return Ok(Vec::new());
    }

    let pr_raw: serde_json::Value = serde_json::from_slice(&pr_output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse PR output: {}", e)))?;

    let pr_number = pr_raw
        .get("number")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| AppError::PrError("No PR number found".to_string()))?;

    let pr_url = pr_raw
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::PrError("No PR URL found".to_string()))?;

    // Extract owner/repo from URL like https://github.com/owner/repo/pull/123
    let (owner, repo) = parse_owner_repo_from_url(pr_url)?;

    // Fetch inline review comments via API
    let api_path = build_review_comments_api_path(owner, repo, pr_number);
    let api_output = platform::command(&gh)
        .args(["api", &api_path, "--paginate"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh api: {}", e)))?;

    if !api_output.status.success() {
        let stderr = String::from_utf8_lossy(&api_output.stderr);
        return Err(AppError::PrError(format!("gh api failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&api_output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse review comments: {}", e)))?;

    Ok(parse_comments_from_json(&raw))
}

/// Parse a list of `PrListItem` from the JSON array returned by `gh pr list`.
pub fn parse_pr_list_from_json(raw: &[serde_json::Value]) -> Vec<PrListItem> {
    raw.iter()
        .filter_map(|pr| {
            let number = pr.get("number").and_then(|v| v.as_u64())? as u32;
            Some(PrListItem {
                number,
                title: pr
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                head_branch: pr
                    .get("headRefName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                base_branch: pr
                    .get("baseRefName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                state: pr
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                author: pr
                    .get("author")
                    .and_then(|v| v.get("login"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: pr
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

pub fn list_repo_prs(repo_path: &Path) -> Result<Vec<PrListItem>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "pr",
            "list",
            "--json",
            "number,title,headRefName,baseRefName,state,author,url",
            "--limit",
            "50",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr list: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh pr list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh pr list output: {}", e)))?;

    Ok(parse_pr_list_from_json(&raw))
}

/// Parse a `PrDetail` from the JSON returned by `gh pr view --json ...`.
pub fn parse_pr_detail_from_json(raw: &serde_json::Value) -> PrDetail {
    PrDetail {
        number: raw.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        title: raw
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        head_branch: raw
            .get("headRefName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        base_branch: raw
            .get("baseRefName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        body: raw
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        state: raw
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        url: raw
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    }
}

pub fn get_pr_detail(repo_path: &Path, number: u32) -> Result<PrDetail, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "pr",
            "view",
            &number.to_string(),
            "--json",
            "number,title,headRefName,baseRefName,body,state,url",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh pr view failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh pr view output: {}", e)))?;

    Ok(parse_pr_detail_from_json(&raw))
}

/// Parse a list of `IssueListItem` from the JSON array returned by `gh issue list`.
pub fn parse_issue_list_from_json(raw: &[serde_json::Value]) -> Vec<IssueListItem> {
    raw.iter()
        .filter_map(|issue| {
            let number = issue.get("number").and_then(|v| v.as_u64())? as u32;
            Some(IssueListItem {
                number,
                title: issue
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                body: issue
                    .get("body")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                state: issue
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                labels: issue
                    .get("labels")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|l| {
                                l.get("name").and_then(|n| n.as_str()).map(String::from)
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            })
        })
        .collect()
}

pub fn list_repo_issues(repo_path: &Path) -> Result<Vec<IssueListItem>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "issue",
            "list",
            "--json",
            "number,title,body,labels,state",
            "--limit",
            "50",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh issue list: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh issue list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh issue list output: {}", e)))?;

    Ok(parse_issue_list_from_json(&raw))
}

/// Parse an `IssueDetail` from the JSON returned by `gh issue view --json ...`.
pub fn parse_issue_detail_from_json(raw: &serde_json::Value) -> IssueDetail {
    IssueDetail {
        number: raw.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        title: raw
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        body: raw
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        state: raw
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        labels: raw
            .get("labels")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

pub fn get_issue_detail(repo_path: &Path, number: u32) -> Result<IssueDetail, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "issue",
            "view",
            &number.to_string(),
            "--json",
            "number,title,body,state,labels",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh issue view: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh issue view failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh issue view output: {}", e)))?;

    Ok(parse_issue_detail_from_json(&raw))
}

/// Parse a list of `WorkflowRun` from the JSON array returned by `gh run list`.
pub fn parse_workflow_runs_from_json(raw: &[serde_json::Value]) -> Vec<WorkflowRun> {
    raw.iter()
        .map(|run| WorkflowRun {
            id: run.get("databaseId").and_then(|v| v.as_u64()).unwrap_or(0),
            name: run
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            workflow_name: run
                .get("workflowName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status: run
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            conclusion: run
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(String::from),
            event: run
                .get("event")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: run
                .get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
        .collect()
}

pub fn get_workflow_runs(worktree_path: &Path, branch: &str) -> Result<Vec<WorkflowRun>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "run",
            "list",
            "--branch",
            branch,
            "--json",
            "databaseId,status,conclusion,name,workflowName,event,createdAt",
            "--limit",
            "20",
        ])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run list: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_benign_not_found(&stderr) {
            return Ok(Vec::new());
        }
        return Err(AppError::PrError(format!("gh run list failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse workflow runs: {}", e)))?;

    Ok(parse_workflow_runs_from_json(&raw))
}

/// Parse a list of `WorkflowJob` from the JSON returned by `gh run view --json jobs`.
pub fn parse_run_jobs_from_json(raw: &serde_json::Value) -> Vec<WorkflowJob> {
    let jobs = raw
        .get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    jobs.iter()
        .map(|job| WorkflowJob {
            id: job.get("databaseId").and_then(|v| v.as_u64()).unwrap_or(0),
            name: job
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status: job
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            conclusion: job
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(String::from),
            steps: job
                .get("steps")
                .and_then(|v| v.as_array())
                .map(|steps| {
                    steps
                        .iter()
                        .map(|step| WorkflowStep {
                            name: step
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            status: step
                                .get("status")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            conclusion: step
                                .get("conclusion")
                                .and_then(|v| v.as_str())
                                .map(String::from),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect()
}

pub fn get_run_jobs(worktree_path: &Path, run_id: u64) -> Result<Vec<WorkflowJob>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["run", "view", &run_id.to_string(), "--json", "jobs"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run view: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh run view failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse run jobs: {}", e)))?;

    Ok(parse_run_jobs_from_json(&raw))
}

/// Truncate log output to `max_bytes`, respecting char boundaries.
/// Returns `(logs, truncated)`.
pub fn truncate_logs(full: &str, max_bytes: usize) -> (String, bool) {
    let truncated = full.len() > max_bytes;
    let logs = if truncated {
        let mut end = max_bytes;
        while end < full.len() && !full.is_char_boundary(end) {
            end += 1;
        }
        full[..end].to_string()
    } else {
        full.to_string()
    };
    (logs, truncated)
}

/// Select the `gh run view` log flag based on whether we want only failed logs.
pub fn log_flag_for_failed_only(failed_only: bool) -> &'static str {
    if failed_only {
        "--log-failed"
    } else {
        "--log"
    }
}

pub fn get_run_logs(
    worktree_path: &Path,
    run_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    let gh = find_gh_binary()?;
    let log_flag = log_flag_for_failed_only(failed_only);
    let output = platform::command(&gh)
        .args(["run", "view", &run_id.to_string(), log_flag])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run view --log: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh run view --log failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let full = String::from_utf8_lossy(&output.stdout);
    let (logs, truncated) = truncate_logs(&full, 100_000);

    Ok(RunLogsResult { logs, truncated })
}

/// Build the argument list for `gh run rerun`.
pub fn build_rerun_args(run_id_str: &str, failed_only: bool) -> Vec<&str> {
    let mut args = vec!["run", "rerun", run_id_str];
    if failed_only {
        args.push("--failed");
    }
    args
}

pub fn rerun_workflow(
    worktree_path: &Path,
    run_id: u64,
    failed_only: bool,
) -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let run_id_str = run_id.to_string();
    let args = build_rerun_args(&run_id_str, failed_only);

    let output = platform::command(&gh)
        .args(&args)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh run rerun: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh run rerun failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn init_test_repo() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        platform::command("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        platform::command("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        platform::command("git")
            .args(["config", "user.name", "Test"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        platform::command("git")
            .args(["commit", "--allow-empty", "-m", "init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        dir
    }

    #[test]
    fn test_has_uncommitted_changes_clean() {
        let dir = init_test_repo();
        assert!(!has_uncommitted_changes(dir.path()).unwrap());
    }

    #[test]
    fn test_has_uncommitted_changes_with_new_file() {
        let dir = init_test_repo();
        fs::write(dir.path().join("test.txt"), "hello").unwrap();
        assert!(has_uncommitted_changes(dir.path()).unwrap());
    }

    #[test]
    fn test_stage_and_commit() {
        let dir = init_test_repo();
        fs::write(dir.path().join("test.txt"), "hello").unwrap();
        stage_and_commit(dir.path(), "test commit").unwrap();
        assert!(!has_uncommitted_changes(dir.path()).unwrap());
    }

    #[test]
    fn test_stage_and_commit_nothing_to_commit() {
        let dir = init_test_repo();
        stage_and_commit(dir.path(), "empty commit").unwrap();
    }

    // --- map_check_state tests ---

    #[test]
    fn test_map_check_state_success() {
        let (status, conclusion) = map_check_state("SUCCESS");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("SUCCESS".to_string()));
    }

    #[test]
    fn test_map_check_state_failure() {
        let (status, conclusion) = map_check_state("FAILURE");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("FAILURE".to_string()));
    }

    #[test]
    fn test_map_check_state_error() {
        let (status, conclusion) = map_check_state("ERROR");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("FAILURE".to_string()));
    }

    #[test]
    fn test_map_check_state_startup_failure() {
        let (status, conclusion) = map_check_state("STARTUP_FAILURE");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("FAILURE".to_string()));
    }

    #[test]
    fn test_map_check_state_pending() {
        let (status, conclusion) = map_check_state("PENDING");
        assert_eq!(status, "IN_PROGRESS");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_expected() {
        let (status, conclusion) = map_check_state("EXPECTED");
        assert_eq!(status, "IN_PROGRESS");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_action_required() {
        let (status, conclusion) = map_check_state("ACTION_REQUIRED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("ACTION_REQUIRED".to_string()));
    }

    #[test]
    fn test_map_check_state_timed_out() {
        let (status, conclusion) = map_check_state("TIMED_OUT");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("TIMED_OUT".to_string()));
    }

    #[test]
    fn test_map_check_state_cancelled() {
        let (status, conclusion) = map_check_state("CANCELLED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("CANCELLED".to_string()));
    }

    #[test]
    fn test_map_check_state_stale() {
        let (status, conclusion) = map_check_state("STALE");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("STALE".to_string()));
    }

    #[test]
    fn test_map_check_state_neutral() {
        let (status, conclusion) = map_check_state("NEUTRAL");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("NEUTRAL".to_string()));
    }

    #[test]
    fn test_map_check_state_skipped() {
        let (status, conclusion) = map_check_state("SKIPPED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, Some("SKIPPED".to_string()));
    }

    #[test]
    fn test_map_check_state_queued() {
        let (status, conclusion) = map_check_state("QUEUED");
        assert_eq!(status, "QUEUED");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_in_progress() {
        let (status, conclusion) = map_check_state("IN_PROGRESS");
        assert_eq!(status, "IN_PROGRESS");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_completed() {
        let (status, conclusion) = map_check_state("COMPLETED");
        assert_eq!(status, "COMPLETED");
        assert_eq!(conclusion, None);
    }

    #[test]
    fn test_map_check_state_unknown() {
        let (status, conclusion) = map_check_state("SOMETHING_ELSE");
        assert_eq!(status, "SOMETHING_ELSE");
        assert_eq!(conclusion, None);
    }

    // --- parse_reviews_from_json tests ---

    #[test]
    fn test_parse_reviews_from_json_with_reviews() {
        let raw = serde_json::json!({
            "latestReviews": [
                {
                    "id": 42,
                    "author": {"login": "octocat"},
                    "state": "APPROVED",
                    "body": "Looks good!",
                    "submittedAt": "2025-01-01T00:00:00Z"
                },
                {
                    "id": 43,
                    "author": {"login": "reviewer2"},
                    "state": "CHANGES_REQUESTED",
                    "body": "Needs work",
                    "submittedAt": "2025-01-02T00:00:00Z"
                }
            ]
        });
        let reviews = parse_reviews_from_json(&raw);
        assert_eq!(reviews.len(), 2);
        assert_eq!(reviews[0].id, 42);
        assert_eq!(reviews[0].author, "octocat");
        assert_eq!(reviews[0].state, "APPROVED");
        assert_eq!(reviews[0].body, "Looks good!");
        assert_eq!(reviews[0].submitted_at, "2025-01-01T00:00:00Z");
        assert_eq!(reviews[1].id, 43);
        assert_eq!(reviews[1].author, "reviewer2");
        assert_eq!(reviews[1].state, "CHANGES_REQUESTED");
    }

    #[test]
    fn test_parse_reviews_from_json_empty() {
        let raw = serde_json::json!({ "latestReviews": [] });
        let reviews = parse_reviews_from_json(&raw);
        assert!(reviews.is_empty());
    }

    #[test]
    fn test_parse_reviews_from_json_missing_field() {
        let raw = serde_json::json!({ "other": "data" });
        let reviews = parse_reviews_from_json(&raw);
        assert!(reviews.is_empty());
    }

    #[test]
    fn test_parse_reviews_from_json_defaults_on_missing_fields() {
        let raw = serde_json::json!({
            "latestReviews": [{ "id": 99 }]
        });
        let reviews = parse_reviews_from_json(&raw);
        assert_eq!(reviews.len(), 1);
        assert_eq!(reviews[0].id, 99);
        assert_eq!(reviews[0].author, "");
        assert_eq!(reviews[0].state, "");
        assert_eq!(reviews[0].body, "");
        assert_eq!(reviews[0].submitted_at, "");
    }

    // --- parse_comments_from_json tests ---

    #[test]
    fn test_parse_comments_from_json_with_comments() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "id": 100,
                "user": {"login": "commenter"},
                "body": "Nice change",
                "created_at": "2025-03-01T12:00:00Z",
                "path": "src/main.rs",
                "line": 42
            },
            {
                "id": 101,
                "user": {"login": "reviewer"},
                "body": "Fix this",
                "created_at": "2025-03-02T12:00:00Z",
                "path": null,
                "original_line": 10
            }
        ]"#,
        )
        .unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments.len(), 2);
        assert_eq!(comments[0].id, 100);
        assert_eq!(comments[0].author, "commenter");
        assert_eq!(comments[0].body, "Nice change");
        assert_eq!(comments[0].created_at, "2025-03-01T12:00:00Z");
        assert_eq!(comments[0].path, Some("src/main.rs".to_string()));
        assert_eq!(comments[0].line, Some(42));
        assert_eq!(comments[1].id, 101);
        assert_eq!(comments[1].path, None);
        assert_eq!(comments[1].line, Some(10)); // falls back to original_line
    }

    #[test]
    fn test_parse_comments_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        let comments = parse_comments_from_json(&raw);
        assert!(comments.is_empty());
    }

    #[test]
    fn test_parse_comments_from_json_defaults_on_missing_fields() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{"id": 200}]"#).unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, 200);
        assert_eq!(comments[0].author, "");
        assert_eq!(comments[0].body, "");
        assert_eq!(comments[0].created_at, "");
        assert_eq!(comments[0].path, None);
        assert_eq!(comments[0].line, None);
    }

    // --- parse_pr_info_from_json tests ---

    #[test]
    fn test_parse_pr_info_from_json_full() {
        let raw = serde_json::json!({
            "number": 42,
            "url": "https://github.com/owner/repo/pull/42",
            "title": "Add feature X",
            "state": "OPEN",
            "mergeable": "MERGEABLE"
        });
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, Some(42));
        assert_eq!(
            info.pr_url,
            Some("https://github.com/owner/repo/pull/42".to_string())
        );
        assert_eq!(info.title, Some("Add feature X".to_string()));
        assert_eq!(info.state, Some("OPEN".to_string()));
        assert_eq!(info.mergeable, Some("MERGEABLE".to_string()));
        assert!(info.checks.is_empty());
        assert_eq!(info.workspace_id, uuid::Uuid::nil());
    }

    #[test]
    fn test_parse_pr_info_from_json_minimal() {
        let raw = serde_json::json!({});
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, None);
        assert_eq!(info.pr_url, None);
        assert_eq!(info.title, None);
        assert_eq!(info.state, None);
        assert_eq!(info.mergeable, None);
    }

    #[test]
    fn test_parse_pr_info_from_json_partial() {
        let raw = serde_json::json!({
            "number": 7,
            "state": "CLOSED"
        });
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, Some(7));
        assert_eq!(info.pr_url, None);
        assert_eq!(info.title, None);
        assert_eq!(info.state, Some("CLOSED".to_string()));
        assert_eq!(info.mergeable, None);
    }

    // --- parse_pr_checks_from_json tests ---

    #[test]
    fn test_parse_pr_checks_from_json_multiple() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "name": "CI Build",
                "state": "SUCCESS",
                "link": "https://github.com/actions/runs/1",
                "description": "Build passed"
            },
            {
                "name": "Lint",
                "state": "FAILURE",
                "link": "https://github.com/actions/runs/2",
                "description": "Lint errors found"
            },
            {
                "name": "Deploy",
                "state": "PENDING",
                "link": null,
                "description": null
            }
        ]"#,
        )
        .unwrap();
        let checks = parse_pr_checks_from_json(&raw);
        assert_eq!(checks.len(), 3);

        assert_eq!(checks[0].name, "CI Build");
        assert_eq!(checks[0].status, "COMPLETED");
        assert_eq!(checks[0].conclusion, Some("SUCCESS".to_string()));
        assert_eq!(
            checks[0].details_url,
            Some("https://github.com/actions/runs/1".to_string())
        );
        assert_eq!(checks[0].description, Some("Build passed".to_string()));

        assert_eq!(checks[1].name, "Lint");
        assert_eq!(checks[1].status, "COMPLETED");
        assert_eq!(checks[1].conclusion, Some("FAILURE".to_string()));

        assert_eq!(checks[2].name, "Deploy");
        assert_eq!(checks[2].status, "IN_PROGRESS");
        assert_eq!(checks[2].conclusion, None);
        assert_eq!(checks[2].details_url, None);
        assert_eq!(checks[2].description, None);
    }

    #[test]
    fn test_parse_pr_checks_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        let checks = parse_pr_checks_from_json(&raw);
        assert!(checks.is_empty());
    }

    #[test]
    fn test_parse_pr_checks_from_json_missing_state() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{"name": "test"}]"#).unwrap();
        let checks = parse_pr_checks_from_json(&raw);
        assert_eq!(checks.len(), 1);
        assert_eq!(checks[0].name, "test");
        // missing state defaults to "UNKNOWN" which falls through to `other` arm
        assert_eq!(checks[0].status, "UNKNOWN");
        assert_eq!(checks[0].conclusion, None);
    }

    // --- build_create_pr_args tests ---

    #[test]
    fn test_build_create_pr_args_no_draft() {
        let args = build_create_pr_args("My PR", "Description here", "main", false);
        assert_eq!(
            args,
            vec![
                "pr",
                "create",
                "--title",
                "My PR",
                "--body",
                "Description here",
                "--base",
                "main"
            ]
        );
    }

    #[test]
    fn test_build_create_pr_args_with_draft() {
        let args = build_create_pr_args("Draft PR", "WIP", "develop", true);
        assert_eq!(
            args,
            vec![
                "pr", "create", "--title", "Draft PR", "--body", "WIP", "--base", "develop",
                "--draft"
            ]
        );
    }

    #[test]
    fn test_build_create_pr_args_empty_strings() {
        let args = build_create_pr_args("", "", "", false);
        assert_eq!(
            args,
            vec!["pr", "create", "--title", "", "--body", "", "--base", ""]
        );
    }

    #[test]
    fn test_build_create_pr_args_special_characters() {
        let args = build_create_pr_args(
            "feat: add \"quotes\" & <brackets>",
            "Body with\nnewlines",
            "main",
            false,
        );
        assert_eq!(args[3], "feat: add \"quotes\" & <brackets>");
        assert_eq!(args[5], "Body with\nnewlines");
    }

    // --- merge_method_to_flag tests ---

    #[test]
    fn test_merge_method_to_flag_squash() {
        assert_eq!(merge_method_to_flag("squash"), "--squash");
    }

    #[test]
    fn test_merge_method_to_flag_rebase() {
        assert_eq!(merge_method_to_flag("rebase"), "--rebase");
    }

    #[test]
    fn test_merge_method_to_flag_merge() {
        assert_eq!(merge_method_to_flag("merge"), "--merge");
    }

    #[test]
    fn test_merge_method_to_flag_unknown_defaults_to_merge() {
        assert_eq!(merge_method_to_flag("anything"), "--merge");
        assert_eq!(merge_method_to_flag(""), "--merge");
    }

    // --- parse_owner_repo_from_url tests ---

    #[test]
    fn test_parse_owner_repo_from_url_standard() {
        let (owner, repo) =
            parse_owner_repo_from_url("https://github.com/octocat/hello-world/pull/42").unwrap();
        assert_eq!(owner, "octocat");
        assert_eq!(repo, "hello-world");
    }

    #[test]
    fn test_parse_owner_repo_from_url_with_trailing_slash() {
        // Unusual but possible
        let (owner, repo) =
            parse_owner_repo_from_url("https://github.com/owner/repo/pull/1").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn test_parse_owner_repo_from_url_too_short() {
        let result = parse_owner_repo_from_url("https://github.com");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_owner_repo_from_url_minimal_valid() {
        // Just enough parts: a/b/c/d/e gives 5 parts
        let (owner, repo) = parse_owner_repo_from_url("a/b/c/d/e").unwrap();
        assert_eq!(owner, "b");
        assert_eq!(repo, "c");
    }

    // --- build_review_comments_api_path tests ---

    #[test]
    fn test_build_review_comments_api_path() {
        let path = build_review_comments_api_path("octocat", "hello-world", 42);
        assert_eq!(path, "repos/octocat/hello-world/pulls/42/comments");
    }

    #[test]
    fn test_build_review_comments_api_path_large_number() {
        let path = build_review_comments_api_path("org", "repo", 99999);
        assert_eq!(path, "repos/org/repo/pulls/99999/comments");
    }

    // --- parse_pr_list_from_json tests ---

    #[test]
    fn test_parse_pr_list_from_json_full() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "number": 10,
                "title": "Feature A",
                "headRefName": "feature-a",
                "baseRefName": "main",
                "state": "OPEN",
                "author": {"login": "dev1"},
                "url": "https://github.com/org/repo/pull/10"
            },
            {
                "number": 11,
                "title": "Feature B",
                "headRefName": "feature-b",
                "baseRefName": "develop",
                "state": "MERGED",
                "author": {"login": "dev2"},
                "url": "https://github.com/org/repo/pull/11"
            }
        ]"#,
        )
        .unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].number, 10);
        assert_eq!(prs[0].title, "Feature A");
        assert_eq!(prs[0].head_branch, "feature-a");
        assert_eq!(prs[0].base_branch, "main");
        assert_eq!(prs[0].state, "OPEN");
        assert_eq!(prs[0].author, "dev1");
        assert_eq!(prs[0].url, "https://github.com/org/repo/pull/10");
        assert_eq!(prs[1].number, 11);
        assert_eq!(prs[1].state, "MERGED");
    }

    #[test]
    fn test_parse_pr_list_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        let prs = parse_pr_list_from_json(&raw);
        assert!(prs.is_empty());
    }

    #[test]
    fn test_parse_pr_list_from_json_skips_missing_number() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {"title": "No number PR"},
            {"number": 5, "title": "Valid PR"}
        ]"#,
        )
        .unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 5);
    }

    #[test]
    fn test_parse_pr_list_from_json_defaults_on_missing_fields() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{"number": 1}]"#).unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 1);
        assert_eq!(prs[0].title, "");
        assert_eq!(prs[0].head_branch, "");
        assert_eq!(prs[0].base_branch, "");
        assert_eq!(prs[0].state, "");
        assert_eq!(prs[0].author, "");
        assert_eq!(prs[0].url, "");
    }

    // --- parse_pr_detail_from_json tests ---

    #[test]
    fn test_parse_pr_detail_from_json_full() {
        let raw = serde_json::json!({
            "number": 42,
            "title": "Big refactor",
            "headRefName": "refactor/big",
            "baseRefName": "main",
            "body": "This PR refactors everything.\n\n## Changes\n- A\n- B",
            "state": "OPEN",
            "url": "https://github.com/org/repo/pull/42"
        });
        let detail = parse_pr_detail_from_json(&raw);
        assert_eq!(detail.number, 42);
        assert_eq!(detail.title, "Big refactor");
        assert_eq!(detail.head_branch, "refactor/big");
        assert_eq!(detail.base_branch, "main");
        assert!(detail.body.contains("refactors everything"));
        assert_eq!(detail.state, "OPEN");
        assert_eq!(detail.url, "https://github.com/org/repo/pull/42");
    }

    #[test]
    fn test_parse_pr_detail_from_json_empty() {
        let raw = serde_json::json!({});
        let detail = parse_pr_detail_from_json(&raw);
        assert_eq!(detail.number, 0);
        assert_eq!(detail.title, "");
        assert_eq!(detail.head_branch, "");
        assert_eq!(detail.base_branch, "");
        assert_eq!(detail.body, "");
        assert_eq!(detail.state, "");
        assert_eq!(detail.url, "");
    }

    // --- parse_issue_list_from_json tests ---

    #[test]
    fn test_parse_issue_list_from_json_full() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "number": 1,
                "title": "Bug report",
                "body": "Something is broken",
                "state": "OPEN",
                "labels": [{"name": "bug"}, {"name": "priority:high"}]
            },
            {
                "number": 2,
                "title": "Feature request",
                "body": "Please add X",
                "state": "OPEN",
                "labels": []
            }
        ]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].number, 1);
        assert_eq!(issues[0].title, "Bug report");
        assert_eq!(issues[0].body, "Something is broken");
        assert_eq!(issues[0].state, "OPEN");
        assert_eq!(issues[0].labels, vec!["bug", "priority:high"]);
        assert_eq!(issues[1].number, 2);
        assert!(issues[1].labels.is_empty());
    }

    #[test]
    fn test_parse_issue_list_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        assert!(parse_issue_list_from_json(&raw).is_empty());
    }

    #[test]
    fn test_parse_issue_list_from_json_skips_missing_number() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {"title": "No number"},
            {"number": 5, "title": "Has number"}
        ]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 5);
    }

    #[test]
    fn test_parse_issue_list_from_json_no_labels_key() {
        let raw: Vec<serde_json::Value> =
            serde_json::from_str(r#"[{"number": 3, "title": "test"}]"#).unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues[0].labels, Vec::<String>::new());
    }

    #[test]
    fn test_parse_issue_list_from_json_labels_without_name() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{"number": 3, "labels": [{"name": "valid"}, {"color": "red"}]}]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues[0].labels, vec!["valid"]);
    }

    // --- parse_issue_detail_from_json tests ---

    #[test]
    fn test_parse_issue_detail_from_json_full() {
        let raw = serde_json::json!({
            "number": 99,
            "title": "Critical bug",
            "body": "The app crashes on startup",
            "state": "OPEN",
            "labels": [{"name": "bug"}, {"name": "critical"}]
        });
        let detail = parse_issue_detail_from_json(&raw);
        assert_eq!(detail.number, 99);
        assert_eq!(detail.title, "Critical bug");
        assert_eq!(detail.body, "The app crashes on startup");
        assert_eq!(detail.state, "OPEN");
        assert_eq!(detail.labels, vec!["bug", "critical"]);
    }

    #[test]
    fn test_parse_issue_detail_from_json_empty() {
        let raw = serde_json::json!({});
        let detail = parse_issue_detail_from_json(&raw);
        assert_eq!(detail.number, 0);
        assert_eq!(detail.title, "");
        assert_eq!(detail.body, "");
        assert_eq!(detail.state, "");
        assert!(detail.labels.is_empty());
    }

    // --- parse_workflow_runs_from_json tests ---

    #[test]
    fn test_parse_workflow_runs_from_json_full() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "databaseId": 12345,
                "name": "CI",
                "workflowName": "Build and Test",
                "status": "completed",
                "conclusion": "success",
                "event": "push",
                "createdAt": "2025-06-01T10:00:00Z"
            },
            {
                "databaseId": 12346,
                "name": "Deploy",
                "workflowName": "Deploy to Prod",
                "status": "in_progress",
                "conclusion": null,
                "event": "workflow_dispatch",
                "createdAt": "2025-06-01T11:00:00Z"
            }
        ]"#,
        )
        .unwrap();
        let runs = parse_workflow_runs_from_json(&raw);
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].id, 12345);
        assert_eq!(runs[0].name, "CI");
        assert_eq!(runs[0].workflow_name, "Build and Test");
        assert_eq!(runs[0].status, "completed");
        assert_eq!(runs[0].conclusion, Some("success".to_string()));
        assert_eq!(runs[0].event, "push");
        assert_eq!(runs[0].created_at, "2025-06-01T10:00:00Z");

        assert_eq!(runs[1].id, 12346);
        assert_eq!(runs[1].conclusion, None);
        assert_eq!(runs[1].status, "in_progress");
    }

    #[test]
    fn test_parse_workflow_runs_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        assert!(parse_workflow_runs_from_json(&raw).is_empty());
    }

    #[test]
    fn test_parse_workflow_runs_from_json_defaults() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{}]"#).unwrap();
        let runs = parse_workflow_runs_from_json(&raw);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, 0);
        assert_eq!(runs[0].name, "");
        assert_eq!(runs[0].workflow_name, "");
        assert_eq!(runs[0].status, "");
        assert_eq!(runs[0].conclusion, None);
        assert_eq!(runs[0].event, "");
        assert_eq!(runs[0].created_at, "");
    }

    // --- parse_run_jobs_from_json tests ---

    #[test]
    fn test_parse_run_jobs_from_json_full() {
        let raw = serde_json::json!({
            "jobs": [
                {
                    "databaseId": 100,
                    "name": "build",
                    "status": "completed",
                    "conclusion": "success",
                    "steps": [
                        {
                            "name": "Checkout",
                            "status": "completed",
                            "conclusion": "success"
                        },
                        {
                            "name": "Run tests",
                            "status": "completed",
                            "conclusion": "failure"
                        }
                    ]
                },
                {
                    "databaseId": 101,
                    "name": "deploy",
                    "status": "queued",
                    "conclusion": null,
                    "steps": []
                }
            ]
        });
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs.len(), 2);

        assert_eq!(jobs[0].id, 100);
        assert_eq!(jobs[0].name, "build");
        assert_eq!(jobs[0].status, "completed");
        assert_eq!(jobs[0].conclusion, Some("success".to_string()));
        assert_eq!(jobs[0].steps.len(), 2);
        assert_eq!(jobs[0].steps[0].name, "Checkout");
        assert_eq!(jobs[0].steps[0].status, "completed");
        assert_eq!(jobs[0].steps[0].conclusion, Some("success".to_string()));
        assert_eq!(jobs[0].steps[1].name, "Run tests");
        assert_eq!(jobs[0].steps[1].conclusion, Some("failure".to_string()));

        assert_eq!(jobs[1].id, 101);
        assert_eq!(jobs[1].name, "deploy");
        assert_eq!(jobs[1].status, "queued");
        assert_eq!(jobs[1].conclusion, None);
        assert!(jobs[1].steps.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_no_jobs_key() {
        let raw = serde_json::json!({});
        let jobs = parse_run_jobs_from_json(&raw);
        assert!(jobs.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_empty_jobs() {
        let raw = serde_json::json!({"jobs": []});
        let jobs = parse_run_jobs_from_json(&raw);
        assert!(jobs.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_no_steps_key() {
        let raw = serde_json::json!({
            "jobs": [{"databaseId": 50, "name": "test", "status": "completed"}]
        });
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs.len(), 1);
        assert!(jobs[0].steps.is_empty());
    }

    #[test]
    fn test_parse_run_jobs_from_json_defaults() {
        let raw = serde_json::json!({"jobs": [{}]});
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, 0);
        assert_eq!(jobs[0].name, "");
        assert_eq!(jobs[0].status, "");
        assert_eq!(jobs[0].conclusion, None);
        assert!(jobs[0].steps.is_empty());
    }

    // --- truncate_logs tests ---

    #[test]
    fn test_truncate_logs_short_string() {
        let (logs, truncated) = truncate_logs("hello world", 100);
        assert_eq!(logs, "hello world");
        assert!(!truncated);
    }

    #[test]
    fn test_truncate_logs_exact_boundary() {
        let input = "abcde";
        let (logs, truncated) = truncate_logs(input, 5);
        assert_eq!(logs, "abcde");
        assert!(!truncated);
    }

    #[test]
    fn test_truncate_logs_truncates() {
        let input = "abcdefghij";
        let (logs, truncated) = truncate_logs(input, 5);
        assert_eq!(logs, "abcde");
        assert!(truncated);
    }

    #[test]
    fn test_truncate_logs_empty() {
        let (logs, truncated) = truncate_logs("", 100);
        assert_eq!(logs, "");
        assert!(!truncated);
    }

    #[test]
    fn test_truncate_logs_multibyte_char_boundary() {
        // Multi-byte UTF-8: each emoji is 4 bytes
        let input = "\u{1F600}\u{1F601}\u{1F602}"; // 12 bytes total
                                                   // Truncate at 5 bytes - mid-char, should advance to byte 8 (end of second emoji)
        let (logs, truncated) = truncate_logs(input, 5);
        assert!(truncated);
        // Should include up to the next valid char boundary after byte 5,
        // which is byte 8 (end of second emoji)
        assert_eq!(logs, "\u{1F600}\u{1F601}");
    }

    #[test]
    fn test_truncate_logs_zero_max() {
        let (logs, truncated) = truncate_logs("abc", 0);
        assert_eq!(logs, "");
        assert!(truncated);
    }

    // --- log_flag_for_failed_only tests ---

    #[test]
    fn test_log_flag_for_failed_only_true() {
        assert_eq!(log_flag_for_failed_only(true), "--log-failed");
    }

    #[test]
    fn test_log_flag_for_failed_only_false() {
        assert_eq!(log_flag_for_failed_only(false), "--log");
    }

    // --- build_rerun_args tests ---

    #[test]
    fn test_build_rerun_args_no_failed() {
        let args = build_rerun_args("12345", false);
        assert_eq!(args, vec!["run", "rerun", "12345"]);
    }

    #[test]
    fn test_build_rerun_args_with_failed() {
        let args = build_rerun_args("67890", true);
        assert_eq!(args, vec!["run", "rerun", "67890", "--failed"]);
    }

    // --- parse_pr_checks integration with map_check_state ---

    #[test]
    fn test_parse_pr_checks_all_states() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {"name": "a", "state": "SUCCESS"},
            {"name": "b", "state": "FAILURE"},
            {"name": "c", "state": "ERROR"},
            {"name": "d", "state": "STARTUP_FAILURE"},
            {"name": "e", "state": "NEUTRAL"},
            {"name": "f", "state": "CANCELLED"},
            {"name": "g", "state": "TIMED_OUT"},
            {"name": "h", "state": "SKIPPED"},
            {"name": "i", "state": "ACTION_REQUIRED"},
            {"name": "j", "state": "STALE"},
            {"name": "k", "state": "PENDING"},
            {"name": "l", "state": "EXPECTED"},
            {"name": "m", "state": "QUEUED"}
        ]"#,
        )
        .unwrap();
        let checks = parse_pr_checks_from_json(&raw);
        assert_eq!(checks.len(), 13);

        // SUCCESS -> COMPLETED/SUCCESS
        assert_eq!(checks[0].status, "COMPLETED");
        assert_eq!(checks[0].conclusion, Some("SUCCESS".to_string()));
        // FAILURE -> COMPLETED/FAILURE
        assert_eq!(checks[1].status, "COMPLETED");
        assert_eq!(checks[1].conclusion, Some("FAILURE".to_string()));
        // ERROR -> COMPLETED/FAILURE
        assert_eq!(checks[2].status, "COMPLETED");
        assert_eq!(checks[2].conclusion, Some("FAILURE".to_string()));
        // STARTUP_FAILURE -> COMPLETED/FAILURE
        assert_eq!(checks[3].status, "COMPLETED");
        assert_eq!(checks[3].conclusion, Some("FAILURE".to_string()));
        // NEUTRAL -> COMPLETED/NEUTRAL
        assert_eq!(checks[4].status, "COMPLETED");
        assert_eq!(checks[4].conclusion, Some("NEUTRAL".to_string()));
        // CANCELLED -> COMPLETED/CANCELLED
        assert_eq!(checks[5].status, "COMPLETED");
        assert_eq!(checks[5].conclusion, Some("CANCELLED".to_string()));
        // TIMED_OUT -> COMPLETED/TIMED_OUT
        assert_eq!(checks[6].status, "COMPLETED");
        assert_eq!(checks[6].conclusion, Some("TIMED_OUT".to_string()));
        // SKIPPED -> COMPLETED/SKIPPED
        assert_eq!(checks[7].status, "COMPLETED");
        assert_eq!(checks[7].conclusion, Some("SKIPPED".to_string()));
        // ACTION_REQUIRED -> COMPLETED/ACTION_REQUIRED
        assert_eq!(checks[8].status, "COMPLETED");
        assert_eq!(checks[8].conclusion, Some("ACTION_REQUIRED".to_string()));
        // STALE -> COMPLETED/STALE
        assert_eq!(checks[9].status, "COMPLETED");
        assert_eq!(checks[9].conclusion, Some("STALE".to_string()));
        // PENDING -> IN_PROGRESS/None
        assert_eq!(checks[10].status, "IN_PROGRESS");
        assert_eq!(checks[10].conclusion, None);
        // EXPECTED -> IN_PROGRESS/None
        assert_eq!(checks[11].status, "IN_PROGRESS");
        assert_eq!(checks[11].conclusion, None);
        // QUEUED -> QUEUED/None
        assert_eq!(checks[12].status, "QUEUED");
        assert_eq!(checks[12].conclusion, None);
    }

    // --- Realistic end-to-end parsing fixture tests ---

    #[test]
    fn test_parse_pr_info_with_reviews_realistic() {
        let raw = serde_json::json!({
            "number": 128,
            "url": "https://github.com/acme/project/pull/128",
            "title": "feat: Auto-update system with popup and signing",
            "state": "MERGED",
            "mergeable": "UNKNOWN",
            "latestReviews": [
                {
                    "id": 2001,
                    "author": {"login": "senior-dev"},
                    "state": "APPROVED",
                    "body": "LGTM!",
                    "submittedAt": "2025-06-15T14:30:00Z"
                }
            ]
        });
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, Some(128));
        assert_eq!(info.state, Some("MERGED".to_string()));

        let reviews = parse_reviews_from_json(&raw);
        assert_eq!(reviews.len(), 1);
        assert_eq!(reviews[0].author, "senior-dev");
        assert_eq!(reviews[0].state, "APPROVED");
    }

    #[test]
    fn test_parse_comments_line_fallback_to_original_line() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "id": 500,
                "user": {"login": "reviewer"},
                "body": "This line needs fixing",
                "created_at": "2025-01-01T00:00:00Z",
                "path": "src/lib.rs",
                "line": null,
                "original_line": 55
            }
        ]"#,
        )
        .unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments[0].line, Some(55));
        assert_eq!(comments[0].path, Some("src/lib.rs".to_string()));
    }

    #[test]
    fn test_parse_comments_line_prefers_line_over_original_line() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{
                "id": 501,
                "user": {"login": "dev"},
                "body": "test",
                "created_at": "2025-01-01T00:00:00Z",
                "path": "file.rs",
                "line": 10,
                "original_line": 20
            }]"#,
        )
        .unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments[0].line, Some(10));
    }

    #[test]
    fn test_parse_pr_list_realistic_mixed_states() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "number": 100,
                "title": "WIP: New feature",
                "headRefName": "feat/new-thing",
                "baseRefName": "main",
                "state": "OPEN",
                "author": {"login": "junior-dev"},
                "url": "https://github.com/org/repo/pull/100"
            },
            {
                "number": 99,
                "title": "Hotfix: crash on login",
                "headRefName": "hotfix/login-crash",
                "baseRefName": "main",
                "state": "MERGED",
                "author": {"login": "senior-dev"},
                "url": "https://github.com/org/repo/pull/99"
            },
            {
                "number": 98,
                "title": "Abandoned experiment",
                "headRefName": "experiment/x",
                "baseRefName": "main",
                "state": "CLOSED",
                "author": {"login": "researcher"},
                "url": "https://github.com/org/repo/pull/98"
            }
        ]"#,
        )
        .unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 3);
        assert_eq!(prs[0].state, "OPEN");
        assert_eq!(prs[1].state, "MERGED");
        assert_eq!(prs[2].state, "CLOSED");
    }

    #[test]
    fn test_parse_issue_list_with_many_labels() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{
            "number": 50,
            "title": "Complex issue",
            "body": "Detailed description",
            "state": "OPEN",
            "labels": [
                {"name": "bug"},
                {"name": "priority:critical"},
                {"name": "area:frontend"},
                {"name": "good first issue"}
            ]
        }]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues[0].labels.len(), 4);
        assert!(issues[0].labels.contains(&"good first issue".to_string()));
    }

    #[test]
    fn test_parse_workflow_runs_with_null_conclusion() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{
            "databaseId": 5000,
            "name": "Tests",
            "workflowName": "CI Pipeline",
            "status": "in_progress",
            "conclusion": null,
            "event": "pull_request",
            "createdAt": "2025-06-18T09:00:00Z"
        }]"#,
        )
        .unwrap();
        let runs = parse_workflow_runs_from_json(&raw);
        assert_eq!(runs[0].id, 5000);
        assert_eq!(runs[0].conclusion, None);
        assert_eq!(runs[0].event, "pull_request");
    }

    // --- build_merge_result tests ---

    #[test]
    fn test_build_merge_result_success() {
        let result = build_merge_result(true, "  Pull request #42 merged  \n", "squash");
        assert!(result.success);
        assert_eq!(result.message, "Pull request #42 merged");
        assert_eq!(result.merge_method, "squash");
    }

    #[test]
    fn test_build_merge_result_failure() {
        let result = build_merge_result(false, "  Not mergeable: conflicts exist  ", "merge");
        assert!(!result.success);
        assert_eq!(result.message, "Not mergeable: conflicts exist");
        assert_eq!(result.merge_method, "merge");
    }

    #[test]
    fn test_build_merge_result_empty_message() {
        let result = build_merge_result(true, "", "rebase");
        assert!(result.success);
        assert_eq!(result.message, "");
        assert_eq!(result.merge_method, "rebase");
    }

    #[test]
    fn test_build_merge_result_preserves_method() {
        let result = build_merge_result(true, "ok", "custom-method");
        assert_eq!(result.merge_method, "custom-method");
    }

    // --- is_benign_not_found tests ---

    #[test]
    fn test_is_benign_not_found_no_pull_request() {
        assert!(is_benign_not_found("no pull request found for branch"));
    }

    #[test]
    fn test_is_benign_not_found_no_checks() {
        assert!(is_benign_not_found("no checks reported on this PR"));
    }

    #[test]
    fn test_is_benign_not_found_could_not_find() {
        assert!(is_benign_not_found(
            "could not find any matching pull requests"
        ));
    }

    #[test]
    fn test_is_benign_not_found_no_runs() {
        assert!(is_benign_not_found("no runs found for branch main"));
    }

    #[test]
    fn test_is_benign_not_found_real_error() {
        assert!(!is_benign_not_found("authentication required"));
    }

    #[test]
    fn test_is_benign_not_found_empty() {
        assert!(!is_benign_not_found(""));
    }

    #[test]
    fn test_is_benign_not_found_mixed_case() {
        // Currently case-sensitive
        assert!(!is_benign_not_found("No Pull Request"));
    }

    #[test]
    fn test_parse_run_jobs_with_nested_steps() {
        let raw = serde_json::json!({
            "jobs": [{
                "databaseId": 200,
                "name": "integration-tests",
                "status": "completed",
                "conclusion": "failure",
                "steps": [
                    {"name": "Setup Node", "status": "completed", "conclusion": "success"},
                    {"name": "Install deps", "status": "completed", "conclusion": "success"},
                    {"name": "Run e2e", "status": "completed", "conclusion": "failure"},
                    {"name": "Upload artifacts", "status": "completed", "conclusion": "skipped"}
                ]
            }]
        });
        let jobs = parse_run_jobs_from_json(&raw);
        assert_eq!(jobs[0].steps.len(), 4);
        assert_eq!(jobs[0].steps[2].name, "Run e2e");
        assert_eq!(jobs[0].steps[2].conclusion, Some("failure".to_string()));
        assert_eq!(jobs[0].steps[3].conclusion, Some("skipped".to_string()));
    }
}
