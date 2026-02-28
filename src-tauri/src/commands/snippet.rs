use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::snippet::{CreateSnippetRequest, Snippet, UpdateSnippetRequest};
use crate::state::AppState;

#[tauri::command]
pub async fn create_snippet(
    state: State<'_, AppState>,
    request: CreateSnippetRequest,
) -> Result<Snippet, AppError> {
    let now = Utc::now();
    let snippet = Snippet {
        id: Uuid::new_v4(),
        title: request.title,
        content: request.content,
        language: request.language,
        description: request.description,
        tags: request.tags.unwrap_or_default(),
        source: request.source,
        created_at: now,
        updated_at: now,
    };

    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.insert_snippet(&snippet)?;
    }

    Ok(snippet)
}

#[tauri::command]
pub async fn list_snippets(state: State<'_, AppState>) -> Result<Vec<Snippet>, AppError> {
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.list_snippets()
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn update_snippet(
    state: State<'_, AppState>,
    snippet_id: String,
    request: UpdateSnippetRequest,
) -> Result<Snippet, AppError> {
    let id = Uuid::parse_str(&snippet_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    let db = db
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;

    let mut snippet = db
        .get_snippet(&id)?
        .ok_or_else(|| AppError::DbError(format!("Snippet not found: {}", id)))?;

    if let Some(title) = request.title {
        snippet.title = title;
    }
    if let Some(content) = request.content {
        snippet.content = content;
    }
    if let Some(language) = request.language {
        snippet.language = Some(language);
    }
    if let Some(desc) = request.description {
        snippet.description = Some(desc);
    }
    if let Some(tags) = request.tags {
        snippet.tags = tags;
    }
    if let Some(source) = request.source {
        snippet.source = Some(source);
    }
    snippet.updated_at = Utc::now();

    db.update_snippet(&snippet)?;
    Ok(snippet)
}

#[tauri::command]
pub async fn delete_snippet(state: State<'_, AppState>, snippet_id: String) -> Result<(), AppError> {
    let id = Uuid::parse_str(&snippet_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.delete_snippet(&id)?;
    }
    Ok(())
}
