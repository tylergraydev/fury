use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent};
use crate::models::merge::{BranchStatus, ConflictContent, ConflictedFile, PullResult};
use crate::services::branch as branch_svc;
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

/// Helper to resolve a workspace or repo ID to (worktree_path, branch, default_branch, repo_path).
/// Checks workspaces first; falls back to repositories so callers work in both contexts.
pub(crate) fn resolve_workspace(
    state: &State<'_, AppState>,
    workspace_id: &str,
) -> Result<(std::path::PathBuf, String, String, std::path::PathBuf), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Try workspace first
    {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        if let Some(ws) = workspaces.get(&id) {
            let repos = state
                .repositories
                .read()
                .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
            let repo = repos
                .get(&ws.repo_id)
                .ok_or(AppError::RepoNotFound(ws.repo_id))?;
            return Ok((
                ws.worktree_path.clone(),
                ws.branch.clone(),
                repo.default_branch.clone(),
                repo.path.clone(),
            ));
        }
    }

    // Fall back to repo — the ID may be a repository, not a workspace.
    // Clone needed data and release the lock before running git commands.
    let (repo_path, default_branch) = {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        (repo.path.clone(), repo.default_branch.clone())
    };

    let branch = crate::platform::command("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&repo_path)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| default_branch.clone());

    Ok((repo_path.clone(), branch, default_branch, repo_path))
}

#[tauri::command]
pub fn get_branch_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<BranchStatus, AppError> {
    let (worktree_path, branch, default_branch, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::get_branch_status(&worktree_path, &branch, &default_branch)
}

#[tauri::command]
pub fn fetch_upstream(state: State<'_, AppState>, workspace_id: String) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::fetch_upstream(&worktree_path)
}

#[tauri::command]
pub fn pull_rebase(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PullResult, AppError> {
    let (worktree_path, _, default_branch, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::pull_rebase(&worktree_path, &default_branch)
}

#[tauri::command]
pub fn pull_merge(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PullResult, AppError> {
    let (worktree_path, _, default_branch, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::pull_merge(&worktree_path, &default_branch)
}

#[tauri::command]
pub fn get_conflicted_files(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<ConflictedFile>, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::get_conflicted_files(&worktree_path)
}

#[tauri::command]
pub fn get_conflict_content(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
) -> Result<ConflictContent, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::get_conflict_content(&worktree_path, &file_path)
}

#[tauri::command]
pub fn resolve_conflict(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
    strategy: String,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::resolve_conflict(&worktree_path, &file_path, &strategy)
}

#[tauri::command]
pub fn abort_merge_cmd(state: State<'_, AppState>, workspace_id: String) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::abort_merge(&worktree_path)
}

#[tauri::command]
pub fn continue_merge(state: State<'_, AppState>, workspace_id: String) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    branch_svc::continue_merge(&worktree_path)
}

#[tauri::command]
pub fn cross_worktree_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
) -> Result<DiffResult, AppError> {
    let (_, branch_a, _, repo_path) = resolve_workspace(&state, &workspace_id)?;

    let linked_id: Uuid = linked_workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let branch_b = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&linked_id)
            .ok_or(AppError::WorkspaceNotFound(linked_id))?;
        ws.branch.clone()
    };

    branch_svc::cross_worktree_diff(&repo_path, &branch_a, &branch_b)
}

#[tauri::command]
pub fn get_cross_worktree_file_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
    file_path: String,
) -> Result<FileDiffContent, AppError> {
    let (_, branch_a, _, repo_path) = resolve_workspace(&state, &workspace_id)?;

    let linked_id: Uuid = linked_workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let branch_b = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&linked_id)
            .ok_or(AppError::WorkspaceNotFound(linked_id))?;
        ws.branch.clone()
    };

    branch_svc::get_file_at_ref(&repo_path, &branch_a, &branch_b, &file_path)
}

#[tauri::command]
pub fn push_workspace(state: State<'_, AppState>, workspace_id: String) -> Result<(), AppError> {
    let (worktree_path, branch, _, _) = resolve_workspace(&state, &workspace_id)?;
    gh_svc::push_branch(&worktree_path, &branch)
}
