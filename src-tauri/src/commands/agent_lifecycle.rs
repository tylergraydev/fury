use std::sync::Arc;

use crate::commands::agent::parse_agent_workspace_id;
use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent};
use crate::models::settings::AgentType;
use crate::services::claude_process;
use crate::state::AppState;
use tauri::{Emitter, State};

#[tauri::command]
#[specta::specta]
pub async fn stop_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id = parse_agent_workspace_id(&workspace_id)?;

    let agent_type = {
        let settings = state.settings.read().unwrap();
        settings.agent_type.clone()
    };

    match agent_type {
        AgentType::ClaudeCode => {
            // Send an Interrupt command to the sidecar for this workspace.
            // The sidecar is shared — we don't kill it, just interrupt this query.
            {
                let mut agents_lock = state.agents.lock().unwrap();
                if let Some(agent) = agents_lock.get_mut(&id) {
                    agent.status = AgentStatus::Stopping;
                }
            }

            let cmd = claude_process::SidecarCommand::Interrupt {
                id: id.to_string(),
            };

            // Hold the tokio Mutex across the async send to avoid the take/replace race
            {
                let mut guard = state.agent_sidecar.lock().await;
                if let Some(handle) = guard.as_mut() {
                    let _ = claude_process::send_command(handle, &cmd).await;
                }
            }

            // Set status to Idle
            {
                let mut agents_lock = state.agents.lock().unwrap();
                if let Some(agent) = agents_lock.get_mut(&id) {
                    agent.status = AgentStatus::Idle;
                    agent.pid = None;
                }
            }

            // Clear any pending permission request so it isn't re-emitted after HMR
            state
                .pending_permissions
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);

            let _ = app.emit(
                &format!("agent-status:{}", id),
                &AgentStatusEvent {
                    workspace_id: id,
                    status: AgentStatus::Idle,
                },
            );

            Ok(())
        }
        AgentType::CodexCli => {
            // Codex: kill process group approach (existing behavior)
            let agents = Arc::clone(&state.agents);
            let agent_processes = Arc::clone(&state.agent_processes);
            let persistent_agents = Arc::clone(&state.persistent_agents);
            let agent_stdins = Arc::clone(&state.agent_stdins);

            tokio::task::spawn_blocking(move || {
                // Set status to Stopping and get PID for kill
                let pid = {
                    let mut agents_lock = agents.lock().unwrap();
                    if let Some(agent) = agents_lock.get_mut(&id) {
                        agent.status = AgentStatus::Stopping;
                        agent.pid
                    } else {
                        None
                    }
                };

                if let Some(pid) = pid {
                    let _ = crate::platform::kill_process_group(pid);
                }

                {
                    let mut processes = agent_processes.lock().unwrap();
                    if let Some(child) = processes.remove(&id) {
                        if let Some(pid) = child.id() {
                            let _ = crate::platform::kill_process_group(pid);
                        }
                    }
                }

                persistent_agents.lock().unwrap().remove(&id);
                agent_stdins.lock().unwrap().remove(&id);

                {
                    let mut agents_lock = agents.lock().unwrap();
                    if let Some(agent) = agents_lock.get_mut(&id) {
                        agent.status = AgentStatus::Idle;
                        agent.pid = None;
                    }
                }

                let _ = app.emit(
                    &format!("agent-status:{}", id),
                    &AgentStatusEvent {
                        workspace_id: id,
                        status: AgentStatus::Idle,
                    },
                );

                Ok(())
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_agent_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<AgentInfo, AppError> {
    let id = parse_agent_workspace_id(&workspace_id)?;

    let agents_lock = state.agents.lock().unwrap_or_else(|e| e.into_inner());
    Ok(agents_lock
        .get(&id)
        .cloned()
        .unwrap_or_else(|| AgentInfo::new(id)))
}

#[tauri::command]
#[specta::specta]
pub async fn clear_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id = parse_agent_workspace_id(&workspace_id)?;

    let agent_type = {
        let settings = state.settings.read().unwrap();
        settings.agent_type.clone()
    };

    match agent_type {
        AgentType::ClaudeCode => {
            // For Claude Code (sidecar), just clear the session_id.
            // The sidecar stays alive — no process to kill.
            let mut agents_lock = state.agents.lock().unwrap();
            if let Some(agent) = agents_lock.get_mut(&id) {
                agent.session_id = None;
            }
            Ok(())
        }
        AgentType::CodexCli => {
            // Codex: kill any persistent process (existing behavior)
            let agents = Arc::clone(&state.agents);
            let persistent_agents = Arc::clone(&state.persistent_agents);
            let agent_stdins = Arc::clone(&state.agent_stdins);
            let agent_processes = Arc::clone(&state.agent_processes);

            tokio::task::spawn_blocking(move || {
                let mut agents_lock = agents.lock().unwrap();
                if let Some(agent) = agents_lock.get_mut(&id) {
                    agent.session_id = None;
                }
                drop(agents_lock);

                persistent_agents.lock().unwrap().remove(&id);
                agent_stdins.lock().unwrap().remove(&id);
                {
                    let mut processes = agent_processes.lock().unwrap();
                    if let Some(child) = processes.remove(&id) {
                        if let Some(pid) = child.id() {
                            let _ = crate::platform::kill_process_group(pid);
                        }
                    }
                }

                Ok(())
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::mock_app_with_state;
    use tauri::Manager;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_cmd_get_agent_status_unknown_workspace() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let ws_id = Uuid::new_v4();
        let result = get_agent_status(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.status, AgentStatus::Idle);
        assert_eq!(info.workspace_id, ws_id);
    }

    #[tokio::test]
    async fn test_cmd_get_agent_status_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_agent_status(state, "not-a-uuid".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_clear_session() {
        let app = mock_app_with_state();
        let ws_id = Uuid::new_v4();

        // Set up an agent with a session_id
        {
            let app_state = app.state::<crate::state::AppState>();
            let mut agents = app_state.agents.lock().unwrap();
            let mut agent = AgentInfo::new(ws_id);
            agent.session_id = Some("sess-abc".to_string());
            agents.insert(ws_id, agent);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = clear_session(state, ws_id.to_string()).await;
        assert!(result.is_ok());

        // Verify session cleared
        let app_state = app.state::<crate::state::AppState>();
        let agents = app_state.agents.lock().unwrap();
        assert!(agents.get(&ws_id).unwrap().session_id.is_none());
    }

    #[tokio::test]
    async fn test_cmd_clear_session_nonexistent() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        // Clearing session for a workspace with no agent should succeed
        let result = clear_session(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    // Note: stop_agent() cannot be tested directly because it takes
    // tauri::AppHandle (concrete Wry runtime) which is incompatible with
    // MockRuntime from test helpers. The stop_agent logic is covered by
    // integration tests (e2e/integration/tests/agent-stream.spec.ts).
    // The state transition logic (Running → Stopping → Idle) is tested
    // in commands/agent.rs via the extracted pure functions.

    #[test]
    fn test_parse_agent_workspace_id_valid() {
        let id = Uuid::new_v4();
        let result = parse_agent_workspace_id(&id.to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), id);
    }

    #[test]
    fn test_parse_agent_workspace_id_invalid() {
        let result = parse_agent_workspace_id("not-a-uuid");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_agent_status_running() {
        let app = mock_app_with_state();
        let ws_id = Uuid::new_v4();

        // Set up a Running agent
        {
            let app_state = app.state::<crate::state::AppState>();
            let mut agents = app_state.agents.lock().unwrap();
            let mut agent = AgentInfo::new(ws_id);
            agent.status = AgentStatus::Running;
            agent.session_id = Some("sess-123".to_string());
            agents.insert(ws_id, agent);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_agent_status(state, ws_id.to_string()).await.unwrap();
        assert_eq!(result.status, AgentStatus::Running);
        assert_eq!(result.session_id, Some("sess-123".to_string()));
    }

    #[tokio::test]
    async fn test_cmd_clear_session_with_running_agent() {
        let app = mock_app_with_state();
        let ws_id = Uuid::new_v4();

        {
            let app_state = app.state::<crate::state::AppState>();
            let mut agents = app_state.agents.lock().unwrap();
            let mut agent = AgentInfo::new(ws_id);
            agent.status = AgentStatus::Running;
            agent.session_id = Some("sess-to-clear".to_string());
            agents.insert(ws_id, agent);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        clear_session(state, ws_id.to_string()).await.unwrap();

        let app_state = app.state::<crate::state::AppState>();
        let agents = app_state.agents.lock().unwrap();
        let agent = agents.get(&ws_id).unwrap();
        assert!(agent.session_id.is_none());
        // Status should remain Running (clear_session only clears session_id)
        assert_eq!(agent.status, AgentStatus::Running);
    }
}
