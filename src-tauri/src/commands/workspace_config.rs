use tauri::State;

use crate::error::AppError;
use crate::services::worktree;
use crate::state::AppState;

use super::workspace::{
    parse_workspace_id, rename_workspace_inner, set_pinned_inner, update_notes_inner,
    update_sparse_dirs_inner,
};

#[tauri::command]
pub async fn update_sparse_dirs(
    state: State<'_, AppState>,
    workspace_id: String,
    dirs: Vec<String>,
) -> Result<(), AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        ws.worktree_path.clone()
    };

    // Apply or disable sparse checkout (blocking git operations)
    let dirs_clone = dirs.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        if dirs_clone.is_empty() {
            let _ = crate::platform::command("git")
                .args(["sparse-checkout", "disable"])
                .current_dir(&worktree_path)
                .output();
        } else {
            worktree::apply_sparse_checkout(&worktree_path, &dirs_clone)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    // Update in-memory state
    let sparse_dirs = {
        let mut workspaces = state.workspaces.write().unwrap();
        update_sparse_dirs_inner(&mut workspaces, id, dirs)
    };

    // Persist to database
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_sparse_dirs(&id, &sparse_dirs)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn update_workspace_notes(
    state: State<'_, AppState>,
    workspace_id: String,
    notes: String,
) -> Result<(), AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    // Update in-memory
    {
        let mut workspaces = state.workspaces.write().unwrap();
        update_notes_inner(&mut workspaces, id, notes.clone());
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_notes(&id, &notes)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn rename_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    name: String,
) -> Result<(), AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    // Update in-memory
    {
        let mut workspaces = state.workspaces.write().unwrap();
        rename_workspace_inner(&mut workspaces, id, name.clone());
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_name(&id, &name)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_workspace_pinned(
    state: State<'_, AppState>,
    workspace_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    // Update in-memory
    {
        let mut workspaces = state.workspaces.write().unwrap();
        set_pinned_inner(&mut workspaces, id, pinned);
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_pinned(&id, pinned)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::workspace::{
        persist_notes, persist_pinned, persist_rename, persist_sparse_dirs,
    };
    use crate::test_helpers::*;
    use std::collections::HashMap;
    use tauri::Manager;
    use uuid::Uuid;

    use crate::commands::workspace::{
        rename_workspace_inner, set_pinned_inner, update_notes_inner, update_sparse_dirs_inner,
    };

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
    // update_notes_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_notes_inner() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        let found = update_notes_inner(&mut map, ws_id, "hello notes".to_string());
        assert!(found);
        assert_eq!(map.get(&ws_id).unwrap().notes, "hello notes");
    }

    #[test]
    fn test_update_notes_inner_missing_workspace_noop() {
        let mut map = HashMap::new();
        let found = update_notes_inner(&mut map, Uuid::new_v4(), "notes".to_string());
        assert!(!found);
    }

    #[test]
    fn test_update_notes_inner_empty_string() {
        let mut map = HashMap::new();
        let mut ws = test_workspace(Uuid::new_v4());
        ws.notes = "existing notes".to_string();
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        update_notes_inner(&mut map, ws_id, String::new());
        assert_eq!(map.get(&ws_id).unwrap().notes, "");
    }

    #[test]
    fn test_update_notes_inner_overwrite() {
        let mut map = HashMap::new();
        let mut ws = test_workspace(Uuid::new_v4());
        ws.notes = "first".to_string();
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        update_notes_inner(&mut map, ws_id, "second".to_string());
        assert_eq!(map.get(&ws_id).unwrap().notes, "second");
    }

    // -----------------------------------------------------------------------
    // rename_workspace_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_rename_workspace_inner() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        let found = rename_workspace_inner(&mut map, ws_id, "new-name".to_string());
        assert!(found);
        assert_eq!(map.get(&ws_id).unwrap().name, "new-name");
    }

    #[test]
    fn test_rename_workspace_inner_missing() {
        let mut map = HashMap::new();
        let found = rename_workspace_inner(&mut map, Uuid::new_v4(), "name".to_string());
        assert!(!found);
    }

    // -----------------------------------------------------------------------
    // set_pinned_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_pinned_inner() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let ws_id = ws.id;
        assert!(!ws.pinned);
        map.insert(ws_id, ws);

        let found = set_pinned_inner(&mut map, ws_id, true);
        assert!(found);
        assert!(map.get(&ws_id).unwrap().pinned);

        set_pinned_inner(&mut map, ws_id, false);
        assert!(!map.get(&ws_id).unwrap().pinned);
    }

    #[test]
    fn test_set_pinned_inner_missing() {
        let mut map = HashMap::new();
        let found = set_pinned_inner(&mut map, Uuid::new_v4(), true);
        assert!(!found);
    }

    // -----------------------------------------------------------------------
    // update_sparse_dirs_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_sparse_dirs_inner_with_dirs() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        let result = update_sparse_dirs_inner(
            &mut map,
            ws_id,
            vec!["src".to_string(), "lib".to_string()],
        );
        assert_eq!(result, Some(vec!["src".to_string(), "lib".to_string()]));
        assert_eq!(
            map.get(&ws_id).unwrap().sparse_dirs,
            Some(vec!["src".to_string(), "lib".to_string()])
        );
    }

    #[test]
    fn test_update_sparse_dirs_inner_empty_clears() {
        let mut map = HashMap::new();
        let mut ws = test_workspace(Uuid::new_v4());
        ws.sparse_dirs = Some(vec!["src".to_string()]);
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        let result = update_sparse_dirs_inner(&mut map, ws_id, vec![]);
        assert!(result.is_none());
        assert!(map.get(&ws_id).unwrap().sparse_dirs.is_none());
    }

    #[test]
    fn test_update_sparse_dirs_inner_single_dir() {
        let mut map = HashMap::new();
        let ws = test_workspace(Uuid::new_v4());
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        let result = update_sparse_dirs_inner(&mut map, ws_id, vec!["docs".to_string()]);
        assert_eq!(result, Some(vec!["docs".to_string()]));
    }

    // -----------------------------------------------------------------------
    // DB roundtrip: persist_notes
    // -----------------------------------------------------------------------

    #[test]
    fn test_persist_notes_db_roundtrip() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        persist_notes(&db, &ws.id, "some notes").unwrap();

        assert!(persist_notes(&db, &ws.id, "updated notes").is_ok());
    }

    // -----------------------------------------------------------------------
    // DB roundtrip: persist_rename
    // -----------------------------------------------------------------------

    #[test]
    fn test_persist_rename_db_roundtrip() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        persist_rename(&db, &ws.id, "renamed-workspace").unwrap();
    }

    // -----------------------------------------------------------------------
    // DB roundtrip: persist_pinned
    // -----------------------------------------------------------------------

    #[test]
    fn test_persist_pinned_db_roundtrip() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        persist_pinned(&db, &ws.id, true).unwrap();
        persist_pinned(&db, &ws.id, false).unwrap();
    }

    // -----------------------------------------------------------------------
    // DB roundtrip: persist_sparse_dirs
    // -----------------------------------------------------------------------

    #[test]
    fn test_persist_sparse_dirs_db_roundtrip() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let dirs = Some(vec!["src".to_string(), "lib".to_string()]);
        persist_sparse_dirs(&db, &ws.id, &dirs).unwrap();

        // Clear
        persist_sparse_dirs(&db, &ws.id, &None).unwrap();
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_update_workspace_notes() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_workspace_notes(
            state,
            ws_id.to_string(),
            "test notes".to_string(),
        )
        .await;
        assert!(result.is_ok());

        // Verify in-memory update
        let app_state = app.state::<crate::state::AppState>();
        let workspaces = app_state.workspaces.read().unwrap();
        assert_eq!(workspaces.get(&ws_id).unwrap().notes, "test notes");
    }

    #[tokio::test]
    async fn test_cmd_rename_workspace() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = rename_workspace(state, ws_id.to_string(), "new-name".to_string()).await;
        assert!(result.is_ok());

        let app_state = app.state::<crate::state::AppState>();
        let workspaces = app_state.workspaces.read().unwrap();
        assert_eq!(workspaces.get(&ws_id).unwrap().name, "new-name");
    }

    #[tokio::test]
    async fn test_cmd_set_workspace_pinned() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = set_workspace_pinned(state, ws_id.to_string(), true).await;
        assert!(result.is_ok());

        let app_state = app.state::<crate::state::AppState>();
        let workspaces = app_state.workspaces.read().unwrap();
        assert!(workspaces.get(&ws_id).unwrap().pinned);
    }

    #[tokio::test]
    async fn test_cmd_update_workspace_notes_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result =
            update_workspace_notes(state, "bad".to_string(), "notes".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_rename_workspace_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = rename_workspace(state, "bad".to_string(), "name".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_set_workspace_pinned_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = set_workspace_pinned(state, "bad".to_string(), true).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_update_sparse_dirs_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_sparse_dirs(state, "bad".to_string(), vec!["src".to_string()]).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_update_sparse_dirs_ws_not_found() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_sparse_dirs(
            state,
            Uuid::new_v4().to_string(),
            vec!["src".to_string()],
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_update_sparse_dirs_with_workspace_in_state() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_sparse_dirs(state, ws_id.to_string(), vec![]).await;
        assert!(result.is_ok());

        let app_state = app.state::<crate::state::AppState>();
        let workspaces = app_state.workspaces.read().unwrap();
        assert!(workspaces.get(&ws_id).unwrap().sparse_dirs.is_none());
    }

    #[tokio::test]
    async fn test_cmd_update_workspace_notes_for_nonexistent_ws() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let ws_id = Uuid::new_v4();
        let result = update_workspace_notes(
            state,
            ws_id.to_string(),
            "notes for missing ws".to_string(),
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_rename_workspace_nonexistent_ws() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let ws_id = Uuid::new_v4();
        let result = rename_workspace(state, ws_id.to_string(), "new-name".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_set_workspace_pinned_nonexistent_ws() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let ws_id = Uuid::new_v4();
        let result = set_workspace_pinned(state, ws_id.to_string(), true).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_update_sparse_dirs_persists_to_db() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_sparse_dirs(state, ws_id.to_string(), vec![]).await;
        assert!(result.is_ok());

        let app_state = app.state::<crate::state::AppState>();
        let db_lock = app_state.db.lock().unwrap();
        let db = db_lock.as_ref().unwrap();
        let ws_from_db = db.list_archived_workspaces();
        assert!(ws_from_db.is_ok());
    }
}
