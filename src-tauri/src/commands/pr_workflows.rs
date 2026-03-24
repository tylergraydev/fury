use crate::commands::pr::{get_ado_pat, parse_ado_url, parse_ws_id, ws_context};
use crate::error::AppError;
use crate::models::pr::{RunLogsResult, WorkflowJob, WorkflowRun};
use crate::models::repository::GitProvider;
use crate::services::ado as ado_svc;
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_workflow_runs(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkflowRun>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_workflow_runs(&ctx.worktree_path, &ctx.branch)
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::get_pipeline_runs(&pat, &org, &project, &ctx.branch).await
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn get_run_jobs(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
) -> Result<Vec<WorkflowJob>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_run_jobs(&ctx.worktree_path, run_id)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::get_build_timeline(&pat, &org, &project, run_id).await
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn get_run_logs(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_run_logs(&ctx.worktree_path, run_id, failed_only)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO log fetching not implemented in MVP
        _ => Ok(RunLogsResult {
            logs: String::new(),
            truncated: false,
        }),
    }
}

#[tauri::command]
pub async fn rerun_workflow(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
    failed_only: bool,
) -> Result<(), AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::rerun_workflow(&ctx.worktree_path, run_id, failed_only)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO rerun not implemented in MVP
        _ => Err(AppError::PrError(
            "Workflow rerun not available for this provider.".into(),
        )),
    }
}
