use std::path::Path;
use std::process::Command;

use crate::error::AppError;
use crate::models::pr::{MergeResult, PrCheck, PrInfo};

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
