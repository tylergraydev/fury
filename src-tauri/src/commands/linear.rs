use crate::error::AppError;
use crate::models::linear::{LinearIssue, LinkIssueRequest, UnlinkIssueRequest, WorkspaceIssue};
use crate::services::linear as linear_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn search_linear_issues(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<LinearIssue>, AppError> {
    let api_key = {
        let settings = state.settings.read().unwrap();
        settings.linear.api_key.clone().ok_or_else(|| {
            AppError::LinearError(
                "Linear API key not configured. Set it in Settings > Linear.".to_string(),
            )
        })?
    };

    tokio::task::spawn_blocking(move || linear_svc::search_issues(&api_key, &query))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn link_issue_to_workspace(
    state: State<'_, AppState>,
    request: LinkIssueRequest,
) -> Result<(), AppError> {
    let ws_id: Uuid = request
        .workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    {
        let workspaces = state.workspaces.read().unwrap();
        workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    }

    let db_guard = state.db.lock().unwrap();
    let db = db_guard
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    db.link_workspace_issue(
        &ws_id,
        &request.issue_id,
        &request.identifier,
        &request.title,
        &request.url,
    )
}

#[tauri::command]
pub async fn unlink_issue_from_workspace(
    state: State<'_, AppState>,
    request: UnlinkIssueRequest,
) -> Result<(), AppError> {
    let ws_id: Uuid = request
        .workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let db_guard = state.db.lock().unwrap();
    let db = db_guard
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    db.unlink_workspace_issue(&ws_id, &request.issue_id)
}

#[tauri::command]
pub async fn get_workspace_issues(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceIssue>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let db_guard = state.db.lock().unwrap();
    let db = db_guard
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    db.get_workspace_issues(&ws_id)
}
