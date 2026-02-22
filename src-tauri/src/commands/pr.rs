use crate::error::AppError;
use crate::models::pr::{CreatePrRequest, MergeResult, PrCheck, PrDescription, PrInfo};
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

#[tauri::command]
pub fn create_pr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreatePrRequest,
) -> Result<PrInfo, AppError> {
    let ws_id = request.workspace_id;

    let (worktree_path, branch, default_branch) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (
            ws.worktree_path.clone(),
            ws.branch.clone(),
            repo.default_branch.clone(),
        )
    };

    gh_svc::check_gh_auth()?;
    gh_svc::push_branch(&worktree_path, &branch)?;

    let mut pr_info = gh_svc::create_pr(
        &worktree_path,
        &request.title,
        &request.body,
        &default_branch,
        request.draft.unwrap_or(false),
    )?;
    pr_info.workspace_id = ws_id;

    let _ = app.emit(&format!("pr-updated:{}", ws_id), &pr_info);

    Ok(pr_info)
}

#[tauri::command]
pub fn get_pr_info(state: State<'_, AppState>, workspace_id: String) -> Result<PrInfo, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    match gh_svc::get_pr_info(&worktree_path)? {
        Some(mut info) => {
            info.workspace_id = ws_id;
            info.checks = gh_svc::get_pr_checks(&worktree_path).unwrap_or_default();
            Ok(info)
        }
        None => Ok(PrInfo::empty(ws_id)),
    }
}

#[tauri::command]
pub fn get_pr_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrCheck>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    gh_svc::get_pr_checks(&worktree_path)
}

#[tauri::command]
pub fn push_changes(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, branch) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        (ws.worktree_path.clone(), ws.branch.clone())
    };

    gh_svc::push_branch(&worktree_path, &branch)?;

    if let Ok(Some(mut info)) = gh_svc::get_pr_info(&worktree_path) {
        info.workspace_id = ws_id;
        info.checks = gh_svc::get_pr_checks(&worktree_path).unwrap_or_default();
        let _ = app.emit(&format!("pr-updated:{}", ws_id), &info);
    }

    Ok(())
}

#[tauri::command]
pub fn fix_failing_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let checks = gh_svc::get_pr_checks(&worktree_path)?;

    let failing: Vec<_> = checks
        .iter()
        .filter(|c| {
            c.conclusion.as_deref() == Some("FAILURE") || c.conclusion.as_deref() == Some("failure")
        })
        .collect();

    if failing.is_empty() {
        return Ok("No failing checks found.".to_string());
    }

    let mut message = String::from(
        "The following CI checks are failing on the current PR. Please analyze and fix these issues:\n\n",
    );
    for check in &failing {
        message.push_str(&format!(
            "- **{}**: {}\n  URL: {}\n\n",
            check.name,
            check.description.as_deref().unwrap_or("No description"),
            check.details_url.as_deref().unwrap_or("N/A"),
        ));
    }
    message.push_str("Please investigate the failures, fix the code, and ensure the tests pass.");

    Ok(message)
}

#[tauri::command]
pub fn generate_pr_description(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PrDescription, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, branch, default_branch) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (
            ws.worktree_path.clone(),
            ws.branch.clone(),
            repo.default_branch.clone(),
        )
    };

    gh_svc::generate_pr_description(&worktree_path, &branch, &default_branch)
}

#[tauri::command]
pub fn merge_pr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    merge_method: Option<String>,
) -> Result<MergeResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let method = merge_method.as_deref().unwrap_or("squash");
    let result = gh_svc::merge_pr(&worktree_path, method)?;

    let _ = app.emit(&format!("pr-merged:{}", ws_id), &result);

    Ok(result)
}
