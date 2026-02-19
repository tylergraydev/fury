use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent};
use crate::services::diff as diff_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_diff(state: State<'_, AppState>, workspace_id: String) -> Result<DiffResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, default_branch) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    diff_svc::get_workspace_diff(&worktree_path, &default_branch)
}

#[tauri::command]
pub fn get_file_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
) -> Result<FileDiffContent, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, default_branch) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    diff_svc::get_file_diff_content(&worktree_path, &default_branch, &file_path)
}
