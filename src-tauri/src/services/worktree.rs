use crate::error::AppError;
use crate::platform;
use std::path::{Path, PathBuf};

/// Create an isolated git worktree for a workspace.
pub fn create_worktree(
    repo_path: &Path,
    branch_name: &str,
    workspace_name: &str,
    worktree_base: &Path,
    base_branch: Option<&str>,
) -> Result<PathBuf, AppError> {
    std::fs::create_dir_all(worktree_base)?;

    let safe_name = sanitize_name(workspace_name);
    let worktree_path = worktree_base.join(&safe_name);

    // Check branch not already checked out
    let existing = platform::command("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_path)
        .output()?;

    let existing_str = String::from_utf8_lossy(&existing.stdout);
    if branch_is_checked_out(&existing_str, branch_name) {
        return Err(AppError::BranchInUse(branch_name.to_string()));
    }

    // Check if branch exists
    let branch_exists = platform::command("git")
        .args([
            "rev-parse",
            "--verify",
            &format!("refs/heads/{}", branch_name),
        ])
        .current_dir(repo_path)
        .output()?
        .status
        .success();

    let output = if branch_exists {
        platform::command("git")
            .args([
                "worktree",
                "add",
                worktree_path.to_string_lossy().as_ref(),
                branch_name,
            ])
            .current_dir(repo_path)
            .output()?
    } else {
        // Fetch the base branch so the remote-tracking ref is current
        if let Some(base) = base_branch {
            let fetch_output = platform::command("git")
                .args(["fetch", "origin", base])
                .current_dir(repo_path)
                .output()?;

            if !fetch_output.status.success() {
                return Err(AppError::GitError(format!(
                    "Failed to fetch '{}' from origin: {}",
                    base,
                    String::from_utf8_lossy(&fetch_output.stderr).trim()
                )));
            }
        }

        // Use the remote-tracking ref as the start point instead of the local branch
        let mut args = vec![
            "worktree".to_string(),
            "add".to_string(),
            "-b".to_string(),
            branch_name.to_string(),
            worktree_path.to_string_lossy().to_string(),
        ];
        if let Some(base) = base_branch {
            args.push(format!("origin/{}", base));
        }
        platform::command("git")
            .args(&args)
            .current_dir(repo_path)
            .output()?
    };

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(worktree_path)
}

/// Remove a git worktree.
pub fn remove_worktree(repo_path: &Path, worktree_path: &Path) -> Result<(), AppError> {
    let output = platform::command("git")
        .args([
            "worktree",
            "remove",
            "--force",
            worktree_path.to_string_lossy().as_ref(),
        ])
        .current_dir(repo_path)
        .output()?;

    if !output.status.success() {
        // Fallback: remove the directory manually
        let _ = std::fs::remove_dir_all(worktree_path);
    }

    // Prune stale references
    let _ = platform::command("git")
        .args(["worktree", "prune"])
        .current_dir(repo_path)
        .output();

    Ok(())
}

/// Apply sparse checkout to restrict visible directories.
pub fn apply_sparse_checkout(worktree_path: &Path, dirs: &[String]) -> Result<(), AppError> {
    platform::command("git")
        .args(["sparse-checkout", "init", "--cone"])
        .current_dir(worktree_path)
        .output()?;

    let mut cmd = platform::command("git");
    cmd.arg("sparse-checkout").arg("set");
    for dir in dirs {
        cmd.arg(dir);
    }
    let output = cmd.current_dir(worktree_path).output()?;

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

fn branch_is_checked_out(porcelain_output: &str, branch_name: &str) -> bool {
    let target = format!("branch refs/heads/{}", branch_name);
    porcelain_output.lines().any(|line| line == target)
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

/// Detect the default branch of a repository.
pub fn detect_default_branch(repo_path: &Path) -> String {
    let output = platform::command("git")
        .args(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])
        .current_dir(repo_path)
        .output();

    if let Ok(output) = output {
        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // Strip "origin/" prefix
            return branch
                .strip_prefix("origin/")
                .unwrap_or(&branch)
                .to_string();
        }
    }

    // Fallback: check for common branch names
    for name in &["main", "master"] {
        let check = platform::command("git")
            .args(["rev-parse", "--verify", &format!("refs/heads/{}", name)])
            .current_dir(repo_path)
            .output();
        if let Ok(output) = check {
            if output.status.success() {
                return name.to_string();
            }
        }
    }

    "main".to_string()
}
