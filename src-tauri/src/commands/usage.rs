use crate::error::AppError;
use crate::models::chat::UsageDataPoint;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_usage_data(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
    since: Option<String>,
) -> Result<Vec<UsageDataPoint>, AppError> {
    let ws_id = workspace_id
        .map(|id| {
            id.parse::<Uuid>()
                .map_err(|_| AppError::DbError("Invalid workspace ID".into()))
        })
        .transpose()?;

    let data = {
        let db_lock = state
            .db
            .lock()
            .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;

        db.get_usage_data(ws_id.as_ref(), since.as_deref())?
    };

    tokio::task::spawn_blocking(move || Ok(data))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}
