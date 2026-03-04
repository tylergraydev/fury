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

pub fn create_pr(
    worktree_path: &Path,
    title: &str,
    body: &str,
    base_branch: &str,
    draft: bool,
) -> Result<PrInfo, AppError> {
    let gh = find_gh_binary()?;
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

    Ok(Some(PrInfo {
        workspace_id: uuid::Uuid::nil(), // filled in by caller
        pr_number: raw.get("number").and_then(|v| v.as_u64()),
        pr_url: raw.get("url").and_then(|v| v.as_str()).map(String::from),
        title: raw.get("title").and_then(|v| v.as_str()).map(String::from),
        state: raw.get("state").and_then(|v| v.as_str()).map(String::from),
        checks: Vec::new(),
        mergeable: raw
            .get("mergeable")
            .and_then(|v| v.as_str())
            .map(String::from),
    }))
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

pub fn get_pr_checks(worktree_path: &Path) -> Result<Vec<PrCheck>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "checks", "--json", "name,state,link,description"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr checks: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("no pull request")
            || stderr.contains("no checks")
            || stderr.contains("could not find")
        {
            return Ok(Vec::new());
        }
        return Err(AppError::PrError(format!(
            "gh pr checks failed: {}",
            stderr
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse checks output: {}", e)))?;

    Ok(raw
        .iter()
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
        .collect())
}

pub fn merge_pr(worktree_path: &Path, method: &str) -> Result<MergeResult, AppError> {
    let gh = find_gh_binary()?;
    let merge_flag = match method {
        "squash" => "--squash",
        "rebase" => "--rebase",
        _ => "--merge",
    };

    let output = platform::command(&gh)
        .args(["pr", "merge", merge_flag, "--delete-branch"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr merge: {}", e)))?;

    let message = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    };

    Ok(MergeResult {
        success: output.status.success(),
        message,
        merge_method: method.to_string(),
    })
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

    let info = PrInfo {
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
    };

    let reviews = parse_reviews_from_json(&raw);

    Ok(Some((info, reviews)))
}

/// Fetch review comments given known PR metadata, avoiding a redundant `gh pr view` call.
pub fn get_pr_review_comments_for_pr(
    worktree_path: &Path,
    pr_number: u64,
    pr_url: &str,
) -> Result<Vec<PrComment>, AppError> {
    let gh = find_gh_binary()?;

    let parts: Vec<&str> = pr_url.split('/').collect();
    if parts.len() < 5 {
        return Err(AppError::PrError(format!(
            "Could not parse owner/repo from URL: {}",
            pr_url
        )));
    }
    let owner = parts[parts.len() - 4];
    let repo = parts[parts.len() - 3];

    let api_path = format!("repos/{}/{}/pulls/{}/comments", owner, repo, pr_number);
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

fn parse_reviews_from_json(raw: &serde_json::Value) -> Vec<PrReview> {
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

fn parse_comments_from_json(raw: &[serde_json::Value]) -> Vec<PrComment> {
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

    let reviews = raw
        .get("latestReviews")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(reviews
        .iter()
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
        .collect())
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
    let parts: Vec<&str> = pr_url.split('/').collect();
    if parts.len() < 5 {
        return Err(AppError::PrError(format!(
            "Could not parse owner/repo from URL: {}",
            pr_url
        )));
    }
    let owner = parts[parts.len() - 4];
    let repo = parts[parts.len() - 3];

    // Fetch inline review comments via API
    let api_path = format!("repos/{}/{}/pulls/{}/comments", owner, repo, pr_number);
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

    Ok(raw
        .iter()
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
        .collect())
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

    Ok(raw
        .iter()
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
        .collect())
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

    Ok(PrDetail {
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
    })
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

    Ok(raw
        .iter()
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
        .collect())
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

    Ok(IssueDetail {
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
    })
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
        if stderr.contains("no runs") || stderr.contains("could not find") {
            return Ok(Vec::new());
        }
        return Err(AppError::PrError(format!("gh run list failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse workflow runs: {}", e)))?;

    Ok(raw
        .iter()
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
        .collect())
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

    let jobs = raw
        .get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(jobs
        .iter()
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
        .collect())
}

pub fn get_run_logs(
    worktree_path: &Path,
    run_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    let gh = find_gh_binary()?;
    let log_flag = if failed_only { "--log-failed" } else { "--log" };
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
    const MAX_BYTES: usize = 100_000;
    let truncated = full.len() > MAX_BYTES;
    let logs = if truncated {
        let mut end = MAX_BYTES;
        while end < full.len() && !full.is_char_boundary(end) {
            end += 1;
        }
        full[..end].to_string()
    } else {
        full.into_owned()
    };

    Ok(RunLogsResult { logs, truncated })
}

pub fn rerun_workflow(
    worktree_path: &Path,
    run_id: u64,
    failed_only: bool,
) -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let run_id_str = run_id.to_string();
    let mut args = vec!["run", "rerun", &run_id_str];
    if failed_only {
        args.push("--failed");
    }

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
}
