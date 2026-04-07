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
        let has_origin = remote_exists(repo_path, "origin");

        // Fetch the base branch so the remote-tracking ref is current.
        // Skip if there is no origin remote (e.g. local-only repo).
        if has_origin {
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
        }

        // Prefer the remote-tracking ref as the start point, falling back to
        // the local branch when there is no origin remote.
        let mut args = vec![
            "worktree".to_string(),
            "add".to_string(),
            "-b".to_string(),
            branch_name.to_string(),
            worktree_path.to_string_lossy().to_string(),
        ];
        if let Some(base) = base_branch {
            if has_origin {
                args.push(format!("origin/{}", base));
            } else {
                args.push(base.to_string());
            }
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

/// Move uncommitted changes from `repo_path` into a fresh worktree on a new branch.
///
/// Stashes the working tree (including untracked files), creates a worktree at
/// the current HEAD on `new_branch`, then pops the stash inside the new worktree.
/// On any failure after the stash is created, attempts to pop the stash back in
/// the source repo so the user does not lose work.
///
/// Errors if there are no uncommitted changes or if `new_branch` already exists.
pub fn extract_changes_to_new_worktree(
    repo_path: &Path,
    new_branch: &str,
    workspace_name: &str,
    worktree_base: &Path,
) -> Result<PathBuf, AppError> {
    // Verify there are changes to extract
    let status_output = platform::command("git")
        .args(["status", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::GitError(format!("git status failed: {}", e)))?;
    if status_output.stdout.is_empty() {
        return Err(AppError::GitError(
            "No uncommitted changes to extract".to_string(),
        ));
    }

    // Stash and `worktree add HEAD` both require at least one commit. Detect this
    // up front so the user gets a clear message instead of "You do not have the
    // initial commit yet" from git stash.
    let head_ok = platform::command("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !head_ok {
        return Err(AppError::GitError(
            "This repo has no commits yet. Make an initial commit before extracting changes to a workspace.".to_string(),
        ));
    }

    // Reject if branch already exists locally
    let branch_exists = platform::command("git")
        .args([
            "rev-parse",
            "--verify",
            &format!("refs/heads/{}", new_branch),
        ])
        .current_dir(repo_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if branch_exists {
        return Err(AppError::GitError(format!(
            "Branch '{}' already exists",
            new_branch
        )));
    }

    std::fs::create_dir_all(worktree_base)?;
    let safe_name = sanitize_name(workspace_name);
    let worktree_path = worktree_base.join(&safe_name);

    // Stash everything (including untracked) so the worktree can be created cleanly.
    let stash_message = format!("fury-extract-{}", uuid::Uuid::new_v4());
    let stash_output = platform::command("git")
        .args(["stash", "push", "--include-untracked", "-m", &stash_message])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::GitError(format!("git stash failed: {}", e)))?;
    if !stash_output.status.success() {
        return Err(AppError::GitError(format!(
            "git stash failed: {}",
            String::from_utf8_lossy(&stash_output.stderr)
        )));
    }

    // From here on, on failure we must try to restore the stash in the source repo.
    let result = (|| -> Result<PathBuf, AppError> {
        // Create the worktree at current HEAD on a new branch.
        let add_output = platform::command("git")
            .args([
                "worktree",
                "add",
                "-b",
                new_branch,
                worktree_path.to_string_lossy().as_ref(),
                "HEAD",
            ])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::GitError(format!("git worktree add failed: {}", e)))?;
        if !add_output.status.success() {
            return Err(AppError::GitError(format!(
                "git worktree add failed: {}",
                String::from_utf8_lossy(&add_output.stderr)
            )));
        }

        // Pop the stash inside the new worktree to materialize the changes there.
        let pop_output = platform::command("git")
            .args(["stash", "pop"])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| AppError::GitError(format!("git stash pop failed: {}", e)))?;
        if !pop_output.status.success() {
            // Roll back the worktree we just created so the stash stays intact for retry.
            let _ = platform::command("git")
                .args([
                    "worktree",
                    "remove",
                    "--force",
                    worktree_path.to_string_lossy().as_ref(),
                ])
                .current_dir(repo_path)
                .output();
            let _ = platform::command("git")
                .args(["branch", "-D", new_branch])
                .current_dir(repo_path)
                .output();
            return Err(AppError::GitError(format!(
                "git stash pop failed in new worktree: {}",
                String::from_utf8_lossy(&pop_output.stderr)
            )));
        }

        Ok(worktree_path.clone())
    })();

    if result.is_err() {
        // Best-effort: pop the stash back into the source repo so the user keeps their work.
        let _ = platform::command("git")
            .args(["stash", "pop"])
            .current_dir(repo_path)
            .output();
    }

    result
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_name_alphanumeric() {
        assert_eq!(sanitize_name("hello123"), "hello123");
    }

    #[test]
    fn test_sanitize_name_preserves_hyphens_underscores() {
        assert_eq!(sanitize_name("my-project_v2"), "my-project_v2");
    }

    #[test]
    fn test_sanitize_name_replaces_spaces() {
        assert_eq!(sanitize_name("my project"), "my-project");
    }

    #[test]
    fn test_sanitize_name_replaces_special_chars() {
        assert_eq!(sanitize_name("feat/branch@v1.0"), "feat-branch-v1-0");
    }

    #[test]
    fn test_sanitize_name_empty() {
        assert_eq!(sanitize_name(""), "");
    }

    #[test]
    fn test_sanitize_name_all_special() {
        assert_eq!(sanitize_name("@#$%"), "----");
    }

    #[test]
    fn test_branch_is_checked_out_found() {
        let output = "worktree /tmp/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /tmp/feature\nHEAD def456\nbranch refs/heads/feature\n";
        assert!(branch_is_checked_out(output, "main"));
        assert!(branch_is_checked_out(output, "feature"));
    }

    #[test]
    fn test_branch_is_checked_out_not_found() {
        let output = "worktree /tmp/main\nHEAD abc123\nbranch refs/heads/main\n";
        assert!(!branch_is_checked_out(output, "develop"));
    }

    #[test]
    fn test_branch_is_checked_out_empty() {
        assert!(!branch_is_checked_out("", "main"));
    }

    #[test]
    fn test_branch_is_checked_out_partial_no_false_positive() {
        let output = "branch refs/heads/main-feature\n";
        assert!(!branch_is_checked_out(output, "main"));
    }

    #[test]
    fn test_create_worktree_new_branch() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees");
        let result = create_worktree(&path, "feature-1", "Feature 1", &worktree_base, None);
        assert!(result.is_ok(), "create_worktree failed: {:?}", result.err());
        let wt_path = result.unwrap();
        assert!(wt_path.exists());
        assert!(wt_path.ends_with("Feature-1"));
    }

    #[test]
    fn test_create_worktree_branch_already_checked_out() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-b");
        let result = create_worktree(&path, "main", "ws-main", &worktree_base, None);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("main"));
    }

    #[test]
    fn test_create_worktree_existing_branch() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::process::Command::new("git")
            .args(["branch", "existing-branch"])
            .current_dir(&path)
            .output()
            .unwrap();
        let worktree_base = _dir.path().join("worktrees-c");
        let result = create_worktree(&path, "existing-branch", "ws", &worktree_base, None);
        assert!(result.is_ok(), "create_worktree failed: {:?}", result.err());
    }

    #[test]
    fn test_remove_worktree() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-d");
        let wt_path =
            create_worktree(&path, "to-remove", "Remove Me", &worktree_base, None).unwrap();
        assert!(wt_path.exists());
        let result = remove_worktree(&path, &wt_path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_remove_worktree_nonexistent() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = remove_worktree(&path, &path.join("nonexistent"));
        assert!(result.is_ok());
    }

    #[test]
    fn test_apply_sparse_checkout() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-e");
        let wt_path =
            create_worktree(&path, "sparse-test", "sparse", &worktree_base, None).unwrap();
        let result = apply_sparse_checkout(&wt_path, &["src".to_string(), "docs".to_string()]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_extract_changes_to_new_worktree_moves_modified_and_untracked() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Modify a tracked file
        std::fs::write(path.join("README.md"), "# Test\n\nmodified\n").unwrap();
        // Add an untracked file
        std::fs::write(path.join("new.txt"), "untracked content\n").unwrap();

        // Worktree base must live outside the repo, otherwise it appears as untracked.
        let outside = tempfile::tempdir().unwrap();
        let worktree_base = outside.path().join("worktrees-extract");
        let result = extract_changes_to_new_worktree(
            &path,
            "fury/extract-test",
            "extract-test",
            &worktree_base,
        );
        assert!(result.is_ok(), "extract failed: {:?}", result.err());
        let wt_path = result.unwrap();

        // Source repo is now clean
        let status = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&path)
            .output()
            .unwrap();
        assert!(
            status.stdout.is_empty(),
            "source repo should be clean after extract, got: {}",
            String::from_utf8_lossy(&status.stdout)
        );

        // New worktree contains both the modified file and the untracked file
        let readme = std::fs::read_to_string(wt_path.join("README.md")).unwrap();
        assert!(readme.contains("modified"));
        let untracked = std::fs::read_to_string(wt_path.join("new.txt")).unwrap();
        assert_eq!(untracked, "untracked content\n");
    }

    #[test]
    fn test_extract_changes_to_new_worktree_no_changes() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let outside = tempfile::tempdir().unwrap();
        let worktree_base = outside.path().join("worktrees-extract-empty");
        let result = extract_changes_to_new_worktree(
            &path,
            "fury/extract-empty",
            "extract-empty",
            &worktree_base,
        );
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("No uncommitted changes"));
    }

    #[test]
    fn test_extract_changes_to_new_worktree_no_initial_commit() {
        // Create a bare git init with no commits, then add an untracked file.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();
        std::process::Command::new("git")
            .args(["init", "--initial-branch=main"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(path.join("hello.txt"), "hi\n").unwrap();

        let outside = tempfile::tempdir().unwrap();
        let worktree_base = outside.path().join("wt");
        let result = extract_changes_to_new_worktree(
            &path,
            "fury/extract-noinit",
            "extract-noinit",
            &worktree_base,
        );
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("no commits"),
            "expected clear no-commits error, got: {}",
            msg
        );

        // Untracked file is still present in the source repo (no stash performed)
        assert!(path.join("hello.txt").exists());
    }

    #[test]
    fn test_extract_changes_to_new_worktree_existing_branch() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("README.md"), "modified\n").unwrap();
        std::process::Command::new("git")
            .args(["branch", "already-here"])
            .current_dir(&path)
            .output()
            .unwrap();

        let outside = tempfile::tempdir().unwrap();
        let worktree_base = outside.path().join("worktrees-extract-dup");
        let result = extract_changes_to_new_worktree(
            &path,
            "already-here",
            "extract-dup",
            &worktree_base,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));

        // Working tree changes are still present (no stash performed)
        let status = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&path)
            .output()
            .unwrap();
        assert!(!status.stdout.is_empty());
    }

    #[test]
    fn test_apply_sparse_checkout_empty_dirs() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-f");
        let wt_path =
            create_worktree(&path, "sparse-empty", "sparse-e", &worktree_base, None).unwrap();
        let result = apply_sparse_checkout(&wt_path, &[]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_worktree_no_origin_with_base_branch() {
        // A repo with no origin remote should still be able to create a
        // workspace from a local base branch.
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-no-origin");

        // Sanity: this repo has no remotes.
        let remotes = std::process::Command::new("git")
            .args(["remote"])
            .current_dir(&path)
            .output()
            .unwrap();
        assert!(remotes.stdout.is_empty(), "expected no remotes");

        let result = create_worktree(
            &path,
            "feature-x",
            "ws-no-origin",
            &worktree_base,
            Some("main"),
        );
        assert!(
            result.is_ok(),
            "expected create_worktree to succeed without origin: {:?}",
            result.err()
        );
    }

    #[test]
    fn test_detect_default_branch_main() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let branch = detect_default_branch(&path);
        assert_eq!(branch, "main");
    }

    #[test]
    fn test_detect_default_branch_nonexistent_path() {
        let branch = detect_default_branch(Path::new("/nonexistent/path"));
        assert_eq!(branch, "main"); // Fallback
    }

    #[test]
    fn test_sanitize_name_unicode() {
        let result = sanitize_name("feature-日本語-test");
        assert!(result.contains("feature-"));
        assert!(result.contains("-test"));
        // Unicode alphanumerics are kept by is_alphanumeric
        assert!(result.contains('日'));
    }

    #[test]
    fn test_create_worktree_sanitized_name() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-san");
        let result = create_worktree(&path, "feat-special", "feat/special@v1", &worktree_base, None);
        assert!(result.is_ok());
        let wt_path = result.unwrap();
        // Path should use sanitized name (slashes and @ replaced)
        let name = wt_path.file_name().unwrap().to_string_lossy();
        assert!(!name.contains('/'));
        assert!(!name.contains('@'));
    }

    #[test]
    fn test_remove_then_recreate_same_branch() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let worktree_base = _dir.path().join("worktrees-rc");
        let wt = create_worktree(&path, "reuse-me", "ws-reuse", &worktree_base, None).unwrap();
        remove_worktree(&path, &wt).unwrap();
        // Should be able to create again with the same branch
        let result = create_worktree(&path, "reuse-me", "ws-reuse-2", &worktree_base, None);
        assert!(result.is_ok(), "recreate failed: {:?}", result.err());
    }

    #[test]
    fn test_detect_default_branch_master() {
        let dir = tempfile::tempdir().expect("Failed to create temp dir");
        let path = dir.path().to_path_buf();
        std::process::Command::new("git")
            .args(["init", "--initial-branch=master"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(path.join("README.md"), "# Test\n").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(&path)
            .output()
            .unwrap();
        let branch = detect_default_branch(&path);
        assert_eq!(branch, "master");
    }
}

/// Check whether a named git remote is configured for `repo_path`.
fn remote_exists(repo_path: &Path, remote: &str) -> bool {
    platform::command("git")
        .args(["remote", "get-url", remote])
        .current_dir(repo_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
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
