use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::commands::claude_context::{set_indexing_status, update_indexing_result};
use crate::error::AppError;
use crate::models::codebase_search::{CodeSearchResult, IndexProgress};
use crate::models::mcp::IndexingState;
use crate::services::codebase_index::CodebaseIndex;
use crate::state::AppState;

/// Get the index directory for a given repo.
fn index_dir_for_repo(app: &AppHandle, repo_id: &Uuid) -> Result<PathBuf, AppError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| crate::platform::app_data_dir());
    Ok(data_dir.join("indexes").join(repo_id.to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn search_codebase(
    state: State<'_, AppState>,
    app: AppHandle,
    repo_id: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<CodeSearchResult>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let limit = limit.unwrap_or(10) as usize;
    let codebase_indexes = Arc::clone(&state.codebase_indexes);

    // Check if index is already loaded in memory
    {
        let indexes = codebase_indexes.lock().unwrap();
        if let Some(index) = indexes.get(&id) {
            return index.search(&query, limit);
        }
    }

    // Try to open from disk
    let index_dir = index_dir_for_repo(&app, &id)?;
    if !index_dir.exists() {
        return Ok(Vec::new()); // No index yet
    }

    let index = CodebaseIndex::open_or_create(&index_dir)?;
    let results = index.search(&query, limit)?;

    // Cache it in memory
    codebase_indexes.lock().unwrap().insert(id, index);

    Ok(results)
}

#[tauri::command]
#[specta::specta]
pub async fn start_codebase_indexing(
    state: State<'_, AppState>,
    app: AppHandle,
    repo_id: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let repo_path_str = repo_path.to_string_lossy().to_string();

    // Check if already indexing
    {
        let statuses = state.indexing_status.lock().unwrap();
        if let Some(status) = statuses.get(&id) {
            if status.status == IndexingState::Indexing {
                return Ok(()); // Already in progress
            }
        }
    }

    // Set status to Indexing
    set_indexing_status(&state.indexing_status, id, &repo_path_str);

    let indexing_status = Arc::clone(&state.indexing_status);
    let codebase_indexes = Arc::clone(&state.codebase_indexes);
    let index_dir = index_dir_for_repo(&app, &id)?;
    let app_clone = app.clone();

    tokio::task::spawn_blocking(move || {
        let result = (|| -> Result<(), AppError> {
            let mut index = CodebaseIndex::open_or_create(&index_dir)?;

            index.index_full(&repo_path, |files_indexed, total_files, current_file| {
                let progress = IndexProgress {
                    repo_id: id.to_string(),
                    files_indexed,
                    total_files,
                    current_file: Some(current_file.to_string()),
                };
                let _ = app_clone.emit(&format!("codebase-index-progress:{}", id), &progress);
            })?;

            // Store the index in memory
            codebase_indexes.lock().unwrap().insert(id, index);

            Ok(())
        })();

        update_indexing_result(&indexing_status, id, &repo_path_str, &result);
    });

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_codebase_indexing(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Remove the in-memory index (the background task will complete but results won't be cached)
    state.codebase_indexes.lock().unwrap().remove(&id);

    // Reset status
    let mut statuses = state.indexing_status.lock().unwrap();
    statuses.remove(&id);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_codebase_index(
    state: State<'_, AppState>,
    app: AppHandle,
    repo_id: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Remove from memory
    state.codebase_indexes.lock().unwrap().remove(&id);

    // Remove status
    state.indexing_status.lock().unwrap().remove(&id);

    // Delete from disk
    let index_dir = index_dir_for_repo(&app, &id)?;
    CodebaseIndex::delete(&index_dir)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_codebase_index_stats(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<HashMap<String, String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let indexes = state.codebase_indexes.lock().unwrap();
    let mut stats = HashMap::new();

    if let Some(index) = indexes.get(&id) {
        stats.insert(
            "indexDir".to_string(),
            index.index_dir().to_string_lossy().to_string(),
        );
        stats.insert("loaded".to_string(), "true".to_string());
    } else {
        stats.insert("loaded".to_string(), "false".to_string());
    }

    Ok(stats)
}

#[tauri::command]
#[specta::specta]
pub async fn search_symbols(
    state: State<'_, AppState>,
    app: AppHandle,
    repo_id: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<CodeSearchResult>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let limit = limit.unwrap_or(10) as usize;
    let codebase_indexes = Arc::clone(&state.codebase_indexes);

    {
        let indexes = codebase_indexes.lock().unwrap();
        if let Some(index) = indexes.get(&id) {
            return index.search_symbols(&query, limit);
        }
    }

    let index_dir = index_dir_for_repo(&app, &id)?;
    if !index_dir.exists() {
        return Ok(Vec::new());
    }

    let index = CodebaseIndex::open_or_create(&index_dir)?;
    let results = index.search_symbols(&query, limit)?;
    codebase_indexes.lock().unwrap().insert(id, index);

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_uuid() {
        let id = Uuid::new_v4();
        let parsed: Result<Uuid, _> = id.to_string().parse();
        assert!(parsed.is_ok());
    }

    #[test]
    fn test_parse_invalid_uuid() {
        let parsed: Result<Uuid, _> = "not-a-uuid".parse();
        assert!(parsed.is_err());
    }
}
