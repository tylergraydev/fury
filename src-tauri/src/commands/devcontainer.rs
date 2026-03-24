use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::devcontainer::{ContainerState, ContainerStatus, DevContainerConfig};
use crate::models::workspace::Workspace;
use crate::services::devcontainer as dc_svc;
use crate::state::AppState;

/// Parse a workspace ID string, returning the appropriate error.
pub(crate) fn parse_workspace_id(workspace_id: &str) -> Result<Uuid, AppError> {
    workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))
}

/// Parse a repo ID string, returning the appropriate error.
pub(crate) fn parse_repo_id(repo_id: &str) -> Result<Uuid, AppError> {
    repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))
}

/// Look up the container ID from container state for a workspace.
pub(crate) fn get_container_id(
    container_states: &HashMap<Uuid, ContainerState>,
    ws_id: Uuid,
) -> Result<String, AppError> {
    let cs = container_states
        .get(&ws_id)
        .ok_or_else(|| AppError::ContainerError("No container state".to_string()))?;
    cs.container_id
        .clone()
        .ok_or_else(|| AppError::ContainerError("No container ID".to_string()))
}

/// Look up the container status for a workspace, returning a default if not found.
pub(crate) fn get_container_status_inner(
    container_states: &HashMap<Uuid, ContainerState>,
    ws_id: Uuid,
) -> ContainerState {
    container_states
        .get(&ws_id)
        .cloned()
        .unwrap_or_else(|| ContainerState::new(ws_id))
}

/// Extract workspace config and folder for starting a container.
pub(crate) fn extract_workspace_config(
    workspaces: &HashMap<Uuid, Workspace>,
    repositories: &HashMap<Uuid, crate::models::repository::Repository>,
    ws_id: Uuid,
) -> Result<(DevContainerConfig, std::path::PathBuf, String), AppError> {
    let ws = workspaces
        .get(&ws_id)
        .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    let config = ws
        .devcontainer_config
        .clone()
        .ok_or_else(|| AppError::ContainerError("No dev container config".to_string()))?;
    let repo_name = repositories
        .get(&ws.repo_id)
        .map(|r| r.name.clone())
        .unwrap_or_else(|| "workspace".to_string());
    Ok((config, ws.worktree_path.clone(), repo_name))
}

/// Build a ContainerState for a successful container start.
pub(crate) fn build_running_state(ws_id: Uuid, container_id: &str) -> ContainerState {
    ContainerState {
        workspace_id: ws_id,
        status: ContainerStatus::Running,
        container_id: Some(container_id.to_string()),
        container_name: Some(format!("fury-{}", ws_id)),
        log_tail: Vec::new(),
    }
}

/// Build a ContainerState for a failed container start.
pub(crate) fn build_error_state(ws_id: Uuid, error_msg: &str) -> ContainerState {
    ContainerState {
        workspace_id: ws_id,
        status: ContainerStatus::Error(error_msg.to_string()),
        container_id: None,
        container_name: None,
        log_tail: Vec::new(),
    }
}

/// Update workspace devcontainer config in-memory and in DB.
#[cfg(test)]
pub(crate) fn update_devcontainer_config_inner(
    workspaces: &mut HashMap<Uuid, Workspace>,
    db: Option<&crate::db::Database>,
    ws_id: Uuid,
    config: DevContainerConfig,
) -> Result<(), AppError> {
    let ws = workspaces
        .get_mut(&ws_id)
        .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    ws.devcontainer_config = Some(config.clone());

    if let Some(db) = db {
        db.update_workspace_devcontainer_config(&ws_id, Some(&config))?;
    }

    Ok(())
}

/// Resolve a repo path for devcontainer detection.
pub(crate) fn resolve_repo_path_for_detection(
    repositories: &HashMap<Uuid, crate::models::repository::Repository>,
    repo_id: &str,
) -> Result<std::path::PathBuf, AppError> {
    let id = parse_repo_id(repo_id)?;
    let repo = repositories
        .get(&id)
        .ok_or(AppError::RepoNotFound(id))?;
    Ok(repo.path.clone())
}

