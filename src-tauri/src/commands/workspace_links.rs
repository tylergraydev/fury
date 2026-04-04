use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

use super::workspace::{parse_workspace_id, validate_link_workspaces};

#[tauri::command]
#[specta::specta]
pub async fn link_workspaces(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
) -> Result<(), AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;
    let linked_id = parse_workspace_id(&linked_workspace_id)?;

    // Verify both workspaces exist
    {
        let workspaces = state.workspaces.read().unwrap();
        validate_link_workspaces(&workspaces, ws_id, linked_id)?;
    }

    state
        .with_db(move |db| {
            db.insert_workspace_link(&ws_id, &linked_id)?;
            Ok(())
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn unlink_workspaces(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
) -> Result<(), AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;
    let linked_id = parse_workspace_id(&linked_workspace_id)?;

    state
        .with_db(move |db| {
            db.delete_workspace_link(&ws_id, &linked_id)?;
            Ok(())
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_linked_workspaces(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<String>, AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    state
        .with_db(move |db| {
            let ids = db.get_workspace_links(&ws_id)?;
            Ok(ids.into_iter().map(|id| id.to_string()).collect())
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn start_spotlight(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    let (worktree_path, repo_path) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&ws_id).ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.path.clone())
    };

    let handle = tokio::task::spawn_blocking(move || {
        crate::services::spotlight::start_spotlight(worktree_path, repo_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    state
        .spotlight_watchers
        .lock()
        .unwrap()
        .insert(ws_id, handle);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_spotlight(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    let handle = state.spotlight_watchers.lock().unwrap().remove(&ws_id);

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
    use crate::commands::workspace::{
        get_linked_workspaces_inner, link_workspaces_inner, unlink_workspaces_inner,
        validate_link_workspaces,
    };
    use crate::models::workspace::Workspace;
    use crate::test_helpers::*;
    use std::collections::HashMap;
    use tauri::Manager;
    use uuid::Uuid;

    fn setup_ws_state() -> (tauri::App<tauri::test::MockRuntime>, Uuid, Uuid) {
        let app = mock_app_with_state();
        let state = app.state::<crate::state::AppState>();
        let repo_id = Uuid::new_v4();
        let ws_id = Uuid::new_v4();
        {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut repo = test_repo();
            repo.id = repo_id;
            db.insert_repository(&repo).unwrap();
            let mut ws = test_workspace(repo_id);
            ws.id = ws_id;
            db.insert_workspace(&ws).unwrap();
            state.repositories.write().unwrap().insert(repo_id, repo);
            state.workspaces.write().unwrap().insert(ws_id, ws);
        }
        (app, repo_id, ws_id)
    }

    // -----------------------------------------------------------------------
    // validate_link_workspaces (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_validate_link_workspaces_both_exist() {
        let mut map = HashMap::new();
        let repo_id = Uuid::new_v4();
        let ws1 = test_workspace(repo_id);
        let ws2 = test_workspace(repo_id);
        let id1 = ws1.id;
        let id2 = ws2.id;
        map.insert(id1, ws1);
        map.insert(id2, ws2);

        assert!(validate_link_workspaces(&map, id1, id2).is_ok());
    }

    #[test]
    fn test_validate_link_workspaces_first_missing() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let id = ws.id;
        map.insert(id, ws);

        let result = validate_link_workspaces(&map, Uuid::new_v4(), id);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_link_workspaces_second_missing() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let id = ws.id;
        map.insert(id, ws);

        let result = validate_link_workspaces(&map, id, Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_link_workspaces_both_missing() {
        let map: HashMap<Uuid, Workspace> = HashMap::new();
        let result = validate_link_workspaces(&map, Uuid::new_v4(), Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_link_workspaces_self_link() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let id = ws.id;
        map.insert(id, ws);

        // Self-link should be valid at the validation level
        assert!(validate_link_workspaces(&map, id, id).is_ok());
    }

    // -----------------------------------------------------------------------
    // DB roundtrip: link / unlink / get_linked
    // -----------------------------------------------------------------------

    #[test]
    fn test_link_unlink_workspaces_db_roundtrip() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();

        let ws1 = test_workspace(repo.id);
        let ws2 = test_workspace(repo.id);
        db.insert_workspace(&ws1).unwrap();
        db.insert_workspace(&ws2).unwrap();

        // Link
        link_workspaces_inner(&db, &ws1.id, &ws2.id).unwrap();

        // Get links
        let links = get_linked_workspaces_inner(&db, &ws1.id).unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0], ws2.id);

        // Reverse direction should be empty (links are directional)
        let reverse_links = get_linked_workspaces_inner(&db, &ws2.id).unwrap();
        assert!(reverse_links.is_empty());

        // Unlink
        unlink_workspaces_inner(&db, &ws1.id, &ws2.id).unwrap();
        let links_after = get_linked_workspaces_inner(&db, &ws1.id).unwrap();
        assert!(links_after.is_empty());
    }

    #[test]
    fn test_link_workspaces_idempotent() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();

        let ws1 = test_workspace(repo.id);
        let ws2 = test_workspace(repo.id);
        db.insert_workspace(&ws1).unwrap();
        db.insert_workspace(&ws2).unwrap();

        // Link twice should not error (INSERT OR IGNORE)
        link_workspaces_inner(&db, &ws1.id, &ws2.id).unwrap();
        link_workspaces_inner(&db, &ws1.id, &ws2.id).unwrap();

        let links = get_linked_workspaces_inner(&db, &ws1.id).unwrap();
        assert_eq!(links.len(), 1);
    }

    #[test]
    fn test_unlink_nonexistent_is_ok() {
        let db = test_db();
        let result = unlink_workspaces_inner(&db, &Uuid::new_v4(), &Uuid::new_v4());
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_linked_workspaces_empty() {
        let db = test_db();
        let links = get_linked_workspaces_inner(&db, &Uuid::new_v4()).unwrap();
        assert!(links.is_empty());
    }

    #[test]
    fn test_multiple_links() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();

        let ws1 = test_workspace(repo.id);
        let ws2 = test_workspace(repo.id);
        let ws3 = test_workspace(repo.id);
        db.insert_workspace(&ws1).unwrap();
        db.insert_workspace(&ws2).unwrap();
        db.insert_workspace(&ws3).unwrap();

        link_workspaces_inner(&db, &ws1.id, &ws2.id).unwrap();
        link_workspaces_inner(&db, &ws1.id, &ws3.id).unwrap();

        let links = get_linked_workspaces_inner(&db, &ws1.id).unwrap();
        assert_eq!(links.len(), 2);
        assert!(links.contains(&ws2.id));
        assert!(links.contains(&ws3.id));
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_link_workspaces() {
        let (app, repo_id, ws_id) = setup_ws_state();
        // Create a second workspace
        let ws2_id = Uuid::new_v4();
        {
            let state = app.state::<crate::state::AppState>();
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut ws2 = test_workspace(repo_id);
            ws2.id = ws2_id;
            db.insert_workspace(&ws2).unwrap();
            state.workspaces.write().unwrap().insert(ws2_id, ws2);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = link_workspaces(state, ws_id.to_string(), ws2_id.to_string()).await;
        assert!(result.is_ok());

        // Verify link exists
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let linked = get_linked_workspaces(state2, ws_id.to_string()).await.unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0], ws2_id.to_string());
    }

    #[tokio::test]
    async fn test_cmd_unlink_workspaces() {
        let (app, repo_id, ws_id) = setup_ws_state();
        let ws2_id = Uuid::new_v4();
        {
            let state = app.state::<crate::state::AppState>();
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut ws2 = test_workspace(repo_id);
            ws2.id = ws2_id;
            db.insert_workspace(&ws2).unwrap();
            state.workspaces.write().unwrap().insert(ws2_id, ws2);
        }

        // Link then unlink
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        link_workspaces(state, ws_id.to_string(), ws2_id.to_string()).await.unwrap();
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let result = unlink_workspaces(state2, ws_id.to_string(), ws2_id.to_string()).await;
        assert!(result.is_ok());

        let state3: tauri::State<'_, crate::state::AppState> = app.state();
        let linked = get_linked_workspaces(state3, ws_id.to_string()).await.unwrap();
        assert!(linked.is_empty());
    }

    #[tokio::test]
    async fn test_cmd_get_linked_workspaces_empty() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_linked_workspaces(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_cmd_link_workspaces_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = link_workspaces(state, "bad".to_string(), Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_link_workspaces_ws_not_found() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = link_workspaces(
            state,
            Uuid::new_v4().to_string(),
            Uuid::new_v4().to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_linked_workspaces_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_linked_workspaces(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_unlink_workspaces_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = unlink_workspaces(
            state,
            "bad".to_string(),
            Uuid::new_v4().to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_unlink_workspaces_second_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = unlink_workspaces(
            state,
            Uuid::new_v4().to_string(),
            "bad".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_spotlight_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_spotlight(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_spotlight_no_watcher() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_spotlight(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }
}
