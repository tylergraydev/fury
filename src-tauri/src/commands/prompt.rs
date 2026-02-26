use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::prompt::{CreatePromptRequest, Prompt, UpdatePromptRequest};
use crate::state::AppState;

#[tauri::command]
pub fn create_prompt(
    state: State<'_, AppState>,
    request: CreatePromptRequest,
) -> Result<Prompt, AppError> {
    let now = Utc::now();
    let prompt = Prompt {
        id: Uuid::new_v4(),
        name: request.name,
        content: request.content,
        description: request.description,
        category: request.category,
        tags: request.tags.unwrap_or_default(),
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };

    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.insert_prompt(&prompt)?;
    }

    Ok(prompt)
}

#[tauri::command]
pub fn list_prompts(state: State<'_, AppState>) -> Result<Vec<Prompt>, AppError> {
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.list_prompts()
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn update_prompt(
    state: State<'_, AppState>,
    prompt_id: String,
    request: UpdatePromptRequest,
) -> Result<Prompt, AppError> {
    let id = Uuid::parse_str(&prompt_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    let db = db
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;

    let mut prompt = db
        .get_prompt(&id)?
        .ok_or_else(|| AppError::DbError(format!("Prompt not found: {}", id)))?;

    if let Some(name) = request.name {
        prompt.name = name;
    }
    if let Some(content) = request.content {
        prompt.content = content;
    }
    if let Some(desc) = request.description {
        prompt.description = Some(desc);
    }
    if let Some(cat) = request.category {
        prompt.category = Some(cat);
    }
    if let Some(tags) = request.tags {
        prompt.tags = tags;
    }
    prompt.updated_at = Utc::now();

    db.update_prompt(&prompt)?;
    Ok(prompt)
}

#[tauri::command]
pub fn delete_prompt(state: State<'_, AppState>, prompt_id: String) -> Result<(), AppError> {
    let id = Uuid::parse_str(&prompt_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.delete_prompt(&id)?;
    }
    Ok(())
}
