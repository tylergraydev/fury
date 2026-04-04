use crate::error::AppError;
use crate::models::mcp::{IndexingState, IndexingStatus};
use crate::services::claude_context as ctx_svc;
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;
use uuid::Uuid;

/// Parse a repo ID string and look up the repo path and settings from state.
pub(crate) fn resolve_repo_for_indexing(
    repositories: &HashMap<Uuid, crate::models::repository::Repository>,
    settings: &crate::models::settings::AppSettings,
    repo_id: &str,
) -> Result<(Uuid, String, crate::models::settings::ClaudeContextSettings), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let repo = repositories.get(&id).ok_or(AppError::RepoNotFound(id))?;
    let repo_path = repo.path.to_string_lossy().to_string();
    let ctx_settings = settings.claude_context.clone();
    Ok((id, repo_path, ctx_settings))
}

/// Set the indexing status for a repo to "Indexing".
pub(crate) fn set_indexing_status(
    statuses: &Mutex<HashMap<Uuid, IndexingStatus>>,
    id: Uuid,
    repo_path: &str,
) {
    let mut map = statuses.lock().unwrap();
    map.insert(
        id,
        IndexingStatus {
            repo_id: id.to_string(),
            repo_path: repo_path.to_string(),
            status: IndexingState::Indexing,
            error: None,
            last_indexed_at: None,
        },
    );
}

/// Update the indexing status after completion (success or error).
pub(crate) fn update_indexing_result(
    statuses: &Mutex<HashMap<Uuid, IndexingStatus>>,
    id: Uuid,
    repo_path: &str,
    result: &Result<(), AppError>,
) {
    let mut map = statuses.lock().unwrap();
    match result {
        Ok(_) => {
            map.insert(
                id,
                IndexingStatus {
                    repo_id: id.to_string(),
                    repo_path: repo_path.to_string(),
                    status: IndexingState::Indexed,
                    error: None,
                    last_indexed_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            );
        }
        Err(e) => {
            map.insert(
                id,
                IndexingStatus {
                    repo_id: id.to_string(),
                    repo_path: repo_path.to_string(),
                    status: IndexingState::Error,
                    error: Some(e.to_string()),
                    last_indexed_at: None,
                },
            );
        }
    }
}

/// Look up a single repo's indexing status, returning a default if not found.
pub(crate) fn get_indexing_status_inner(
    statuses: &Mutex<HashMap<Uuid, IndexingStatus>>,
    repo_id: &str,
) -> Result<IndexingStatus, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let map = statuses.lock().unwrap();
    Ok(map.get(&id).cloned().unwrap_or(IndexingStatus {
        repo_id: id.to_string(),
        repo_path: String::new(),
        status: IndexingState::NotIndexed,
        error: None,
        last_indexed_at: None,
    }))
}

/// Collect all indexing statuses.
pub(crate) fn list_indexing_statuses_inner(
    statuses: &Mutex<HashMap<Uuid, IndexingStatus>>,
) -> Vec<IndexingStatus> {
    let map = statuses.lock().unwrap();
    map.values().cloned().collect()
}

