use std::path::Path;
use std::process::Command;

use crate::error::AppError;
use crate::models::pr::{MergeResult, PrCheck, PrComment, PrInfo, PrReview};

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
    let output = Command::new(&gh)
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
    let output = Command::new("git")
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

    let output = Command::new(&gh)
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
    let output = Command::new(&gh)
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

pub fn get_pr_checks(worktree_path: &Path) -> Result<Vec<PrCheck>, AppError> {
    let gh = find_gh_binary()?;
    let output = Command::new(&gh)
        .args([
            "pr",
            "checks",
            "--json",
            "name,state,conclusion,detailsUrl,description",
        ])
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
        .map(|check| PrCheck {
            name: check
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            status: check
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("UNKNOWN")
                .to_string(),
            conclusion: check
                .get("conclusion")
                .and_then(|v| v.as_str())
                .map(String::from),
            details_url: check
                .get("detailsUrl")
                .and_then(|v| v.as_str())
                .map(String::from),
            description: check
                .get("description")
                .and_then(|v| v.as_str())
                .map(String::from),
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

    let output = Command::new(&gh)
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

pub fn get_pr_reviews(worktree_path: &Path) -> Result<Vec<PrReview>, AppError> {
    let gh = find_gh_binary()?;
    let output = Command::new(&gh)
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
    let pr_output = Command::new(&gh)
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
    let api_output = Command::new(&gh)
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
