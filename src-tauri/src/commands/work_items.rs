use crate::commands::pr::{get_ado_pat, parse_ado_url, parse_ws_id, ws_context};
use crate::error::AppError;
use crate::models::repository::GitProvider;
use crate::models::work_item::{
    CreateWorkItemRequest, WorkItemDetail, WorkItemListItem, WorkItemQueryType,
};
use crate::services::ado as ado_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_work_items(
    state: State<'_, AppState>,
    workspace_id: String,
    query_type: WorkItemQueryType,
) -> Result<Vec<WorkItemListItem>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let pr_id = if matches!(query_type, WorkItemQueryType::LinkedToPr) {
                let pr_info = ado_svc::get_pr_by_branch(
                    &pat,
                    &org,
                    &project,
                    &repo_name,
                    &ctx.branch,
                    ws_id,
                )
                .await?;
                pr_info.and_then(|pr| pr.pr_number)
            } else {
                None
            };

            ado_svc::list_work_items(&pat, &org, &project, &repo_name, pr_id, query_type).await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn get_work_item_detail(
    state: State<'_, AppState>,
    workspace_id: String,
    work_item_id: u32,
) -> Result<WorkItemDetail, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::get_work_item_detail(&pat, &org, &project, work_item_id).await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn create_work_item(
    state: State<'_, AppState>,
    request: CreateWorkItemRequest,
) -> Result<WorkItemListItem, AppError> {
    let ws_id = parse_ws_id(&request.workspace_id.to_string())?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::create_work_item(
                &pat,
                &org,
                &project,
                &request.work_item_type,
                &request.title,
                request.description.as_deref(),
                request.assigned_to.as_deref(),
                request.area_path.as_deref(),
                request.iteration_path.as_deref(),
                request.parent_id,
                request.tags,
            )
            .await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn update_work_item_state(
    state: State<'_, AppState>,
    workspace_id: String,
    work_item_id: u32,
    new_state: String,
) -> Result<WorkItemListItem, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::update_work_item_state(&pat, &org, &project, work_item_id, &new_state).await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}

#[tauri::command]
pub async fn link_work_item_to_pr(
    state: State<'_, AppState>,
    workspace_id: String,
    work_item_id: u32,
    pr_id: u32,
) -> Result<(), AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            ado_svc::link_work_item_to_pr(
                &pat,
                &org,
                &project,
                &repo_name,
                work_item_id,
                pr_id as u64,
            )
            .await
        }
        _ => Err(AppError::AzureDevOpsError(
            "Work items are only available for Azure DevOps repositories.".into(),
        )),
    }
}
