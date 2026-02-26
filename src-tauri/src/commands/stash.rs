use crate::commands::merge::resolve_workspace;
use crate::error::AppError;
use crate::models::stash::{StashDetail, StashEntry};
use crate::services::stash as stash_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_stashes(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<StashEntry>, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    stash_svc::list_stashes(&worktree_path)
}

#[tauri::command]
pub fn create_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<StashEntry, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    stash_svc::create_stash(
        &worktree_path,
        message.as_deref(),
        include_untracked.unwrap_or(false),
    )
}

#[tauri::command]
pub fn apply_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    stash_svc::apply_stash(&worktree_path, index)
}

#[tauri::command]
pub fn pop_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    stash_svc::pop_stash(&worktree_path, index)
}

#[tauri::command]
pub fn drop_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    stash_svc::drop_stash(&worktree_path, index)
}

#[tauri::command]
pub fn show_stash(
    state: State<'_, AppState>,
    workspace_id: String,
    index: u32,
) -> Result<StashDetail, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    stash_svc::show_stash(&worktree_path, index)
}
