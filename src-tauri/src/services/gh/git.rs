use std::path::Path;

use crate::error::AppError;
use crate::platform;

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
