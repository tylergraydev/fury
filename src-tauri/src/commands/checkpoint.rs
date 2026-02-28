use crate::error::AppError;
use crate::models::agent::AgentStatus;
use crate::models::checkpoint::Checkpoint;
use crate::services::checkpoint as checkpoint_svc;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

#[tauri::command]
pub async fn list_checkpoints(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<Checkpoint>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.list_checkpoints(&ws_id)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn revert_to_checkpoint(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    checkpoint_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let cp_id: Uuid = checkpoint_id
        .parse()
        .map_err(|_| AppError::CheckpointError("Invalid checkpoint ID".to_string()))?;

    // Reject if agent is running
    {
        let agents = state.agents.lock().unwrap();
        if let Some(agent) = agents.get(&ws_id) {
            if agent.status == AgentStatus::Running {
                return Err(AppError::CheckpointError(
                    "Stop the agent before reverting".to_string(),
                ));
            }
        }
    }

    // Look up checkpoint from DB
    let checkpoint = {
        let db = state.db.lock().unwrap();
        db.as_ref()
            .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?
            .get_checkpoint(&cp_id)?
            .ok_or_else(|| AppError::CheckpointError("Checkpoint not found".to_string()))?
    };

    // Get worktree path
    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let tree_sha = checkpoint.tree_sha.clone();
    let turn_index = checkpoint.turn_index;
    let worktree_path_clone = worktree_path.clone();

    // Revert filesystem to checkpoint state + delete later checkpoint refs (git I/O)
    tokio::task::spawn_blocking(move || {
        checkpoint_svc::revert_to_checkpoint(&worktree_path_clone, &tree_sha)?;
        let _ =
            checkpoint_svc::delete_checkpoints_after(&worktree_path_clone, ws_id, turn_index);
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    // Delete later checkpoints from DB
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            let _ = db.delete_checkpoints_after(&ws_id, turn_index);
        }
    }

    // Clear agent session so next message starts fresh
    {
        let mut agents = state.agents.lock().unwrap();
        if let Some(agent) = agents.get_mut(&ws_id) {
            agent.session_id = None;
        }
    }

    // Emit revert event to frontend
    let _ = app.emit(
        &format!("checkpoint-reverted:{}", ws_id),
        serde_json::json!({ "turnIndex": turn_index }),
    );

    Ok(())
}
