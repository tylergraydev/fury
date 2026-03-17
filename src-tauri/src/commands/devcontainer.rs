use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::devcontainer::{ContainerState, ContainerStatus, DevContainerConfig};
use crate::services::devcontainer as dc_svc;
use crate::state::AppState;

#[tauri::command]
pub async fn start_container(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ContainerState, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (config, workspace_folder, _repo_name) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let config = ws
            .devcontainer_config
            .clone()
            .ok_or_else(|| AppError::ContainerError("No dev container config".to_string()))?;
        let repos = state.repositories.read().unwrap();
        let repo_name = repos
            .get(&ws.repo_id)
            .map(|r| r.name.clone())
            .unwrap_or_else(|| "workspace".to_string());
        (config, ws.worktree_path.clone(), repo_name)
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
            let container_state = ContainerState {
                workspace_id: ws_id,
                status: ContainerStatus::Running,
                container_id: Some(container_id.clone()),
                container_name: Some(format!("fury-{}", ws_id)),
                log_tail: Vec::new(),
            };
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
            let container_state = ContainerState {
                workspace_id: ws_id,
                status: ContainerStatus::Error(error_msg.clone()),
                container_id: None,
                container_name: None,
                log_tail: Vec::new(),
            };
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
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let container_id = {
        let states = state.container_states.lock().unwrap();
        let cs = states
            .get(&ws_id)
            .ok_or_else(|| AppError::ContainerError("No container state".to_string()))?;
        cs.container_id
            .clone()
            .ok_or_else(|| AppError::ContainerError("No container ID".to_string()))?
    };

    let (config, workspace_folder) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let config = ws.devcontainer_config.clone().unwrap_or_default();
        (config, ws.worktree_path.clone())
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
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

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
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let states = state.container_states.lock().unwrap();
    Ok(states
        .get(&ws_id)
        .cloned()
        .unwrap_or_else(|| ContainerState::new(ws_id)))
}

#[tauri::command]
pub async fn update_devcontainer_config(
    state: State<'_, AppState>,
    workspace_id: String,
    config: DevContainerConfig,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Update in-memory state
    {
        let mut workspaces = state.workspaces.write().unwrap();
        let ws = workspaces
            .get_mut(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.devcontainer_config = Some(config.clone());
    }

    // Persist to DB
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_devcontainer_config(&ws_id, Some(&config))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn detect_devcontainer(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Option<String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        repos
            .get(&id)
            .ok_or(AppError::RepoNotFound(id))?
            .path
            .clone()
    };

    Ok(dc_svc::detect_devcontainer_json(&repo_path))
}
