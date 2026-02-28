use crate::error::AppError;
use crate::models::chat::{ChatMessage, ChatMessageSearchResult};
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn save_chat_message(state: State<'_, AppState>, message: ChatMessage) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.insert_chat_message(&message)?;
    Ok(())
}

#[tauri::command]
pub async fn list_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid workspace ID".into()))?;
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.list_chat_messages(&ws_id)
}

#[tauri::command]
pub async fn clear_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid workspace ID".into()))?;
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.clear_chat_messages(&ws_id)?;
    Ok(())
}

#[tauri::command]
pub async fn search_chat_messages(
    state: State<'_, AppState>,
    query: String,
    workspace_id: Option<String>,
) -> Result<Vec<ChatMessageSearchResult>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let ws_id = workspace_id
        .map(|id| {
            id.parse::<Uuid>()
                .map_err(|_| AppError::DbError("Invalid workspace ID".into()))
        })
        .transpose()?;
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.search_chat_messages(&query, ws_id.as_ref())
}
