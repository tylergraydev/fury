use crate::error::AppError;
use crate::models::mcp::{IndexingState, IndexingStatus};
use crate::services::claude_context as ctx_svc;
use crate::state::AppState;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn index_repository(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let (repo_path, settings) = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        let settings = state.settings.read().unwrap().clone();
        (
            repo.path.to_string_lossy().to_string(),
            settings.claude_context.clone(),
        )
    };

    ctx_svc::validate_settings(&settings)?;

    // Set status to Indexing
    {
        let mut statuses = state.indexing_status.lock().unwrap();
        statuses.insert(
            id,
            IndexingStatus {
                repo_id: id.to_string(),
                repo_path: repo_path.clone(),
                status: IndexingState::Indexing,
                error: None,
                last_indexed_at: None,
            },
        );
    }

    let indexing_status = state.indexing_status.clone();
    tokio::task::spawn_blocking(move || {
        match ctx_svc::index_codebase(&settings, &repo_path) {
            Ok(_) => {
                let mut statuses = indexing_status.lock().unwrap();
                statuses.insert(
                    id,
                    IndexingStatus {
                        repo_id: id.to_string(),
                        repo_path,
                        status: IndexingState::Indexed,
                        error: None,
                        last_indexed_at: Some(chrono::Utc::now().to_rfc3339()),
                    },
                );
            }
            Err(e) => {
                let mut statuses = indexing_status.lock().unwrap();
                statuses.insert(
                    id,
                    IndexingStatus {
                        repo_id: id.to_string(),
                        repo_path,
                        status: IndexingState::Error,
                        error: Some(e.to_string()),
                        last_indexed_at: None,
                    },
                );
            }
        }
    })
    .await
    .map_err(|e| AppError::McpError(format!("Indexing task failed: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn get_indexing_status(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<IndexingStatus, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let indexing_status = Arc::clone(&state.indexing_status);
    tokio::task::spawn_blocking(move || {
        let statuses = indexing_status.lock().unwrap();
        Ok(statuses.get(&id).cloned().unwrap_or(IndexingStatus {
            repo_id: id.to_string(),
            repo_path: String::new(),
            status: IndexingState::NotIndexed,
            error: None,
            last_indexed_at: None,
        }))
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_indexing_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<IndexingStatus>, AppError> {
    let indexing_status = Arc::clone(&state.indexing_status);
    tokio::task::spawn_blocking(move || {
        let statuses = indexing_status.lock().unwrap();
        Ok(statuses.values().cloned().collect())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}