#[tauri::command]
#[specta::specta]
pub async fn index_repository(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<(), AppError> {
    let (id, repo_path, settings) = {
        let repos = state.repositories.read().unwrap();
        let app_settings = state.settings.read().unwrap();
        resolve_repo_for_indexing(&repos, &app_settings, &repo_id)?
    };

    ctx_svc::validate_settings(&settings)?;

    // Set status to Indexing
    set_indexing_status(&state.indexing_status, id, &repo_path);

    let indexing_status = state.indexing_status.clone();
    tokio::task::spawn_blocking(move || {
        let result: Result<(), AppError> = ctx_svc::index_codebase(&settings, &repo_path)
            .map(|_| ())
            .map_err(|e| AppError::McpError(e.to_string()));
        update_indexing_result(&indexing_status, id, &repo_path, &result);
    })
    .await
    .map_err(|e| AppError::McpError(format!("Indexing task failed: {}", e)))?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_indexing_status(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<IndexingStatus, AppError> {
    let indexing_status = Arc::clone(&state.indexing_status);
    tokio::task::spawn_blocking(move || get_indexing_status_inner(&indexing_status, &repo_id))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn list_indexing_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<IndexingStatus>, AppError> {
    let indexing_status = Arc::clone(&state.indexing_status);
    tokio::task::spawn_blocking(move || Ok(list_indexing_statuses_inner(&indexing_status)))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::mcp::{IndexingState, IndexingStatus};
    use crate::test_helpers::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[test]
    fn test_resolve_repo_for_indexing_valid() {
        let repo = test_repo();
        let mut repos = HashMap::new();
        let id = repo.id;
        repos.insert(id, repo);
        let settings = test_settings();
        let (resolved_id, path, _ctx) =
            resolve_repo_for_indexing(&repos, &settings, &id.to_string()).unwrap();
        assert_eq!(resolved_id, id);
        assert!(!path.is_empty());
    }

    #[test]
    fn test_resolve_repo_for_indexing_invalid_uuid() {
        let repos = HashMap::new();
        let settings = test_settings();
        let result = resolve_repo_for_indexing(&repos, &settings, "not-a-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_repo_for_indexing_not_found() {
        let repos = HashMap::new();
        let settings = test_settings();
        let fake_id = Uuid::new_v4().to_string();
        let result = resolve_repo_for_indexing(&repos, &settings, &fake_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_indexing_status() {
        let statuses = Mutex::new(HashMap::new());
        let id = Uuid::new_v4();
        set_indexing_status(&statuses, id, "/tmp/repo");
        let map = statuses.lock().unwrap();
        let status = map.get(&id).unwrap();
        assert_eq!(status.status, IndexingState::Indexing);
        assert_eq!(status.repo_path, "/tmp/repo");
        assert!(status.error.is_none());
    }

    #[test]
    fn test_update_indexing_result_success() {
        let statuses = Mutex::new(HashMap::new());
        let id = Uuid::new_v4();
        let result: Result<(), AppError> = Ok(());
        update_indexing_result(&statuses, id, "/tmp/repo", &result);
        let map = statuses.lock().unwrap();
        let status = map.get(&id).unwrap();
        assert_eq!(status.status, IndexingState::Indexed);
        assert!(status.error.is_none());
        assert!(status.last_indexed_at.is_some());
    }

    #[test]
    fn test_update_indexing_result_error() {
        let statuses = Mutex::new(HashMap::new());
        let id = Uuid::new_v4();
        let result: Result<(), AppError> =
            Err(AppError::McpError("indexing failed".to_string()));
        update_indexing_result(&statuses, id, "/tmp/repo", &result);
        let map = statuses.lock().unwrap();
        let status = map.get(&id).unwrap();
        assert_eq!(status.status, IndexingState::Error);
        assert!(status.error.as_ref().unwrap().contains("indexing failed"));
        assert!(status.last_indexed_at.is_none());
    }

    #[test]
    fn test_get_indexing_status_inner_found() {
        let statuses = Mutex::new(HashMap::new());
        let id = Uuid::new_v4();
        statuses.lock().unwrap().insert(
            id,
            IndexingStatus {
                repo_id: id.to_string(),
                repo_path: "/tmp/repo".to_string(),
                status: IndexingState::Indexed,
                error: None,
                last_indexed_at: Some("2026-01-01T00:00:00Z".to_string()),
            },
        );
        let result = get_indexing_status_inner(&statuses, &id.to_string()).unwrap();
        assert_eq!(result.status, IndexingState::Indexed);
        assert_eq!(result.repo_path, "/tmp/repo");
    }

    #[test]
    fn test_get_indexing_status_inner_not_found() {
        let statuses = Mutex::new(HashMap::new());
        let id = Uuid::new_v4();
        let result = get_indexing_status_inner(&statuses, &id.to_string()).unwrap();
        assert_eq!(result.status, IndexingState::NotIndexed);
        assert!(result.repo_path.is_empty());
    }

    #[test]
    fn test_get_indexing_status_inner_invalid_uuid() {
        let statuses = Mutex::new(HashMap::new());
        let result = get_indexing_status_inner(&statuses, "bad-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_indexing_statuses_inner_empty() {
        let statuses = Mutex::new(HashMap::new());
        let result = list_indexing_statuses_inner(&statuses);
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_indexing_statuses_inner_multiple() {
        let statuses = Mutex::new(HashMap::new());
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        {
            let mut map = statuses.lock().unwrap();
            map.insert(
                id1,
                IndexingStatus {
                    repo_id: id1.to_string(),
                    repo_path: "/tmp/repo1".to_string(),
                    status: IndexingState::Indexed,
                    error: None,
                    last_indexed_at: Some("2026-01-01T00:00:00Z".to_string()),
                },
            );
            map.insert(
                id2,
                IndexingStatus {
                    repo_id: id2.to_string(),
                    repo_path: "/tmp/repo2".to_string(),
                    status: IndexingState::Indexing,
                    error: None,
                    last_indexed_at: None,
                },
            );
        }
        let result = list_indexing_statuses_inner(&statuses);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_set_then_update_indexing_workflow() {
        let statuses = Mutex::new(HashMap::new());
        let id = Uuid::new_v4();

        // Start indexing
        set_indexing_status(&statuses, id, "/tmp/repo");
        assert_eq!(
            statuses.lock().unwrap().get(&id).unwrap().status,
            IndexingState::Indexing
        );

        // Complete successfully
        update_indexing_result(&statuses, id, "/tmp/repo", &Ok(()));
        let status = get_indexing_status_inner(&statuses, &id.to_string()).unwrap();
        assert_eq!(status.status, IndexingState::Indexed);
        assert!(status.last_indexed_at.is_some());
    }

    #[test]
    fn test_indexing_status_serde_roundtrip() {
        let status = IndexingStatus {
            repo_id: Uuid::new_v4().to_string(),
            repo_path: "/tmp/test".to_string(),
            status: IndexingState::Error,
            error: Some("connection timeout".to_string()),
            last_indexed_at: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        let deserialized: IndexingStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, IndexingState::Error);
        assert_eq!(
            deserialized.error.as_deref(),
            Some("connection timeout")
        );
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_get_indexing_status_command_not_indexed() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let repo_id = Uuid::new_v4();
        let result = get_indexing_status(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.status, IndexingState::NotIndexed);
    }

    #[tokio::test]
    async fn test_get_indexing_status_command_with_existing_status() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let repo_id = Uuid::new_v4();
        // Pre-populate indexing status
        state.indexing_status.lock().unwrap().insert(
            repo_id,
            IndexingStatus {
                repo_id: repo_id.to_string(),
                repo_path: "/tmp/test-repo".to_string(),
                status: IndexingState::Indexed,
                error: None,
                last_indexed_at: Some("2026-01-01T00:00:00Z".to_string()),
            },
        );

        let result = get_indexing_status(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.status, IndexingState::Indexed);
        assert_eq!(status.repo_path, "/tmp/test-repo");
    }

    #[tokio::test]
    async fn test_get_indexing_status_command_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = get_indexing_status(state, "bad-uuid".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_list_indexing_statuses_command_empty() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = list_indexing_statuses(state).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_list_indexing_statuses_command_with_data() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        {
            let mut map = state.indexing_status.lock().unwrap();
            map.insert(
                id1,
                IndexingStatus {
                    repo_id: id1.to_string(),
                    repo_path: "/tmp/r1".to_string(),
                    status: IndexingState::Indexed,
                    error: None,
                    last_indexed_at: Some("2026-01-01T00:00:00Z".to_string()),
                },
            );
            map.insert(
                id2,
                IndexingStatus {
                    repo_id: id2.to_string(),
                    repo_path: "/tmp/r2".to_string(),
                    status: IndexingState::Indexing,
                    error: None,
                    last_indexed_at: None,
                },
            );
        }

        let result = list_indexing_statuses(state).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 2);
    }
}
