use crate::error::AppError;
use crate::models::checkpoint::Checkpoint;
use crate::platform;
use crate::services::utils::safe_truncate;
use std::path::Path;
use std::thread;
use std::time::Duration;
use uuid::Uuid;

/// Create a checkpoint by snapshotting the current worktree state into a private git ref.
pub fn create_checkpoint(
    worktree_path: &Path,
    workspace_id: Uuid,
    session_id: &str,
    turn_index: u32,
    user_message: &str,
) -> Result<Checkpoint, AppError> {
    // 1. Stage everything (with retry for lock contention)
    git_add_all_with_retry(worktree_path)?;

    // 2. Write the index as a tree object
    let tree_sha = git_write_tree(worktree_path)?;

    // 3. Create a commit object pointing to the tree
    let truncated_msg = safe_truncate(user_message, 69);
    let commit_msg = format!("Checkpoint turn {}: {}", turn_index, truncated_msg);
    let commit_sha = git_commit_tree(worktree_path, &tree_sha, &commit_msg)?;

    // 4. Create a named ref
    let ref_name = format!("refs/fury/checkpoints/{}/turn-{}", workspace_id, turn_index);
    git_update_ref(worktree_path, &ref_name, &commit_sha)?;

    // 5. Unstage everything (leave working directory untouched)
    let _ = platform::command("git")
        .args(["reset", "HEAD"])
        .current_dir(worktree_path)
        .output();

    let checkpoint = Checkpoint {
        id: Uuid::new_v4(),
        workspace_id,
        session_id: session_id.to_string(),
        turn_index,
        ref_name,
        tree_sha,
        commit_sha,
        created_at: chrono::Utc::now().to_rfc3339(),
        user_message: user_message.to_string(),
    };

    Ok(checkpoint)
}

