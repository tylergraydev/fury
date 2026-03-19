use crate::error::AppError;
use crate::models::agent::AgentStatus;
use crate::models::checkpoint::Checkpoint;
use crate::services::checkpoint as checkpoint_svc;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

/// Inner: list checkpoints for a workspace from the database.
pub(crate) fn list_checkpoints_inner(
    db: &crate::db::Database,
    workspace_id: &str,
) -> Result<Vec<Checkpoint>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    db.list_checkpoints(&ws_id)
}

/// Inner: validate revert preconditions and return the checkpoint + worktree path.
/// Checks: valid IDs, agent not running, checkpoint exists, workspace exists.
pub(crate) fn validate_revert(
    db: &crate::db::Database,
    agents: &std::collections::HashMap<Uuid, crate::models::agent::AgentInfo>,
    workspaces: &std::collections::HashMap<Uuid, crate::models::workspace::Workspace>,
    workspace_id: &str,
    checkpoint_id: &str,
) -> Result<(Checkpoint, std::path::PathBuf), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let cp_id: Uuid = checkpoint_id
        .parse()
        .map_err(|_| AppError::CheckpointError("Invalid checkpoint ID".to_string()))?;

    // Reject if agent is running
    if let Some(agent) = agents.get(&ws_id) {
        if agent.status == AgentStatus::Running {
            return Err(AppError::CheckpointError(
                "Stop the agent before reverting".to_string(),
            ));
        }
    }

    // Look up checkpoint
    let checkpoint = db
        .get_checkpoint(&cp_id)?
        .ok_or_else(|| AppError::CheckpointError("Checkpoint not found".to_string()))?;

    // Get worktree path
    let ws = workspaces
        .get(&ws_id)
        .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    let worktree_path = ws.worktree_path.clone();

    Ok((checkpoint, worktree_path))
}

#[tauri::command]
pub async fn list_checkpoints(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<Checkpoint>, AppError> {
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        list_checkpoints_inner(db, &workspace_id)
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

    // Validate using inner function
    let (checkpoint, worktree_path) = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
        let agents = state.agents.lock().unwrap();
        let workspaces = state.workspaces.read().unwrap();
        validate_revert(db, &agents, &workspaces, &workspace_id, &checkpoint_id)?
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::agent::AgentInfo;
    use crate::test_helpers::*;
    use std::collections::HashMap;

    #[test]
    fn test_list_checkpoints_inner_empty() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let result = list_checkpoints_inner(&db, &ws.id.to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_list_checkpoints_inner_invalid_id() {
        let db = test_db();
        let result = list_checkpoints_inner(&db, "bad-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_checkpoints_inner_with_data() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).expect("insert checkpoint");

        let result = list_checkpoints_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, cp.id);
    }

    #[test]
    fn test_validate_revert_invalid_workspace_id() {
        let db = test_db();
        let agents = HashMap::new();
        let workspaces = HashMap::new();
        let result = validate_revert(&db, &agents, &workspaces, "bad-id", &Uuid::new_v4().to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_revert_invalid_checkpoint_id() {
        let db = test_db();
        let agents = HashMap::new();
        let workspaces = HashMap::new();
        let ws_id = Uuid::new_v4();
        let result = validate_revert(&db, &agents, &workspaces, &ws_id.to_string(), "bad-cp-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_revert_agent_running() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).expect("insert checkpoint");

        let mut agents = HashMap::new();
        let mut agent_info = AgentInfo::new(ws.id);
        agent_info.status = AgentStatus::Running;
        agents.insert(ws.id, agent_info);

        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws.clone());

        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &cp.id.to_string(),
        );
        assert!(result.is_err());
        let err_msg = format!("{}", result.unwrap_err());
        assert!(err_msg.contains("Stop the agent"));
    }

    #[test]
    fn test_validate_revert_checkpoint_not_found() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let agents = HashMap::new();
        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws.clone());

        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &Uuid::new_v4().to_string(),
        );
        assert!(result.is_err());
        let err_msg = format!("{}", result.unwrap_err());
        assert!(err_msg.contains("not found"));
    }

    #[test]
    fn test_validate_revert_workspace_not_found() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).expect("insert checkpoint");

        let agents = HashMap::new();
        let workspaces = HashMap::new(); // empty — workspace not in map

        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &cp.id.to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_revert_success() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).expect("insert checkpoint");

        let agents = HashMap::new();
        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws.clone());

        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &cp.id.to_string(),
        );
        assert!(result.is_ok());
        let (checkpoint, path) = result.unwrap();
        assert_eq!(checkpoint.id, cp.id);
        assert_eq!(path, ws.worktree_path);
    }

    #[test]
    fn test_validate_revert_agent_idle_ok() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).expect("insert checkpoint");

        let mut agents = HashMap::new();
        let agent_info = AgentInfo::new(ws.id); // default is Idle
        agents.insert(ws.id, agent_info);

        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws.clone());

        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &cp.id.to_string(),
        );
        assert!(result.is_ok());
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_list_checkpoints_command_empty() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            ws.id
        };

        let result = list_checkpoints(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_list_checkpoints_command_with_data() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            let cp = test_checkpoint(ws.id);
            db.insert_checkpoint(&cp).expect("insert checkpoint");
            ws.id
        };

        let result = list_checkpoints(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_list_checkpoints_command_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = list_checkpoints(state, "bad-uuid".to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Additional tests for revert_to_checkpoint via validate_revert inner function
    // Note: revert_to_checkpoint takes AppHandle (Wry runtime) so can't be called
    // directly from MockRuntime tests. Test validate_revert instead.
    // -----------------------------------------------------------------------

    #[test]
    fn test_validate_revert_agent_stopped_ok() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).expect("insert checkpoint");

        let mut agents = HashMap::new();
        let mut agent_info = AgentInfo::new(ws.id);
        agent_info.status = AgentStatus::Idle;
        agents.insert(ws.id, agent_info);

        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws.clone());

        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &cp.id.to_string(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_revert_multiple_checkpoints() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let cp1 = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp1).expect("insert checkpoint 1");

        let mut cp2 = test_checkpoint(ws.id);
        cp2.turn_index = 1;
        db.insert_checkpoint(&cp2).expect("insert checkpoint 2");

        let agents = HashMap::new();
        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws.clone());

        // Can revert to either checkpoint
        let result = validate_revert(
            &db,
            &agents,
            &workspaces,
            &ws.id.to_string(),
            &cp1.id.to_string(),
        );
        assert!(result.is_ok());
        let (checkpoint, _) = result.unwrap();
        assert_eq!(checkpoint.turn_index, 0);
    }

    #[test]
    fn test_list_checkpoints_inner_multiple() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let cp1 = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp1).expect("insert cp1");

        let mut cp2 = test_checkpoint(ws.id);
        cp2.turn_index = 1;
        db.insert_checkpoint(&cp2).expect("insert cp2");

        let result = list_checkpoints_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_list_checkpoints_no_db() {
        use tauri::Manager;
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("Failed to build mock app");
        let state = crate::state::AppState::new();
        app.manage(state);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_checkpoints(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
