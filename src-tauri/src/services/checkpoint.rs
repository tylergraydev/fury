use crate::error::AppError;
use crate::models::checkpoint::Checkpoint;
use std::path::Path;
use std::process::Command;
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
    let truncated_msg = if user_message.len() > 72 {
        format!("{}...", &user_message[..69])
    } else {
        user_message.to_string()
    };
    let commit_msg = format!("Checkpoint turn {}: {}", turn_index, truncated_msg);
    let commit_sha = git_commit_tree(worktree_path, &tree_sha, &commit_msg)?;

    // 4. Create a named ref
    let ref_name = format!(
        "refs/missoula/checkpoints/{}/turn-{}",
        workspace_id, turn_index
    );
    git_update_ref(worktree_path, &ref_name, &commit_sha)?;

    // 5. Unstage everything (leave working directory untouched)
    let _ = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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
    let prefix = format!("refs/missoula/checkpoints/{}/", workspace_id);

    let output = Command::new("git")
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

        // Parse turn index from ref name: refs/missoula/checkpoints/<ws_id>/turn-<N>
        if let Some(turn_str) = ref_name
            .rsplit('/')
            .next()
            .and_then(|s| s.strip_prefix("turn-"))
        {
            if let Ok(n) = turn_str.parse::<u32>() {
                if n > turn_index {
                    let del_output = Command::new("git")
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
        let output = Command::new("git")
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
    let output = Command::new("git")
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
    let output = Command::new("git")
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

fn git_update_ref(worktree_path: &Path, ref_name: &str, commit_sha: &str) -> Result<(), AppError> {
    let output = Command::new("git")
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