#[tauri::command]
pub async fn start_container(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ContainerState, AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    let (config, workspace_folder, _repo_name) = {
        let workspaces = state.workspaces.read().unwrap();
        let repos = state.repositories.read().unwrap();
        extract_workspace_config(&workspaces, &repos, ws_id)?
    };

    // Update state to Building
    {
        let mut states = state.container_states.lock().unwrap();
        let cs = states.entry(ws_id).or_insert_with(|| ContainerState::new(ws_id));
        cs.status = ContainerStatus::Building;
    }
    dc_svc::emit_container_status(&app, ws_id, &ContainerStatus::Building, None);

    // Start the container
    let result = match config.backend {
        crate::models::devcontainer::ContainerBackend::DevcontainerCli => {
            dc_svc::devcontainer_up(ws_id, &workspace_folder, &config, &app).await
        }
        crate::models::devcontainer::ContainerBackend::RawDocker => {
            dc_svc::docker_up(ws_id, &workspace_folder, &config, &app).await
        }
    };

    match result {
        Ok(container_id) => {
            let container_state = build_running_state(ws_id, &container_id);
            {
                let mut states = state.container_states.lock().unwrap();
                states.insert(ws_id, container_state.clone());
            }
            dc_svc::emit_container_status(
                &app,
                ws_id,
                &ContainerStatus::Running,
                Some(&container_id),
            );
            Ok(container_state)
        }
        Err(e) => {
            let error_msg = e.to_string();
            let container_state = build_error_state(ws_id, &error_msg);
            {
                let mut states = state.container_states.lock().unwrap();
                states.insert(ws_id, container_state.clone());
            }
            dc_svc::emit_container_status(
                &app,
                ws_id,
                &ContainerStatus::Error(error_msg),
                None,
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn stop_container(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    // Acquire workspaces lock first, then container_states, to respect lock ordering
    let (config, workspace_folder) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let config = ws.devcontainer_config.clone().unwrap_or_default();
        (config, ws.worktree_path.clone())
    };

    let container_id = {
        let states = state.container_states.lock().unwrap();
        get_container_id(&states, ws_id)?
    };

    dc_svc::container_stop(&container_id, &config, Some(&workspace_folder)).await?;

    {
        let mut states = state.container_states.lock().unwrap();
        if let Some(cs) = states.get_mut(&ws_id) {
            cs.status = ContainerStatus::Stopped;
        }
    }
    dc_svc::emit_container_status(&app, ws_id, &ContainerStatus::Stopped, Some(&container_id));

    Ok(())
}

#[tauri::command]
pub async fn rebuild_container(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ContainerState, AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    // Stop and remove existing container if any
    let old_container_id = {
        let states = state.container_states.lock().unwrap();
        states
            .get(&ws_id)
            .and_then(|cs| cs.container_id.clone())
    };
    if let Some(cid) = old_container_id {
        let _ = dc_svc::container_remove(&cid).await;
    }

    // Clear old state
    {
        let mut states = state.container_states.lock().unwrap();
        states.remove(&ws_id);
    }

    // Re-start
    start_container(app, state, workspace_id).await
}

#[tauri::command]
pub async fn get_container_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ContainerState, AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;
    let states = state.container_states.lock().unwrap();
    Ok(get_container_status_inner(&states, ws_id))
}

#[tauri::command]
pub async fn update_devcontainer_config(
    state: State<'_, AppState>,
    workspace_id: String,
    config: DevContainerConfig,
) -> Result<(), AppError> {
    let ws_id = parse_workspace_id(&workspace_id)?;

    // Update in-memory state first, then drop workspaces lock before acquiring db lock
    // to respect lock ordering (workspaces before db, never both simultaneously)
    {
        let mut workspaces = state.workspaces.write().unwrap();
        let ws = workspaces
            .get_mut(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.devcontainer_config = Some(config.clone());
    }

    // Now persist to db (workspaces lock is dropped)
    let db_guard = state.db.lock().unwrap();
    if let Some(db) = db_guard.as_ref() {
        db.update_workspace_devcontainer_config(&ws_id, Some(&config))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn detect_devcontainer(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Option<String>, AppError> {
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        resolve_repo_path_for_detection(&repos, &repo_id)?
    };

    Ok(dc_svc::detect_devcontainer_json(&repo_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::devcontainer::*;
    use crate::test_helpers::*;
    use std::collections::HashMap;

    #[test]
    fn test_parse_workspace_id_valid() {
        let id = Uuid::new_v4();
        let result = parse_workspace_id(&id.to_string()).unwrap();
        assert_eq!(result, id);
    }

    #[test]
    fn test_parse_workspace_id_invalid() {
        let result = parse_workspace_id("not-a-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_repo_id_valid() {
        let id = Uuid::new_v4();
        let result = parse_repo_id(&id.to_string()).unwrap();
        assert_eq!(result, id);
    }

    #[test]
    fn test_parse_repo_id_invalid() {
        let result = parse_repo_id("bad");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_container_id_present() {
        let mut states = HashMap::new();
        let ws_id = Uuid::new_v4();
        states.insert(
            ws_id,
            ContainerState {
                workspace_id: ws_id,
                status: ContainerStatus::Running,
                container_id: Some("abc123".to_string()),
                container_name: Some("fury-test".to_string()),
                log_tail: vec![],
            },
        );
        let result = get_container_id(&states, ws_id).unwrap();
        assert_eq!(result, "abc123");
    }

    #[test]
    fn test_get_container_id_no_state() {
        let states: HashMap<Uuid, ContainerState> = HashMap::new();
        let ws_id = Uuid::new_v4();
        let result = get_container_id(&states, ws_id);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("No container state"));
    }

    #[test]
    fn test_get_container_id_no_id() {
        let mut states = HashMap::new();
        let ws_id = Uuid::new_v4();
        states.insert(ws_id, ContainerState::new(ws_id));
        let result = get_container_id(&states, ws_id);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("No container ID"));
    }

    #[test]
    fn test_get_container_status_inner_found() {
        let mut states = HashMap::new();
        let ws_id = Uuid::new_v4();
        states.insert(
            ws_id,
            ContainerState {
                workspace_id: ws_id,
                status: ContainerStatus::Running,
                container_id: Some("xyz".to_string()),
                container_name: None,
                log_tail: vec!["line1".to_string()],
            },
        );
        let result = get_container_status_inner(&states, ws_id);
        assert_eq!(result.status, ContainerStatus::Running);
        assert_eq!(result.container_id.as_deref(), Some("xyz"));
        assert_eq!(result.log_tail.len(), 1);
    }

    #[test]
    fn test_get_container_status_inner_not_found() {
        let states: HashMap<Uuid, ContainerState> = HashMap::new();
        let ws_id = Uuid::new_v4();
        let result = get_container_status_inner(&states, ws_id);
        assert_eq!(result.workspace_id, ws_id);
        assert_eq!(result.status, ContainerStatus::None);
        assert!(result.container_id.is_none());
    }

    #[test]
    fn test_build_running_state() {
        let ws_id = Uuid::new_v4();
        let state = build_running_state(ws_id, "container-abc");
        assert_eq!(state.workspace_id, ws_id);
        assert_eq!(state.status, ContainerStatus::Running);
        assert_eq!(state.container_id.as_deref(), Some("container-abc"));
        assert_eq!(
            state.container_name.as_deref(),
            Some(&format!("fury-{}", ws_id) as &str)
        );
        assert!(state.log_tail.is_empty());
    }

    #[test]
    fn test_build_error_state() {
        let ws_id = Uuid::new_v4();
        let state = build_error_state(ws_id, "build failed");
        assert_eq!(state.workspace_id, ws_id);
        assert_eq!(
            state.status,
            ContainerStatus::Error("build failed".to_string())
        );
        assert!(state.container_id.is_none());
        assert!(state.container_name.is_none());
        assert!(state.log_tail.is_empty());
    }

    #[test]
    fn test_extract_workspace_config_valid() {
        let repo = test_repo();
        let mut ws = test_workspace(repo.id);
        ws.devcontainer_config = Some(DevContainerConfig {
            enabled: true,
            image: Some("node:20".to_string()),
            ..Default::default()
        });
        let ws_id = ws.id;

        let mut workspaces = HashMap::new();
        workspaces.insert(ws_id, ws);
        let mut repos = HashMap::new();
        repos.insert(repo.id, repo);

        let (config, _path, repo_name) =
            extract_workspace_config(&workspaces, &repos, ws_id).unwrap();
        assert!(config.enabled);
        assert_eq!(config.image.as_deref(), Some("node:20"));
        assert_eq!(repo_name, "test-repo");
    }

    #[test]
    fn test_extract_workspace_config_no_config() {
        let repo = test_repo();
        let ws = test_workspace(repo.id);
        let ws_id = ws.id;

        let mut workspaces = HashMap::new();
        workspaces.insert(ws_id, ws);
        let mut repos = HashMap::new();
        repos.insert(repo.id, repo);

        let result = extract_workspace_config(&workspaces, &repos, ws_id);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("No dev container config"));
    }

    #[test]
    fn test_extract_workspace_config_not_found() {
        let workspaces: HashMap<Uuid, Workspace> = HashMap::new();
        let repos = HashMap::new();
        let ws_id = Uuid::new_v4();
        let result = extract_workspace_config(&workspaces, &repos, ws_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_workspace_config_missing_repo() {
        let repo = test_repo();
        let mut ws = test_workspace(repo.id);
        ws.devcontainer_config = Some(DevContainerConfig::default());
        let ws_id = ws.id;

        let mut workspaces = HashMap::new();
        workspaces.insert(ws_id, ws);
        let repos: HashMap<Uuid, crate::models::repository::Repository> = HashMap::new();

        // Should still succeed — repo_name falls back to "workspace"
        let (_config, _path, repo_name) =
            extract_workspace_config(&workspaces, &repos, ws_id).unwrap();
        assert_eq!(repo_name, "workspace");
    }

    #[test]
    fn test_update_devcontainer_config_inner_valid() {
        let db = test_db();
        let (repo, ws) = insert_test_repo_and_workspace(&db);
        let ws_id = ws.id;
        let _ = repo; // keep in scope

        let mut workspaces = HashMap::new();
        workspaces.insert(ws_id, ws);

        let config = DevContainerConfig {
            enabled: true,
            image: Some("rust:latest".to_string()),
            ..Default::default()
        };

        update_devcontainer_config_inner(&mut workspaces, Some(&db), ws_id, config).unwrap();

        // Verify in-memory
        let ws = workspaces.get(&ws_id).unwrap();
        assert!(ws.devcontainer_config.is_some());
        assert_eq!(
            ws.devcontainer_config.as_ref().unwrap().image.as_deref(),
            Some("rust:latest")
        );
    }

    #[test]
    fn test_update_devcontainer_config_inner_workspace_not_found() {
        let mut workspaces: HashMap<Uuid, Workspace> = HashMap::new();
        let ws_id = Uuid::new_v4();
        let config = DevContainerConfig::default();
        let result = update_devcontainer_config_inner(&mut workspaces, None, ws_id, config);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_devcontainer_config_inner_no_db() {
        let repo = test_repo();
        let ws = test_workspace(repo.id);
        let ws_id = ws.id;

        let mut workspaces = HashMap::new();
        workspaces.insert(ws_id, ws);

        let config = DevContainerConfig {
            enabled: true,
            ..Default::default()
        };

        // Should succeed even without a DB
        let result = update_devcontainer_config_inner(&mut workspaces, None, ws_id, config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_resolve_repo_path_for_detection_valid() {
        let repo = test_repo();
        let id = repo.id;
        let expected = repo.path.clone();
        let mut repos = HashMap::new();
        repos.insert(id, repo);
        let result = resolve_repo_path_for_detection(&repos, &id.to_string()).unwrap();
        assert_eq!(result, expected);
    }

    #[test]
    fn test_resolve_repo_path_for_detection_invalid_uuid() {
        let repos = HashMap::new();
        let result = resolve_repo_path_for_detection(&repos, "bad");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_repo_path_for_detection_not_found() {
        let repos: HashMap<Uuid, crate::models::repository::Repository> = HashMap::new();
        let fake_id = Uuid::new_v4().to_string();
        let result = resolve_repo_path_for_detection(&repos, &fake_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_container_state_serde_roundtrip() {
        let ws_id = Uuid::new_v4();
        let state = build_running_state(ws_id, "id-123");
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: ContainerState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.workspace_id, ws_id);
        assert_eq!(deserialized.status, ContainerStatus::Running);
        assert_eq!(deserialized.container_id.as_deref(), Some("id-123"));
    }

    #[test]
    fn test_devcontainer_config_serde_roundtrip() {
        let config = DevContainerConfig {
            enabled: true,
            backend: ContainerBackend::RawDocker,
            image: Some("node:20".to_string()),
            extra_docker_args: vec!["--network=host".to_string()],
            ..Default::default()
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: DevContainerConfig = serde_json::from_str(&json).unwrap();
        assert!(deserialized.enabled);
        assert_eq!(deserialized.backend, ContainerBackend::RawDocker);
        assert_eq!(deserialized.image.as_deref(), Some("node:20"));
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_get_container_status_command_no_state() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let ws_id = Uuid::new_v4();
        let result = get_container_status(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        let cs = result.unwrap();
        assert_eq!(cs.workspace_id, ws_id);
        assert_eq!(cs.status, ContainerStatus::None);
    }

    #[tokio::test]
    async fn test_get_container_status_command_with_state() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let ws_id = Uuid::new_v4();
        state.container_states.lock().unwrap().insert(
            ws_id,
            ContainerState {
                workspace_id: ws_id,
                status: ContainerStatus::Running,
                container_id: Some("ctr-123".to_string()),
                container_name: Some("fury-test".to_string()),
                log_tail: vec!["started".to_string()],
            },
        );

        let result = get_container_status(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        let cs = result.unwrap();
        assert_eq!(cs.status, ContainerStatus::Running);
        assert_eq!(cs.container_id.as_deref(), Some("ctr-123"));
    }

    #[tokio::test]
    async fn test_get_container_status_command_invalid_id() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = get_container_status(state, "not-a-uuid".to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Additional async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_detect_devcontainer_with_repo() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();

        let repo = test_repo();
        let repo_id = repo.id;
        state_ref.repositories.write().unwrap().insert(repo_id, repo);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_devcontainer(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        // test_repo uses /tmp/test-repo which doesn't have .devcontainer
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_cmd_detect_devcontainer_invalid_id() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_devcontainer(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_detect_devcontainer_repo_not_found() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_devcontainer(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_detect_devcontainer_with_real_dir() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();

        // Create a temp dir with a .devcontainer/devcontainer.json
        let dir = tempfile::tempdir().unwrap();
        let dc_dir = dir.path().join(".devcontainer");
        std::fs::create_dir_all(&dc_dir).unwrap();
        std::fs::write(dc_dir.join("devcontainer.json"), r#"{"image":"node:20"}"#).unwrap();

        let mut repo = test_repo();
        repo.path = dir.path().to_path_buf();
        let repo_id = repo.id;
        state_ref.repositories.write().unwrap().insert(repo_id, repo);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_devcontainer(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.is_some());
        assert!(path.unwrap().contains("devcontainer.json"));
    }

    #[tokio::test]
    async fn test_cmd_update_devcontainer_config_command() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();

        // Insert a workspace and repo via the DB lock
        let (repo, ws) = {
            let db_lock = state_ref.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            crate::test_helpers::insert_test_repo_and_workspace(db)
        };
        let ws_id = ws.id;
        state_ref.repositories.write().unwrap().insert(repo.id, repo);
        state_ref.workspaces.write().unwrap().insert(ws_id, ws);

        let config = DevContainerConfig {
            enabled: true,
            image: Some("rust:latest".to_string()),
            ..Default::default()
        };

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_devcontainer_config(state, ws_id.to_string(), config).await;
        assert!(result.is_ok());

        // Verify in-memory update
        let workspaces = state_ref.workspaces.read().unwrap();
        let ws = workspaces.get(&ws_id).unwrap();
        assert!(ws.devcontainer_config.is_some());
        assert_eq!(
            ws.devcontainer_config.as_ref().unwrap().image.as_deref(),
            Some("rust:latest")
        );
    }

    #[tokio::test]
    async fn test_cmd_update_devcontainer_config_invalid_ws() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let config = DevContainerConfig::default();
        let result = update_devcontainer_config(state, "bad-id".to_string(), config).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_update_devcontainer_config_ws_not_found() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let config = DevContainerConfig::default();
        let result =
            update_devcontainer_config(state, Uuid::new_v4().to_string(), config).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_container_status_after_update() {
        use tauri::Manager;
        let app = crate::test_helpers::mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();
        let ws_id = Uuid::new_v4();

        // Start with no state, then insert some
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result1 = get_container_status(state, ws_id.to_string()).await.unwrap();
        assert_eq!(result1.status, ContainerStatus::None);

        // Insert a Building state
        state_ref.container_states.lock().unwrap().insert(
            ws_id,
            ContainerState {
                workspace_id: ws_id,
                status: ContainerStatus::Building,
                container_id: None,
                container_name: None,
                log_tail: vec!["building...".to_string()],
            },
        );

        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let result2 = get_container_status(state2, ws_id.to_string()).await.unwrap();
        assert_eq!(result2.status, ContainerStatus::Building);
        assert_eq!(result2.log_tail.len(), 1);
    }
}
