use crate::error::AppError;
use crate::models::memory::{MemoryObservation, MemorySnapshot, SaveLearningRequest};
use crate::state::AppState;
use tauri::State;

/// List memory observations for a workspace.
#[tauri::command]
#[specta::specta]
pub async fn list_memory_observations(
    state: State<'_, AppState>,
    workspace_id: String,
    limit: Option<usize>,
) -> Result<Vec<MemoryObservation>, AppError> {
    let limit = limit.unwrap_or(50);
    state.with_db(move |db| db.list_memory_observations(&workspace_id, limit))
        .await
}

/// Search memory observations across scopes.
#[tauri::command]
#[specta::specta]
pub async fn search_memory(
    state: State<'_, AppState>,
    query: String,
    scope: String,
    scope_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<MemoryObservation>, AppError> {
    let limit = limit.unwrap_or(10);
    state.with_db(move |db| {
        db.search_memory_observations(&query, &scope, scope_id.as_deref(), limit)
    })
    .await
}

/// Get memory snapshots for a scope.
#[tauri::command]
#[specta::specta]
pub async fn get_memory_snapshots(
    state: State<'_, AppState>,
    scope: String,
    scope_id: Option<String>,
) -> Result<Vec<MemorySnapshot>, AppError> {
    state.with_db(move |db| db.get_memory_snapshots(&scope, scope_id.as_deref()))
        .await
}

/// Build the full memory context for a workspace (for debugging/preview).
#[tauri::command]
#[specta::specta]
pub async fn get_memory_context(
    state: State<'_, AppState>,
    workspace_id: String,
    repo_id: String,
) -> Result<Option<String>, AppError> {
    state.with_db(move |db| db.build_memory_context(&workspace_id, &repo_id))
        .await
}

/// Save a learning manually (user or agent-initiated).
#[tauri::command]
#[specta::specta]
pub async fn save_memory_learning(
    state: State<'_, AppState>,
    request: SaveLearningRequest,
) -> Result<(), AppError> {
    let snapshot = MemorySnapshot {
        id: uuid::Uuid::new_v4().to_string(),
        scope: request.scope,
        scope_id: if request.scope == "global" {
            None
        } else if request.scope == "repo" {
            Some(request.repo_id.clone())
        } else {
            Some(request.workspace_id.clone())
        },
        category: request.category,
        content: format!("- {}", request.content),
        observation_ids: vec![],
        created_at: chrono::Utc::now().to_rfc3339(),
        supersedes: None,
    };
    state.with_db(move |db| db.upsert_memory_snapshot(&snapshot))
        .await
}

/// Clear all memory for a workspace.
#[tauri::command]
#[specta::specta]
pub async fn clear_workspace_memory(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    state.with_db(move |db| db.clear_workspace_memory(&workspace_id))
        .await
}

/// Prune old observations (called periodically or from settings).
#[tauri::command]
#[specta::specta]
pub async fn prune_memory_observations(
    state: State<'_, AppState>,
    older_than_days: Option<i64>,
) -> Result<usize, AppError> {
    let days = older_than_days.unwrap_or(30);
    state.with_db(move |db| db.prune_old_observations(days))
        .await
}