/// Revert the worktree to match a checkpoint's tree state.
pub fn revert_to_checkpoint(worktree_path: &Path, tree_sha: &str) -> Result<(), AppError> {
    // Replace index and working tree with checkpoint tree
    let output = platform::command("git")
        .args(["read-tree", "--reset", "-u", tree_sha])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::CheckpointError(format!(
            "Failed to read-tree: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    // Remove files created after the checkpoint
    let output = platform::command("git")
        .args(["clean", "-fd"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::CheckpointError(format!(
            "Failed to clean: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Delete checkpoint refs for turns strictly greater than the given turn_index.
pub fn delete_checkpoints_after(
    worktree_path: &Path,
    workspace_id: Uuid,
    turn_index: u32,
) -> Result<Vec<String>, AppError> {
    let prefix = format!("refs/fury/checkpoints/{}/", workspace_id);

    let output = platform::command("git")
        .args(["for-each-ref", "--format=%(refname)", &prefix])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut deleted = Vec::new();

    for line in stdout.lines() {
        let ref_name = line.trim();
        if ref_name.is_empty() {
            continue;
        }

        // Parse turn index from ref name: refs/fury/checkpoints/<ws_id>/turn-<N>
        if let Some(turn_str) = ref_name
            .rsplit('/')
            .next()
            .and_then(|s| s.strip_prefix("turn-"))
        {
            if let Ok(n) = turn_str.parse::<u32>() {
                if n > turn_index {
                    let del_output = platform::command("git")
                        .args(["update-ref", "-d", ref_name])
                        .current_dir(worktree_path)
                        .output()?;

                    if del_output.status.success() {
                        deleted.push(ref_name.to_string());
                    }
                }
            }
        }
    }

    Ok(deleted)
}

// --- Helper functions ---

fn git_add_all_with_retry(worktree_path: &Path) -> Result<(), AppError> {
    for attempt in 0..3 {
        let output = platform::command("git")
            .args(["add", "--all"])
            .current_dir(worktree_path)
            .output()?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("index.lock") && attempt < 2 {
            thread::sleep(Duration::from_millis(100));
            continue;
        }

        return Err(AppError::CheckpointError(format!(
            "git add --all failed: {}",
            stderr
        )));
    }
    unreachable!()
}

fn git_write_tree(worktree_path: &Path) -> Result<String, AppError> {
    let output = platform::command("git")
        .args(["write-tree"])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::CheckpointError(format!(
            "git write-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_commit_tree(
    worktree_path: &Path,
    tree_sha: &str,
    message: &str,
) -> Result<String, AppError> {
    let output = platform::command("git")
        .args(["commit-tree", tree_sha, "-m", message])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::CheckpointError(format!(
            "git commit-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_add_all_with_retry_success() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("new_file.txt"), "content").unwrap();
        let result = git_add_all_with_retry(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_git_add_all_with_retry_non_git_dir() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = git_add_all_with_retry(dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_git_write_tree() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = git_write_tree(&path);
        assert!(result.is_ok());
        let sha = result.unwrap();
        assert_eq!(sha.len(), 40);
        assert!(sha.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_git_write_tree_non_git_dir() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = git_write_tree(dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_git_commit_tree() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let tree_sha = git_write_tree(&path).unwrap();
        let result = git_commit_tree(&path, &tree_sha, "test commit");
        assert!(result.is_ok());
        let commit_sha = result.unwrap();
        assert_eq!(commit_sha.len(), 40);
    }

    #[test]
    fn test_git_commit_tree_invalid_sha() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = git_commit_tree(&path, "invalid_sha", "test");
        assert!(result.is_err());
    }

    #[test]
    fn test_git_update_ref_success() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let tree_sha = git_write_tree(&path).unwrap();
        let commit_sha = git_commit_tree(&path, &tree_sha, "test").unwrap();
        let result = git_update_ref(&path, "refs/fury/test", &commit_sha);
        assert!(result.is_ok());
        // Verify ref exists
        let output = std::process::Command::new("git")
            .args(["rev-parse", "refs/fury/test"])
            .current_dir(&path)
            .output()
            .unwrap();
        assert!(output.status.success());
    }

    #[test]
    fn test_git_update_ref_invalid_commit() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = git_update_ref(&path, "refs/fury/test", "invalid");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_checkpoint() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("file.txt"), "hello").unwrap();
        let ws_id = Uuid::new_v4();
        let result = create_checkpoint(&path, ws_id, "session-1", 0, "Initial message");
        assert!(result.is_ok());
        let cp = result.unwrap();
        assert_eq!(cp.workspace_id, ws_id);
        assert_eq!(cp.session_id, "session-1");
        assert_eq!(cp.turn_index, 0);
        assert_eq!(cp.user_message, "Initial message");
        assert_eq!(cp.tree_sha.len(), 40);
        assert_eq!(cp.commit_sha.len(), 40);
    }

    #[test]
    fn test_create_checkpoint_long_message_truncated() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("file.txt"), "content").unwrap();
        let long_msg = "a".repeat(100);
        let cp = create_checkpoint(&path, Uuid::new_v4(), "s", 0, &long_msg).unwrap();
        assert_eq!(cp.user_message, long_msg); // user_message preserves full
                                               // The commit message is truncated internally
    }

    #[test]
    fn test_create_checkpoint_short_message_not_truncated() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        std::fs::write(path.join("file.txt"), "content").unwrap();
        let msg = "short message";
        let cp = create_checkpoint(&path, Uuid::new_v4(), "s", 0, msg).unwrap();
        assert_eq!(cp.user_message, msg);
    }

    #[test]
    fn test_revert_to_checkpoint() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        // Create initial checkpoint
        std::fs::write(path.join("original.txt"), "original").unwrap();
        let cp = create_checkpoint(&path, Uuid::new_v4(), "s", 0, "initial").unwrap();

        // Make changes after checkpoint
        std::fs::write(path.join("new_file.txt"), "new").unwrap();
        std::fs::write(path.join("original.txt"), "modified").unwrap();

        // Revert
        let result = revert_to_checkpoint(&path, &cp.tree_sha);
        assert!(result.is_ok());

        // Verify new file removed
        assert!(!path.join("new_file.txt").exists());
        // Verify original content restored
        let content = std::fs::read_to_string(path.join("original.txt")).unwrap();
        assert_eq!(content, "original");
    }

    #[test]
    fn test_revert_to_checkpoint_invalid_tree() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let result = revert_to_checkpoint(&path, "0000000000000000000000000000000000000000");
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_checkpoints_after() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let ws_id = Uuid::new_v4();

        // Create 3 checkpoints
        std::fs::write(path.join("f.txt"), "v0").unwrap();
        create_checkpoint(&path, ws_id, "s", 0, "turn 0").unwrap();
        std::fs::write(path.join("f.txt"), "v1").unwrap();
        create_checkpoint(&path, ws_id, "s", 1, "turn 1").unwrap();
        std::fs::write(path.join("f.txt"), "v2").unwrap();
        create_checkpoint(&path, ws_id, "s", 2, "turn 2").unwrap();

        // Delete after turn 0 (should delete turn 1 and 2)
        let deleted = delete_checkpoints_after(&path, ws_id, 0).unwrap();
        assert_eq!(deleted.len(), 2);
    }

    #[test]
    fn test_delete_checkpoints_after_none_to_delete() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let ws_id = Uuid::new_v4();
        std::fs::write(path.join("f.txt"), "v0").unwrap();
        create_checkpoint(&path, ws_id, "s", 0, "turn 0").unwrap();

        let deleted = delete_checkpoints_after(&path, ws_id, 5).unwrap();
        assert!(deleted.is_empty());
    }

    #[test]
    fn test_delete_checkpoints_after_no_refs() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let deleted = delete_checkpoints_after(&path, Uuid::new_v4(), 0).unwrap();
        assert!(deleted.is_empty());
    }

    #[test]
    fn test_full_checkpoint_workflow() {
        let (_dir, path) = crate::test_helpers::create_temp_git_repo();
        let ws_id = Uuid::new_v4();

        // Create file and checkpoint at turn 0
        std::fs::write(path.join("file.txt"), "version 0").unwrap();
        let cp0 = create_checkpoint(&path, ws_id, "s", 0, "initial").unwrap();

        // Modify and create checkpoint at turn 1
        std::fs::write(path.join("file.txt"), "version 1").unwrap();
        std::fs::write(path.join("extra.txt"), "extra").unwrap();
        let _cp1 = create_checkpoint(&path, ws_id, "s", 1, "changes").unwrap();

        // Revert to turn 0
        revert_to_checkpoint(&path, &cp0.tree_sha).unwrap();
        assert_eq!(
            std::fs::read_to_string(path.join("file.txt")).unwrap(),
            "version 0"
        );
        assert!(!path.join("extra.txt").exists());

        // Delete checkpoints after turn 0
        let deleted = delete_checkpoints_after(&path, ws_id, 0).unwrap();
        assert_eq!(deleted.len(), 1);
    }
}

fn git_update_ref(worktree_path: &Path, ref_name: &str, commit_sha: &str) -> Result<(), AppError> {
    let output = platform::command("git")
        .args(["update-ref", ref_name, commit_sha])
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::CheckpointError(format!(
            "git update-ref failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}
