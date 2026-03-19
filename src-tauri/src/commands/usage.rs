use crate::error::AppError;
use crate::models::chat::UsageDataPoint;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

/// Inner function: parse inputs and query the database directly.
pub(crate) fn get_usage_data_inner(
    db: &crate::db::Database,
    workspace_id: Option<String>,
    since: Option<String>,
) -> Result<Vec<UsageDataPoint>, AppError> {
    let ws_id = workspace_id
        .map(|id| {
            id.parse::<Uuid>()
                .map_err(|_| AppError::DbError("Invalid workspace ID".into()))
        })
        .transpose()?;

    db.get_usage_data(ws_id.as_ref(), since.as_deref())
}

#[tauri::command]
pub async fn get_usage_data(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
    since: Option<String>,
) -> Result<Vec<UsageDataPoint>, AppError> {
    let data = {
        let db_lock = state
            .db
            .lock()
            .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        get_usage_data_inner(db, workspace_id, since)?
    };

    tokio::task::spawn_blocking(move || Ok(data))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_get_usage_data_inner_no_filters() {
        let db = test_db();
        let result = get_usage_data_inner(&db, None, None);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_get_usage_data_inner_with_valid_workspace_id() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let result = get_usage_data_inner(&db, Some(ws.id.to_string()), None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_usage_data_inner_with_invalid_workspace_id() {
        let db = test_db();
        let result = get_usage_data_inner(&db, Some("not-a-uuid".to_string()), None);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::DbError(_)));
    }

    #[test]
    fn test_get_usage_data_inner_with_since_filter() {
        let db = test_db();
        let result = get_usage_data_inner(&db, None, Some("2024-01-01".to_string()));
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_usage_data_inner_with_both_filters() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let result = get_usage_data_inner(
            &db,
            Some(ws.id.to_string()),
            Some("2024-01-01".to_string()),
        );
        assert!(result.is_ok());
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    #[tokio::test]
    async fn test_get_usage_data_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let result = get_usage_data(state, None, None).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_get_usage_data_command_with_workspace_filter() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            ws.id
        };
        let result = get_usage_data(state, Some(ws_id.to_string()), None).await;
        assert!(result.is_ok());
    }
}
