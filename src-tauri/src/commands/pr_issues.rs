use crate::commands::pr::{get_ado_pat, parse_ado_url, parse_pr_repo_id, repo_context};
use crate::error::AppError;
use crate::models::pr::{IssueDetail, IssueListItem, PrDetail, PrListItem};
use crate::models::repository::GitProvider;
use crate::services::ado as ado_svc;
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn list_repo_prs(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<PrListItem>, AppError> {
    let id = parse_pr_repo_id(&repo_id)?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::list_repo_prs(&ctx.path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::list_prs(&pat, &org, &project, &repo_name).await
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn list_repo_issues(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<IssueListItem>, AppError> {
    let id = parse_pr_repo_id(&repo_id)?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::list_repo_issues(&ctx.path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO uses work items, not issues — not supported in MVP
        _ => Ok(Vec::new()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_pr_details(
    state: State<'_, AppState>,
    repo_id: String,
    pr_number: u32,
) -> Result<PrDetail, AppError> {
    let id = parse_pr_repo_id(&repo_id)?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::get_pr_detail(&ctx.path, pr_number))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO PR details not implemented yet — would need a dedicated ADO function
        _ => Err(AppError::PrError(
            "PR details not available for this provider.".into(),
        )),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_issue_details(
    state: State<'_, AppState>,
    repo_id: String,
    issue_number: u32,
) -> Result<IssueDetail, AppError> {
    let id = parse_pr_repo_id(&repo_id)?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::get_issue_detail(&ctx.path, issue_number))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO uses work items, not issues
        _ => Err(AppError::PrError(
            "Issue details not available for this provider.".into(),
        )),
    }
}
