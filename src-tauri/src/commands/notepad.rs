use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::notepad::{CreateNotepadRequest, Notepad, UpdateNotepadRequest};
use crate::state::AppState;

pub(crate) fn create_notepad_inner(
    db: &crate::db::Database,
    request: CreateNotepadRequest,
) -> Result<Notepad, AppError> {
    let now = Utc::now();
    let notepad = Notepad {
        id: Uuid::new_v4(),
        title: request.title,
        content: request.content,
        description: request.description,
        tags: request.tags.unwrap_or_default(),
        pinned: false,
        created_at: now,
        updated_at: now,
    };
    db.insert_notepad(&notepad)?;
    Ok(notepad)
}

pub(crate) fn list_notepads_inner(
    db: &crate::db::Database,
) -> Result<Vec<Notepad>, AppError> {
    db.list_notepads()
}

pub(crate) fn get_notepad_inner(
    db: &crate::db::Database,
    notepad_id: String,
) -> Result<Option<Notepad>, AppError> {
    let id = Uuid::parse_str(&notepad_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.get_notepad(&id)
}

pub(crate) fn update_notepad_inner(
    db: &crate::db::Database,
    notepad_id: String,
    request: UpdateNotepadRequest,
) -> Result<Notepad, AppError> {
    let id = Uuid::parse_str(&notepad_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    let mut notepad = db
        .get_notepad(&id)?
        .ok_or_else(|| AppError::DbError(format!("Notepad not found: {}", id)))?;

    if let Some(title) = request.title {
        notepad.title = title;
    }
    if let Some(content) = request.content {
        notepad.content = content;
    }
    if let Some(desc) = request.description {
        notepad.description = Some(desc);
    }
    if let Some(tags) = request.tags {
        notepad.tags = tags;
    }
    if let Some(pinned) = request.pinned {
        notepad.pinned = pinned;
    }
    notepad.updated_at = Utc::now();

    db.update_notepad(&notepad)?;
    Ok(notepad)
}

pub(crate) fn delete_notepad_inner(
    db: &crate::db::Database,
    notepad_id: String,
) -> Result<(), AppError> {
    let id = Uuid::parse_str(&notepad_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.delete_notepad(&id)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn create_notepad(
    state: State<'_, AppState>,
    request: CreateNotepadRequest,
) -> Result<Notepad, AppError> {
    state.with_db(move |db| create_notepad_inner(db, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_notepads(state: State<'_, AppState>) -> Result<Vec<Notepad>, AppError> {
    Ok(state.with_db(list_notepads_inner).await.unwrap_or_else(|_| vec![]))
}

#[tauri::command]
#[specta::specta]
pub async fn get_notepad(
    state: State<'_, AppState>,
    notepad_id: String,
) -> Result<Option<Notepad>, AppError> {
    state.with_db(move |db| get_notepad_inner(db, notepad_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_notepad(
    state: State<'_, AppState>,
    notepad_id: String,
    request: UpdateNotepadRequest,
) -> Result<Notepad, AppError> {
    state.with_db(move |db| update_notepad_inner(db, notepad_id, request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_notepad(state: State<'_, AppState>, notepad_id: String) -> Result<(), AppError> {
    state.with_db(move |db| delete_notepad_inner(db, notepad_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_create_notepad_inner() {
        let db = test_db();
        let request = CreateNotepadRequest {
            title: "test notepad".into(),
            content: "some notes".into(),
            description: None,
            tags: None,
        };
        let result = create_notepad_inner(&db, request);
        assert!(result.is_ok());
        let notepad = result.unwrap();
        assert_eq!(notepad.title, "test notepad");
        assert!(!notepad.pinned);
    }

    #[test]
    fn test_list_notepads_inner_empty() {
        let db = test_db();
        let result = list_notepads_inner(&db).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_update_notepad_inner() {
        let db = test_db();
        let notepad = create_notepad_inner(
            &db,
            CreateNotepadRequest {
                title: "original".into(),
                content: "body".into(),
                description: None,
                tags: None,
            },
        )
        .unwrap();

        let updated = update_notepad_inner(
            &db,
            notepad.id.to_string(),
            UpdateNotepadRequest {
                title: Some("renamed".into()),
                content: None,
                description: None,
                tags: None,
                pinned: Some(true),
            },
        )
        .unwrap();

        assert_eq!(updated.title, "renamed");
        assert_eq!(updated.content, "body");
        assert!(updated.pinned);
    }

    #[test]
    fn test_delete_notepad_inner() {
        let db = test_db();
        let notepad = create_notepad_inner(
            &db,
            CreateNotepadRequest {
                title: "to-delete".into(),
                content: "body".into(),
                description: None,
                tags: None,
            },
        )
        .unwrap();

        delete_notepad_inner(&db, notepad.id.to_string()).unwrap();
        let list = list_notepads_inner(&db).unwrap();
        assert!(list.is_empty());
    }
}
