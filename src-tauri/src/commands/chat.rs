use crate::db::Database;
use crate::error::AppError;
use crate::models::chat::{ChatMessage, ChatMessageSearchResult};
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

pub(crate) fn save_chat_message_inner(
    db: &Database,
    message: &ChatMessage,
) -> Result<(), AppError> {
    db.insert_chat_message(message)?;
    Ok(())
}

pub(crate) fn list_chat_messages_inner(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<ChatMessage>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid workspace ID".into()))?;
    db.list_chat_messages(&ws_id)
}

pub(crate) fn clear_chat_messages_inner(
    db: &Database,
    workspace_id: &str,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid workspace ID".into()))?;
    db.clear_chat_messages(&ws_id)?;
    Ok(())
}

pub(crate) fn search_chat_messages_inner(
    db: &Database,
    query: &str,
    workspace_id: Option<&str>,
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
    db.search_chat_messages(query, ws_id.as_ref())
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn save_chat_message(
    state: State<'_, AppState>,
    message: ChatMessage,
) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    save_chat_message_inner(db, &message)
}

#[tauri::command]
pub async fn list_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    list_chat_messages_inner(db, &workspace_id)
}

#[tauri::command]
pub async fn clear_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    clear_chat_messages_inner(db, &workspace_id)
}

#[tauri::command]
pub async fn search_chat_messages(
    state: State<'_, AppState>,
    query: String,
    workspace_id: Option<String>,
) -> Result<Vec<ChatMessageSearchResult>, AppError> {
    let db_lock = state
        .db
        .lock()
        .map_err(|_| AppError::DbError("Failed to acquire database lock".into()))?;
    let db = db_lock
        .as_ref()
        .ok_or(AppError::DbError("DB not initialized".into()))?;
    search_chat_messages_inner(db, &query, workspace_id.as_deref())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::chat::{ContentBlock, MessageRole};
    use crate::test_helpers::*;

    #[test]
    fn test_save_and_list_chat_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let msg = test_chat_message(ws.id);
        save_chat_message_inner(&db, &msg).unwrap();

        let messages = list_chat_messages_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, msg.id);
    }

    #[test]
    fn test_list_chat_messages_empty() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let messages = list_chat_messages_inner(&db, &ws.id.to_string()).unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_list_chat_messages_invalid_uuid() {
        let db = test_db();
        let result = list_chat_messages_inner(&db, "not-valid");
        assert!(result.is_err());
    }

    #[test]
    fn test_clear_chat_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let msg1 = test_chat_message(ws.id);
        let msg2 = test_chat_message(ws.id);
        save_chat_message_inner(&db, &msg1).unwrap();
        save_chat_message_inner(&db, &msg2).unwrap();

        let before = list_chat_messages_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(before.len(), 2);

        clear_chat_messages_inner(&db, &ws.id.to_string()).unwrap();

        let after = list_chat_messages_inner(&db, &ws.id.to_string()).unwrap();
        assert!(after.is_empty());
    }

    #[test]
    fn test_clear_chat_messages_invalid_uuid() {
        let db = test_db();
        let result = clear_chat_messages_inner(&db, "bad");
        assert!(result.is_err());
    }

    #[test]
    fn test_search_chat_messages_empty_query() {
        let db = test_db();
        let results = search_chat_messages_inner(&db, "", None).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_chat_messages_whitespace_query() {
        let db = test_db();
        let results = search_chat_messages_inner(&db, "   ", None).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_chat_messages_with_results() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let mut msg = test_chat_message(ws.id);
        msg.content = vec![ContentBlock::Text {
            text: "Rust is great for systems programming".to_string(),
        }];
        msg.display_text = Some("Rust is great for systems programming".to_string());
        save_chat_message_inner(&db, &msg).unwrap();

        let results =
            search_chat_messages_inner(&db, "Rust", Some(&ws.id.to_string())).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_search_chat_messages_no_match() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let msg = test_chat_message(ws.id);
        save_chat_message_inner(&db, &msg).unwrap();

        let results = search_chat_messages_inner(
            &db,
            "xyznonexistent",
            Some(&ws.id.to_string()),
        )
        .unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_chat_messages_invalid_workspace_id() {
        let db = test_db();
        let result = search_chat_messages_inner(&db, "hello", Some("bad-uuid"));
        assert!(result.is_err());
    }

    #[test]
    fn test_save_multiple_roles() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let mut user_msg = test_chat_message(ws.id);
        user_msg.role = MessageRole::User;

        let mut asst_msg = test_chat_message(ws.id);
        asst_msg.role = MessageRole::Assistant;
        asst_msg.id = Uuid::new_v4();

        save_chat_message_inner(&db, &user_msg).unwrap();
        save_chat_message_inner(&db, &asst_msg).unwrap();

        let messages = list_chat_messages_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(messages.len(), 2);
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    fn setup_app_with_workspace() -> (tauri::App<tauri::test::MockRuntime>, Uuid) {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            ws.id
        };
        (app, ws_id)
    }

    #[tokio::test]
    async fn test_save_chat_message_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();
        let msg = test_chat_message(ws_id);
        let result = save_chat_message(state, msg).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_list_chat_messages_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();

        let list = list_chat_messages(state.clone(), ws_id.to_string()).await.unwrap();
        assert!(list.is_empty());

        let msg = test_chat_message(ws_id);
        save_chat_message(state.clone(), msg).await.unwrap();

        let list = list_chat_messages(state, ws_id.to_string()).await.unwrap();
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_clear_chat_messages_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();

        let msg = test_chat_message(ws_id);
        save_chat_message(state.clone(), msg).await.unwrap();

        let result = clear_chat_messages(state.clone(), ws_id.to_string()).await;
        assert!(result.is_ok());

        let list = list_chat_messages(state, ws_id.to_string()).await.unwrap();
        assert!(list.is_empty());
    }

    #[tokio::test]
    async fn test_search_chat_messages_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();

        // Empty query returns empty
        let results = search_chat_messages(state.clone(), "".into(), None).await.unwrap();
        assert!(results.is_empty());

        // Insert a message and search
        let mut msg = test_chat_message(ws_id);
        msg.content = vec![ContentBlock::Text {
            text: "Rust is great".into(),
        }];
        msg.display_text = Some("Rust is great".into());
        save_chat_message(state.clone(), msg).await.unwrap();

        let results = search_chat_messages(
            state,
            "Rust".into(),
            Some(ws_id.to_string()),
        )
        .await
        .unwrap();
        assert!(!results.is_empty());
    }
}
