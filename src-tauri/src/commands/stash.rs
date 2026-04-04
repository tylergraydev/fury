use crate::commands::merge::resolve_workspace;
use crate::error::AppError;
use crate::models::stash::{StashDetail, StashEntry};
use crate::services::stash as stash_svc;
use crate::state::AppState;
use tauri::State;

/// Extract worktree path from state for a given workspace ID.
/// Returns just the PathBuf needed for stash operations.
pub(crate) fn resolve_worktree_path(
    state: &State<'_, AppState>,
    workspace_id: &str,
) -> Result<std::path::PathBuf, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(state, workspace_id)?;
    Ok(worktree_path)
}

/// Inner: list stashes at a given worktree path.
pub(crate) fn list_stashes_inner(
    worktree_path: &std::path::Path,
) -> Result<Vec<StashEntry>, AppError> {
    stash_svc::list_stashes(worktree_path)
}

/// Inner: create a stash at a given worktree path.
pub(crate) fn create_stash_inner(
    worktree_path: &std::path::Path,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<StashEntry, AppError> {
    stash_svc::create_stash(worktree_path, message, include_untracked)
}

/// Inner: apply a stash at a given worktree path.
pub(crate) fn apply_stash_inner(
    worktree_path: &std::path::Path,
    index: u32,
) -> Result<(), AppError> {
    stash_svc::apply_stash(worktree_path, index)
}

/// Inner: pop a stash at a given worktree path.
pub(crate) fn pop_stash_inner(
    worktree_path: &std::path::Path,
    index: u32,
) -> Result<(), AppError> {
    stash_svc::pop_stash(worktree_path, index)
}

/// Inner: drop a stash at a given worktree path.
pub(crate) fn drop_stash_inner(
    worktree_path: &std::path::Path,
    index: u32,
) -> Result<(), AppError> {
    stash_svc::drop_stash(worktree_path, index)
}

/// Inner: show stash details at a given worktree path.
pub(crate) fn show_stash_inner(
    worktree_path: &std::path::Path,
    index: u32,
) -> Result<StashDetail, AppError> {
    stash_svc::show_stash(worktree_path, index)
}

#[tauri::command]
#[specta::specta]
pub async fn list_stashes(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<StashEntry>, AppError> {
    let worktree_path = resolve_worktree_path(&state, &workspace_id)?;

    tokio::task::spawn_blocking(move || list_stashes_inner(&worktree_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn create_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<StashEntry, AppError> {
    let worktree_path = resolve_worktree_path(&state, &workspace_id)?;
    let include = include_untracked.unwrap_or(false);

    tokio::task::spawn_blocking(move || {
        create_stash_inner(&worktree_path, message.as_deref(), include)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn apply_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<(), AppError> {
    let worktree_path = resolve_worktree_path(&state, &workspace_id)?;

    tokio::task::spawn_blocking(move || apply_stash_inner(&worktree_path, index))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn pop_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<(), AppError> {
    let worktree_path = resolve_worktree_path(&state, &workspace_id)?;

    tokio::task::spawn_blocking(move || pop_stash_inner(&worktree_path, index))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn drop_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<(), AppError> {
    let worktree_path = resolve_worktree_path(&state, &workspace_id)?;

    tokio::task::spawn_blocking(move || drop_stash_inner(&worktree_path, index))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn show_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<StashDetail, AppError> {
    let worktree_path = resolve_worktree_path(&state, &workspace_id)?;

    tokio::task::spawn_blocking(move || show_stash_inner(&worktree_path, index))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::create_temp_git_repo;

    #[test]
    fn test_list_stashes_inner_empty_repo() {
        let (_dir, path) = create_temp_git_repo();
        let result = list_stashes_inner(&path);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_list_stashes_inner_nonexistent_path() {
        let path = std::path::Path::new("/tmp/nonexistent-stash-test-path");
        let result = list_stashes_inner(path);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_stash_inner_nothing_to_stash() {
        let (_dir, path) = create_temp_git_repo();
        // No changes to stash — should error
        let result = create_stash_inner(&path, Some("empty stash"), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_and_list_stash_inner() {
        let (_dir, path) = create_temp_git_repo();
        // Create a tracked file change to stash
        std::fs::write(path.join("README.md"), "# Modified\n").unwrap();
        let result = create_stash_inner(&path, Some("test stash"), false);
        assert!(result.is_ok());
        let entry = result.unwrap();
        assert!(entry.message.contains("test stash"));

        // Now list
        let stashes = list_stashes_inner(&path).unwrap();
        assert_eq!(stashes.len(), 1);
    }

    #[test]
    fn test_create_stash_inner_with_untracked() {
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(path.join("new_file.txt"), "untracked content").unwrap();
        let result = create_stash_inner(&path, Some("with untracked"), true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_apply_stash_inner_no_stashes() {
        let (_dir, path) = create_temp_git_repo();
        let result = apply_stash_inner(&path, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_apply_stash_inner_success() {
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(path.join("README.md"), "# Modified\n").unwrap();
        create_stash_inner(&path, Some("to apply"), false).unwrap();

        let result = apply_stash_inner(&path, 0);
        assert!(result.is_ok());
        // File should be restored
        let content = std::fs::read_to_string(path.join("README.md")).unwrap();
        assert_eq!(content, "# Modified\n");
    }

    #[test]
    fn test_pop_stash_inner_no_stashes() {
        let (_dir, path) = create_temp_git_repo();
        let result = pop_stash_inner(&path, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_pop_stash_inner_success() {
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(path.join("README.md"), "# Popped\n").unwrap();
        create_stash_inner(&path, Some("to pop"), false).unwrap();

        let result = pop_stash_inner(&path, 0);
        assert!(result.is_ok());
        // Stash should be removed
        let stashes = list_stashes_inner(&path).unwrap();
        assert!(stashes.is_empty());
    }

    #[test]
    fn test_drop_stash_inner_no_stashes() {
        let (_dir, path) = create_temp_git_repo();
        let result = drop_stash_inner(&path, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_drop_stash_inner_success() {
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(path.join("README.md"), "# Drop me\n").unwrap();
        create_stash_inner(&path, Some("to drop"), false).unwrap();

        let result = drop_stash_inner(&path, 0);
        assert!(result.is_ok());
        let stashes = list_stashes_inner(&path).unwrap();
        assert!(stashes.is_empty());
    }

    #[test]
    fn test_show_stash_inner_no_stashes() {
        let (_dir, path) = create_temp_git_repo();
        let result = show_stash_inner(&path, 0);
        // Service may return Ok with empty data or Err depending on git behavior
        if let Ok(detail) = &result {
            assert!(detail.files.is_empty() || detail.patch.is_empty());
        }
    }

    #[test]
    fn test_show_stash_inner_success() {
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(path.join("README.md"), "# Show detail\n").unwrap();
        create_stash_inner(&path, Some("show me"), false).unwrap();

        let result = show_stash_inner(&path, 0);
        assert!(result.is_ok());
        let detail = result.unwrap();
        assert!(detail.message.contains("show me"));
        assert!(!detail.files.is_empty());
    }

    #[test]
    fn test_apply_stash_inner_invalid_index() {
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(path.join("README.md"), "# Modified\n").unwrap();
        create_stash_inner(&path, Some("stash"), false).unwrap();

        let result = apply_stash_inner(&path, 99);
        assert!(result.is_err());
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_list_stashes_command_with_workspace() {
        use crate::test_helpers::*;
        use tauri::Manager;

        let (_dir, repo_path) = create_temp_git_repo();
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        // Set up repo + workspace in DB and state, pointing worktree to real git repo
        let (repo, mut ws) = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            insert_test_repo_and_workspace(db)
        };
        ws.worktree_path = repo_path;
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());
        state.repositories.write().unwrap().insert(repo.id, repo.clone());

        let result = list_stashes(state, ws.id.to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_list_stashes_command_workspace_not_found() {
        use crate::test_helpers::*;
        use tauri::Manager;
        use uuid::Uuid;

        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = list_stashes(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }
}
