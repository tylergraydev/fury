use crate::error::AppError;
use crate::models::pr::{
    CreatePrRequest, IssueDetail, IssueListItem, MergeResult, PrCheck, PrComment, PrDetail, PrInfo,
    PrListItem, PrReview, RunLogsResult, WorkflowJob, WorkflowRun,
};
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
pub async fn get_pr_info(state: State<'_, AppState>, workspace_id: String) -> Result<PrInfo, AppError> {
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

    tokio::task::spawn_blocking(move || {
        // Run gh pr view and gh pr checks in parallel
        let (pr_result, checks_result) = std::thread::scope(|s| {
            let h1 = s.spawn(|| gh_svc::get_pr_info(&worktree_path));
            let h2 = s.spawn(|| gh_svc::get_pr_checks(&worktree_path));
            (h1.join().unwrap(), h2.join().unwrap())
        });

        match pr_result? {
            Some(mut info) => {
                info.workspace_id = ws_id;
                info.checks = checks_result.unwrap_or_default();
                Ok(info)
            }
            None => Ok(PrInfo::empty(ws_id)),
        }
    })
    .await
    .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
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

#[tauri::command]
pub fn get_pr_reviews(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrReview>, AppError> {
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

    gh_svc::get_pr_reviews(&worktree_path)
}

#[tauri::command]
pub fn get_pr_review_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrComment>, AppError> {
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

    gh_svc::get_pr_review_comments(&worktree_path)
}

#[tauri::command]
pub fn list_repo_prs(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<PrListItem>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    gh_svc::list_repo_prs(&repo_path)
}

#[tauri::command]
pub fn list_repo_issues(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<IssueListItem>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    gh_svc::list_repo_issues(&repo_path)
}

#[tauri::command]
pub fn get_pr_details(
    state: State<'_, AppState>,
    repo_id: String,
    pr_number: u32,
) -> Result<PrDetail, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    gh_svc::get_pr_detail(&repo_path, pr_number)
}

#[tauri::command]
pub fn get_issue_details(
    state: State<'_, AppState>,
    repo_id: String,
    issue_number: u32,
) -> Result<IssueDetail, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    gh_svc::get_issue_detail(&repo_path, issue_number)
}

#[tauri::command]
pub async fn get_workflow_runs(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkflowRun>, AppError> {
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

    tokio::task::spawn_blocking(move || gh_svc::get_workflow_runs(&worktree_path, &branch))
        .await
        .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub fn get_run_jobs(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
) -> Result<Vec<WorkflowJob>, AppError> {
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

    gh_svc::get_run_jobs(&worktree_path, run_id)
}

#[tauri::command]
pub fn get_run_logs(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
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

    gh_svc::get_run_logs(&worktree_path, run_id, failed_only)
}

#[tauri::command]
pub fn rerun_workflow(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
    failed_only: bool,
) -> Result<(), AppError> {
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

    gh_svc::rerun_workflow(&worktree_path, run_id, failed_only)
}
