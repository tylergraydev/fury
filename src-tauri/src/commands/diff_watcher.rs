use crate::error::AppError;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn start_diff_watcher(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
) -> Result<(), AppError> {
    let ctx_uuid: Uuid = context_id
        .parse()
        .map_err(|_| AppError::GitError("invalid context id".into()))?;

    if state.diff_watchers.lock().unwrap().contains_key(&ctx_uuid) {
        return Ok(());
    }

    let watch_path = if context_type == "workspace" {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ctx_uuid)
            .ok_or(AppError::WorkspaceNotFound(ctx_uuid))?;
        ws.worktree_path.clone()
    } else {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ctx_uuid)
            .ok_or(AppError::RepoNotFound(ctx_uuid))?;
        repo.path.clone()
    };

    let cid = context_id.clone();
    let handle = tokio::task::spawn_blocking(move || {
        crate::services::diff_watcher::start_diff_watcher(watch_path, app, cid)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    state.diff_watchers.lock().unwrap().insert(ctx_uuid, handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_diff_watcher(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<(), AppError> {
    let ctx_uuid: Uuid = context_id
        .parse()
        .map_err(|_| AppError::GitError("invalid context id".into()))?;

    let handle = state.diff_watchers.lock().unwrap().remove(&ctx_uuid);
    if let Some(handle) = handle {
        tokio::task::spawn_blocking(move || {
            handle.stop();
        })
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;
    use tauri::Manager;

    #[tokio::test]
    async fn test_cmd_stop_diff_watcher_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = stop_diff_watcher(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_diff_watcher_no_watcher() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        // Valid UUID but no watcher registered — should succeed (noop)
        let result = stop_diff_watcher(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_stop_diff_watcher_valid_uuid_no_watcher() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = stop_diff_watcher(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }
}
