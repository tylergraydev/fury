use crate::error::AppError;
use crate::models::chat::ChatMessage;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn save_chat_message(state: State<'_, AppState>, message: ChatMessage) -> Result<(), AppError> {
    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.insert_chat_message(&message)?;
    Ok(())
}

#[tauri::command]
pub fn list_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid workspace ID".into()))?;
    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.list_chat_messages(&ws_id)
}

#[tauri::command]
pub fn clear_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid workspace ID".into()))?;
    let db_lock = state.db.lock().unwrap();
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    db.clear_chat_messages(&ws_id)?;
    Ok(())
}
