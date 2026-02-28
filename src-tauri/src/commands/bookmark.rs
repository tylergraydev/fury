use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::bookmark::{CreateBookmarkRequest, FileBookmark, UpdateBookmarkRequest};
use crate::state::AppState;

#[tauri::command]
pub async fn create_bookmark(
    state: State<'_, AppState>,
    request: CreateBookmarkRequest,
) -> Result<FileBookmark, AppError> {
    let now = Utc::now();
    let bookmark = FileBookmark {
        id: Uuid::new_v4(),
        repo_id: request.repo_id,
        file_path: request.file_path,
        line_number: request.line_number,
        note: request.note,
        color: request.color,
        created_at: now,
        updated_at: now,
    };

    let bookmark_clone = bookmark.clone();
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.insert_bookmark(&bookmark_clone)?;
    }

    Ok(bookmark)
}

#[tauri::command]
pub async fn list_bookmarks(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<FileBookmark>, AppError> {
    let repo_uuid =
        Uuid::parse_str(&repo_id).map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.list_bookmarks(&repo_uuid)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn update_bookmark(
    state: State<'_, AppState>,
    bookmark_id: String,
    request: UpdateBookmarkRequest,
) -> Result<FileBookmark, AppError> {
    let id = Uuid::parse_str(&bookmark_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    let db = db
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;

    let mut bookmark = db
        .get_bookmark(&id)?
        .ok_or_else(|| AppError::DbError(format!("Bookmark not found: {}", id)))?;

    if let Some(note) = request.note {
        bookmark.note = if note.is_empty() { None } else { Some(note) };
    }
    if let Some(color) = request.color {
        bookmark.color = Some(color);
    }
    if let Some(line_number) = request.line_number {
        bookmark.line_number = line_number;
    }
    bookmark.updated_at = Utc::now();

    db.update_bookmark(&bookmark)?;
    Ok(bookmark)
}

#[tauri::command]
pub async fn delete_bookmark(state: State<'_, AppState>, bookmark_id: String) -> Result<(), AppError> {
    let id = Uuid::parse_str(&bookmark_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.delete_bookmark(&id)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_bookmark(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: String,
    line_number: u32,
) -> Result<Option<FileBookmark>, AppError> {
    let repo_uuid =
        Uuid::parse_str(&repo_id).map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    let db = db
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;

    // Check if a bookmark exists at this location
    let deleted = db.delete_bookmark_at_line(&repo_uuid, &file_path, line_number)?;

    if deleted {
        Ok(None)
    } else {
        let now = Utc::now();
        let bookmark = FileBookmark {
            id: Uuid::new_v4(),
            repo_id: repo_uuid,
            file_path,
            line_number,
            note: None,
            color: None,
            created_at: now,
            updated_at: now,
        };
        db.insert_bookmark(&bookmark)?;
        Ok(Some(bookmark))
    }
}
