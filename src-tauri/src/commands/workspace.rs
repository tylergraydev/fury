use crate::error::AppError;
use crate::models::workspace::{CreateWorkspaceRequest, Workspace, WorkspaceInfo, WorkspaceStatus};
use crate::platform;
use crate::services::worktree;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

#[tauri::command]
pub fn create_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreateWorkspaceRequest,
) -> Result<WorkspaceInfo, AppError> {
    // Validate repository exists
    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&request.repo_id)
        .ok_or(AppError::RepoNotFound(request.repo_id))?
        .clone();
    drop(repos);

    // Allocate ports
    let port_base = state.port_allocator.lock().unwrap().allocate()?;

    // Create git worktree
    let app_data_dir = platform::app_data_dir();
    let worktree_path = worktree::create_worktree(
        &repo.path,
        &request.branch_name,
        &request.workspace_name,
        &app_data_dir,
        &repo.name,
    )?;

    // Apply sparse checkout if needed
    if let Some(ref dirs) = request.sparse_dirs {
        if !dirs.is_empty() {
            worktree::apply_sparse_checkout(&worktree_path, dirs)?;
        }
    }

    let workspace = Workspace {
        id: Uuid::new_v4(),
        repo_id: request.repo_id,
        name: request.workspace_name,
        branch: request.branch_name,
        worktree_path,
        status: WorkspaceStatus::Active,
        port_base,
        sparse_dirs: request.sparse_dirs,
        notes: String::new(),
        created_at: chrono::Utc::now(),
        archived_at: None,
    };

    let info = WorkspaceInfo::from(&workspace);

    // Persist to database
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.insert_workspace(&workspace)?;
        }
    }

    // Add to in-memory state
    state
        .workspaces
        .lock()
        .unwrap()
        .insert(workspace.id, workspace);

    // Notify frontend
    let _ = app.emit("workspace-created", &info);

    Ok(info)
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>, AppError> {
    let workspaces = state.workspaces.lock().unwrap();
    Ok(workspaces.values().map(WorkspaceInfo::from).collect())
}

#[tauri::command]
pub fn archive_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Update status
    {
        let mut workspaces = state.workspaces.lock().unwrap();
        if let Some(ws) = workspaces.get_mut(&id) {
            ws.status = WorkspaceStatus::Archived;
            ws.archived_at = Some(chrono::Utc::now());
        } else {
            return Err(AppError::WorkspaceNotFound(id));
        }
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_status(&id, &WorkspaceStatus::Archived)?;
        }
    }

    let _ = app.emit("workspace-archived", &id);

    Ok(())
}

#[tauri::command]
pub fn delete_workspace(state: State<'_, AppState>, workspace_id: String) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Get workspace info for cleanup
    let ws = {
        let workspaces = state.workspaces.lock().unwrap();
        workspaces.get(&id).cloned()
    };

    if let Some(ws) = ws {
        // Get repo path
        let repos = state.repositories.lock().unwrap();
        if let Some(repo) = repos.get(&ws.repo_id) {
            let _ = worktree::remove_worktree(&repo.path, &ws.worktree_path);
        }

        // Release ports
        state.port_allocator.lock().unwrap().release(ws.port_base);
    }

    // Remove from DB and state
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.delete_workspace(&id)?;
        }
    }
    state.workspaces.lock().unwrap().remove(&id);

    Ok(())
}
