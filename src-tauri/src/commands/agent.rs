use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, SendMessageRequest};
use crate::models::settings::AgentType;
use crate::services::claude_process;
use crate::services::codex_process;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

/// Resolve context_id from the request: either workspace_id or repo_id.
pub(crate) fn resolve_context_id(request: &SendMessageRequest) -> Result<Uuid, AppError> {
    request
        .workspace_id
        .or(request.repo_id)
        .ok_or_else(|| {
            AppError::AgentError(
                "Either workspaceId or repoId must be provided".to_string(),
            )
        })
}

/// Determine the new AgentStatus from a process exit status.
/// Exit code 143 = SIGTERM (128+15), expected for user-initiated stops.
pub(crate) fn status_from_exit(exit_code: Option<i32>, success: bool) -> AgentStatus {
    if success {
        AgentStatus::Idle
    } else {
        match exit_code {
            Some(143) => AgentStatus::Idle,
            Some(code) => AgentStatus::Error(format!(
                "Process exited with code: {}",
                code
            )),
            None => AgentStatus::Error(
                "Process exited with code: unknown".to_string(),
            ),
        }
    }
}

/// Determine whether to emit a status update based on current vs new status.
/// Suppresses Error status if agent is already Idle (stop_agent already reset it).
/// Returns (should_emit, new_status_to_set).
pub(crate) fn should_emit_status(
    current_status: &AgentStatus,
    new_status: &AgentStatus,
) -> bool {
    // If stop_agent already set Idle, don't overwrite with an Error
    let suppressed = *current_status == AgentStatus::Idle
        && matches!(new_status, AgentStatus::Error(_));
    !suppressed
}

/// Check if an agent is alive and running. Returns true if agent
/// status is Running and the PID is still alive. For sidecar-based agents
/// (no PID), Running status alone is sufficient since the sidecar manages
/// process lifecycle.
pub(crate) fn is_agent_alive(agent: &AgentInfo) -> bool {
    if agent.status != AgentStatus::Running {
        return false;
    }
    match agent.pid {
        Some(pid) => crate::platform::is_process_alive(pid),
        None => true, // Sidecar-based agent: no PID, trust the status
    }
}

/// Convert a boolean approval flag to the permission response string.
#[cfg(test)]
pub(crate) fn permission_response_str(approved: bool) -> &'static str {
    if approved { "yes" } else { "no" }
}

/// Determine whether a cold error should clear the agent session_id.
/// A "cold error" is when the process exits with an error before producing
/// any content, suggesting the session may be stale/corrupt.
#[cfg(test)]
pub(crate) fn should_clear_session_on_cold_error(
    had_content: bool,
    exit_success: bool,
    exit_code: Option<i32>,
) -> bool {
    let is_cold_error = !had_content;
    let exited_with_error = !exit_success && exit_code != Some(143);
    is_cold_error && exited_with_error
}

/// Validate that a working directory path exists.
pub(crate) fn validate_working_dir(working_dir: &std::path::Path) -> Result<(), AppError> {
    if !working_dir.exists() {
        return Err(AppError::AgentError(format!(
            "Working directory does not exist: {}",
            working_dir.display()
        )));
    }
    Ok(())
}

/// Check if persistent process toggle settings match, determining if we can reuse it.
#[cfg(test)]
pub(crate) fn can_reuse_persistent_process(
    handle_disable_thinking: bool,
    handle_disable_plan_mode: bool,
    request_disable_thinking: bool,
    request_disable_plan_mode: bool,
) -> bool {
    handle_disable_thinking == request_disable_thinking
        && handle_disable_plan_mode == request_disable_plan_mode
}

/// Collect sibling workspace names for agent teams env var.
/// Returns names of workspaces sharing the same repo but excluding the current workspace.
pub(crate) fn collect_sibling_workspace_names(
    workspaces: &HashMap<Uuid, crate::models::workspace::Workspace>,
    current_ws_id: Uuid,
    repo_id: Uuid,
) -> Vec<String> {
    workspaces
        .values()
        .filter(|ws| ws.repo_id == repo_id && ws.id != current_ws_id)
        .map(|ws| ws.name.clone())
        .collect()
}

/// Determine whether container execution context should be used for an agent.
/// Returns Some(ContainerExecContext) if the workspace has container mode enabled
/// with AgentExecMode::Container and a running container.
pub(crate) fn resolve_container_exec_context(
    workspace: &crate::models::workspace::Workspace,
    repo_name: &str,
    container_id: Option<String>,
) -> Option<crate::models::devcontainer::ContainerExecContext> {
    let config = workspace.devcontainer_config.as_ref()?;
    if !config.enabled
        || config.agent_exec_mode != crate::models::devcontainer::AgentExecMode::Container
    {
        return None;
    }
    let container_working_dir =
        crate::services::devcontainer::resolve_container_workspace_path(config, repo_name);
    let cid = container_id?;
    Some(crate::models::devcontainer::ContainerExecContext {
        container_id: cid,
        container_working_dir,
    })
}

/// Extract thinking and plan_mode flags from a request, defaulting to false.
pub(crate) fn extract_toggle_flags(request: &SendMessageRequest) -> (bool, bool) {
    (
        request.disable_thinking.unwrap_or(false),
        request.disable_plan_mode.unwrap_or(false),
    )
}

/// Parse a workspace_id string into a Uuid, returning WorkspaceNotFound on failure.
pub(crate) fn parse_agent_workspace_id(workspace_id: &str) -> Result<Uuid, AppError> {
    workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))
}

/// Get or create an AgentInfo entry, set it to Running, and return the session_id.
pub(crate) fn activate_agent(
    agents: &mut HashMap<Uuid, AgentInfo>,
    context_id: Uuid,
) -> Option<String> {
    let agent = agents
        .entry(context_id)
        .or_insert_with(|| AgentInfo::new(context_id));
    agent.status = AgentStatus::Running;
    agent.started_at = Some(chrono::Utc::now());
    agent.session_id.clone()
}

/// Determine whether a running agent should block a new message.
/// Returns true if the agent is Running AND its process is still alive.
/// A stale "Running" status (process dead) should not block.
pub(crate) fn should_block_new_message(agent: &AgentInfo) -> bool {
    agent.status == AgentStatus::Running && is_agent_alive(agent)
}

/// Normalize optional JSON values: treat JSON null as None.
/// Tauri deserializes JS `null` as `Some(Value::Null)` rather than `None`.
pub(crate) fn normalize_null_value(val: Option<serde_json::Value>) -> Option<serde_json::Value> {
    val.filter(|v| !v.is_null())
}

/// Normalize optional string values: treat empty strings as None.
pub(crate) fn normalize_empty_string(val: Option<String>) -> Option<String> {
    val.filter(|v| !v.is_empty())
}

/// Check if the agent type supports permission responses.
pub(crate) fn supports_permission_response(agent_type: &AgentType) -> bool {
    *agent_type != AgentType::CodexCli
}

/// Reset agent status to Idle after a failed spawn/write.
fn reset_agent_on_error(
    agents: &Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    app: &tauri::AppHandle,
    context_id: Uuid,
) {
    {
        let mut lock = agents.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(agent) = lock.get_mut(&context_id) {
            agent.status = AgentStatus::Idle;
            agent.pid = None;
        }
    }
    let _ = app.emit(
        &format!("agent-status:{}", context_id),
        &AgentStatusEvent {
            workspace_id: context_id,
            status: AgentStatus::Idle,
        },
    );
}

#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: SendMessageRequest,
) -> Result<(), AppError> {
    // Determine context_id (either workspace_id or repo_id)
    let context_id = resolve_context_id(&request)?;

    // Check if agent is already running
    {
        let mut agents = state.agents.lock().unwrap();
        if let Some(agent) = agents.get_mut(&context_id) {
            if agent.status == AgentStatus::Running {
                if should_block_new_message(agent) {
                    return Err(AppError::AgentError(
                        "Agent is already processing a message".to_string(),
                    ));
                }
                // Process is dead — reset stale status so we can proceed
                agent.status = AgentStatus::Idle;
                agent.pid = None;
                // Clean up orphaned handles
                drop(agents);
                state.agent_processes.lock().unwrap().remove(&context_id);
                state.agent_stdins.lock().unwrap().remove(&context_id);
                state.persistent_agents.lock().unwrap().remove(&context_id);
                let _ = app.emit(
                    &format!("agent-status:{}", context_id),
                    &AgentStatusEvent {
                        workspace_id: context_id,
                        status: AgentStatus::Idle,
                    },
                );
            }
        }
    }

    // Read agent type from settings
    let agent_type = {
        let settings = state.settings.read().unwrap();
        settings.agent_type.clone()
    };

    // Resolve working directory and env vars based on context type and agent type
    let (working_dir, env_vars) = if let Some(workspace_id) = request.workspace_id {
        // Workspace mode: use worktree path
        let (workspace, repo) = {
            let workspaces = state.workspaces.read().unwrap();
            let ws = workspaces
                .get(&workspace_id)
                .ok_or(AppError::WorkspaceNotFound(workspace_id))?
                .clone();
            let repos = state.repositories.read().unwrap();
            let repo = repos
                .get(&ws.repo_id)
                .ok_or(AppError::RepoNotFound(ws.repo_id))?
                .clone();
            (ws, repo)
        };
        let settings = state.settings.read().unwrap().clone();
        let repo_settings = crate::commands::script::resolve_settings(&state, &repo.id).ok();
        let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
        let mut env = match agent_type {
            AgentType::ClaudeCode => claude_process::build_env_vars(&workspace, &repo, &settings, provider_override),
            AgentType::CodexCli => codex_process::build_env_vars(&workspace, &repo, &settings, provider_override),
        };

        // Agent teams: add sibling workspace names (env var is harmless for Codex,
    // though FURY_AGENT_TEAMS is only set by Claude's build_env_vars)
        if settings.experimental.agent_teams {
            let workspaces = state.workspaces.read().unwrap();
            let siblings = collect_sibling_workspace_names(&workspaces, workspace.id, workspace.repo_id);
            if !siblings.is_empty() {
                env.insert(
                    "FURY_TEAM_WORKSPACES".to_string(),
                    siblings.join(","),
                );
            }
        }

        (workspace.worktree_path.clone(), env)
    } else {
        // Repo mode: use repo path directly
        let repo_id = request.repo_id.unwrap();
        let repo = {
            let repos = state.repositories.read().unwrap();
            repos
                .get(&repo_id)
                .ok_or(AppError::RepoNotFound(repo_id))?
                .clone()
        };
        let settings = state.settings.read().unwrap().clone();
        let repo_settings = crate::commands::script::resolve_settings(&state, &repo_id).ok();
        let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
        let env = match agent_type {
            AgentType::ClaudeCode => claude_process::build_repo_env_vars(&repo, &settings, provider_override),
            AgentType::CodexCli => codex_process::build_repo_env_vars(&repo, &settings, provider_override),
        };
        (repo.path.clone(), env)
    };

    // Get or create agent info, extract session_id
    let session_id = {
        let mut agents = state.agents.lock().unwrap();
        activate_agent(&mut agents, context_id)
    };

    // Create checkpoint before sending message (workspace mode only)
    if request.workspace_id.is_some() {
        let session_id_str = session_id.clone().unwrap_or_default();
        let turn_index = {
            let db = state.db.lock().unwrap();
            db.as_ref()
                .map(|db| db.get_next_turn_index(&context_id).unwrap_or(0))
                .unwrap_or(0)
        };

        match crate::services::checkpoint::create_checkpoint(
            &working_dir,
            context_id,
            &session_id_str,
            turn_index,
            &request.message,
        ) {
            Ok(checkpoint) => {
                let db = state.db.lock().unwrap();
                if let Some(db) = db.as_ref() {
                    let _ = db.insert_checkpoint(&checkpoint);
                }
                let _ = app.emit(
                    &format!("checkpoint-created:{}", context_id),
                    &checkpoint,
                );
            }
            Err(e) => {
                eprintln!("[checkpoint] Failed to create checkpoint: {}", e);
            }
        }
    }

    // Emit status change
    let _ = app.emit(
        &format!("agent-status:{}", context_id),
        &AgentStatusEvent {
            workspace_id: context_id,
            status: AgentStatus::Running,
        },
    );

    // Resolve linked workspace directories (for --add-dir)
    // Get link IDs from db first, then drop the db lock before acquiring workspaces lock
    // to respect lock ordering (workspaces before db)
    let linked_dirs = if request.workspace_id.is_some() {
        let link_ids = {
            let db = state.db.lock().unwrap();
            if let Some(db) = db.as_ref() {
                db.get_workspace_links(&context_id).unwrap_or_default()
            } else {
                vec![]
            }
        };
        // Now get workspace data (db lock is dropped)
        if !link_ids.is_empty() {
            let workspaces = state.workspaces.read().unwrap();
            link_ids
                .iter()
                .filter_map(|id| workspaces.get(id))
                .map(|ws| ws.worktree_path.clone())
                .collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    // Get system prompt additions
    let system_prompt = {
        let settings = state.settings.read().unwrap();
        settings.system_prompt_additions.clone()
    };

    let (disable_thinking, _disable_plan_mode) = extract_toggle_flags(&request);

    // Validate working directory exists before spawning
    if let Err(e) = validate_working_dir(&working_dir) {
        reset_agent_on_error(&state.agents, &app, context_id);
        return Err(e);
    }

    // Filter out non-existent linked directories to prevent CLI failures
    let linked_dirs: Vec<PathBuf> = linked_dirs
        .into_iter()
        .filter(|d| d.exists())
        .collect();

    // Resolve container execution context if workspace has container mode enabled
    let container_ctx = if let Some(workspace_id) = request.workspace_id {
        let workspaces = state.workspaces.read().unwrap();
        if let Some(ws) = workspaces.get(&workspace_id) {
            let repos = state.repositories.read().unwrap();
            let repo_name = repos
                .get(&ws.repo_id)
                .map(|r| r.name.clone())
                .unwrap_or_else(|| "workspace".to_string());
            let container_id = {
                let states = state.container_states.lock().unwrap();
                states
                    .get(&workspace_id)
                    .and_then(|cs| cs.container_id.clone())
            };
            resolve_container_exec_context(ws, &repo_name, container_id)
        } else {
            None
        }
    } else {
        None
    };

    match agent_type {
    AgentType::ClaudeCode => {
        // Sidecar mode: ensure the singleton sidecar is running, then send a Query command.
        // The sidecar's background reader handles streaming events back to the frontend.
        {
            let mut sidecar_guard = state.agent_sidecar.lock().unwrap();
            if sidecar_guard.is_none() {
                *sidecar_guard = Some(
                    claude_process::start_sidecar(&app, Arc::clone(&state.agents))
                        .inspect_err(|_| {
                            reset_agent_on_error(&state.agents, &app, context_id);
                        })?
                );
            }
        }

        let permission_mode = "default";

        let cmd = claude_process::SidecarCommand::Query {
            id: context_id.to_string(),
            prompt: request.message.clone(),
            cwd: working_dir.to_string_lossy().to_string(),
            session_id: session_id.clone(),
            model: request.model.clone(),
            system_prompt: system_prompt.clone(),
            permission_mode: permission_mode.to_string(),
            env_vars: Some(env_vars),
            additional_dirs: Some(linked_dirs.iter().map(|d| d.to_string_lossy().to_string()).collect()),
            disable_thinking: Some(disable_thinking),
        };

        // Take the handle out of the Mutex, send the command (async), then put it back.
        // This avoids holding a std::sync::Mutex across an .await point.
        let mut handle = {
            let mut guard = state.agent_sidecar.lock().unwrap();
            guard.take().ok_or_else(|| {
                reset_agent_on_error(&state.agents, &app, context_id);
                AppError::AgentError("Sidecar not running".to_string())
            })?
        };

        let result = claude_process::send_command(&mut handle, &cmd).await;

        // Always put handle back
        state.agent_sidecar.lock().unwrap().replace(handle);

        result.inspect_err(|_| {
            reset_agent_on_error(&state.agents, &app, context_id);
        })?;
    } // end AgentType::ClaudeCode

    AgentType::CodexCli => {
        // Codex: one-shot mode only via `codex exec --json --full-auto`
        // (Codex CLI does not support interactive approval or persistent sessions)
        let (child, stdin) = match codex_process::spawn_and_stream(
            context_id,
            &request.message,
            &working_dir,
            env_vars,
            request.model.as_deref(),
            app.clone(),
            Arc::clone(&state.agents),
            container_ctx,
        )
        .await
        {
            Ok(result) => result,
            Err(e) => {
                reset_agent_on_error(&state.agents, &app, context_id);
                return Err(e);
            }
        };

        // Store stdin handle
        state
            .agent_stdins
            .lock()
            .unwrap()
            .insert(context_id, stdin);

        // Store PID in agent info for stop_agent
        if let Some(pid) = child.id() {
            let mut agents = state.agents.lock().unwrap();
            if let Some(agent) = agents.get_mut(&context_id) {
                agent.pid = Some(pid);
            }
        }

        // Store child process handle
        {
            let mut processes = state.agent_processes.lock().unwrap();
            processes.insert(context_id, child);
        }

        // Background task: wait for process exit
        let agents_ref = Arc::clone(&state.agents);
        let processes_ref = Arc::clone(&state.agent_processes);
        let stdins_ref = Arc::clone(&state.agent_stdins);
        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut child = {
                let mut processes =
                    processes_ref.lock().unwrap_or_else(|e| e.into_inner());
                processes.remove(&context_id)
            };

            let exit_status = if let Some(ref mut c) = child {
                c.wait().await.ok()
            } else {
                None
            };

            stdins_ref
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&context_id);

            let new_status = match exit_status {
                Some(ref status) => status_from_exit(status.code(), status.success()),
                None => AgentStatus::Idle,
            };

            let should_emit = {
                let mut agents =
                    agents_ref.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(agent) = agents.get_mut(&context_id) {
                    let emit = should_emit_status(&agent.status, &new_status);
                    if emit {
                        agent.status = new_status.clone();
                    }
                    agent.pid = None;
                    emit
                } else {
                    false
                }
            };

            if should_emit {
                let _ = app_clone.emit(
                    &format!("agent-status:{}", context_id),
                    &AgentStatusEvent {
                        workspace_id: context_id,
                        status: new_status,
                    },
                );
            }
        });
    }
    } // end match agent_type

    Ok(())
}

#[tauri::command]
pub async fn respond_to_permission(
    state: State<'_, AppState>,
    workspace_id: String,
    approved: bool,
    updated_permissions: Option<serde_json::Value>,
    decision_classification: Option<String>,
) -> Result<(), AppError> {
    let id = parse_agent_workspace_id(&workspace_id)?;

    let agent_type = {
        let settings = state.settings.read().unwrap();
        settings.agent_type.clone()
    };
    if !supports_permission_response(&agent_type) {
        return Err(AppError::AgentError(
            "Permission responses are not supported with Codex CLI".to_string(),
        ));
    }

    // Normalize null values to None so they are omitted from the sidecar JSON.
    let updated_permissions = normalize_null_value(updated_permissions);
    let decision_classification = normalize_empty_string(decision_classification);

    // Send a PermissionResponse command to the sidecar
    let cmd = claude_process::SidecarCommand::PermissionResponse {
        id: id.to_string(),
        approved,
        updated_permissions,
        decision_classification,
    };

    let mut handle = {
        let mut guard = state.agent_sidecar.lock().unwrap();
        guard.take().ok_or_else(|| {
            AppError::AgentError("Sidecar not running".to_string())
        })?
    };

    // Clear the tracked pending permission now that the user has responded
    state
        .pending_permissions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id);

    let result = claude_process::send_command(&mut handle, &cmd).await;
    state.agent_sidecar.lock().unwrap().replace(handle);
    result
}

/// Return any pending permission request for a workspace.
/// Called by the frontend on resubscribe (e.g. after HMR) to recover lost UI state.
#[tauri::command]
pub fn get_pending_permission(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<crate::models::agent::FrontendStreamEvent>, AppError> {
    let id = parse_agent_workspace_id(&workspace_id)?;
    let lock = state
        .pending_permissions
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    Ok(lock.get(&id).cloned())
}

#[tauri::command]
pub async fn send_followup_message(
    state: State<'_, AppState>,
    workspace_id: String,
    message: String,
) -> Result<(), AppError> {
    let id = parse_agent_workspace_id(&workspace_id)?;

    let agent_type = {
        let settings = state.settings.read().unwrap();
        settings.agent_type.clone()
    };

    // For Codex CLI, keep the existing stdin-based approach
    if agent_type == AgentType::CodexCli {
        let stdin_handle = state.agent_stdins.lock().unwrap().remove(&id);
        if let Some(mut stdin) = stdin_handle {
            let write_result = claude_process::write_message(&mut stdin, &message).await;
            state.agent_stdins.lock().unwrap().insert(id, stdin);
            write_result?;
            return Ok(());
        }
        return Err(AppError::AgentError(
            "No stdin handle found for this agent".to_string(),
        ));
    }

    // For Claude Code (SDK), a followup message goes through the sidecar.
    // Retrieve the session_id to resume the conversation.
    let session_id = {
        let agents = state.agents.lock().unwrap();
        agents.get(&id).and_then(|a| a.session_id.clone())
    };

    // Look up the workspace's working directory for the query
    let cwd = {
        let workspaces = state.workspaces.read().unwrap();
        workspaces
            .get(&id)
            .map(|ws| ws.worktree_path.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    let cmd = claude_process::SidecarCommand::Query {
        id: id.to_string(),
        prompt: message,
        cwd,
        session_id,
        model: None,
        system_prompt: None,
        permission_mode: "default".to_string(),
        env_vars: None,
        additional_dirs: None,
        disable_thinking: None,
    };

    let mut handle = {
        let mut guard = state.agent_sidecar.lock().unwrap();
        guard.take().ok_or_else(|| {
            AppError::AgentError("Sidecar not running".to_string())
        })?
    };

    let result = claude_process::send_command(&mut handle, &cmd).await;
    state.agent_sidecar.lock().unwrap().replace(handle);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_context_id_workspace() {
        let req = SendMessageRequest {
            workspace_id: Some(Uuid::new_v4()),
            repo_id: None,
            message: "hi".to_string(),
            model: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        let id = resolve_context_id(&req).unwrap();
        assert_eq!(id, req.workspace_id.unwrap());
    }

    #[test]
    fn test_resolve_context_id_repo() {
        let repo_id = Uuid::new_v4();
        let req = SendMessageRequest {
            workspace_id: None,
            repo_id: Some(repo_id),
            message: "hi".to_string(),
            model: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        let id = resolve_context_id(&req).unwrap();
        assert_eq!(id, repo_id);
    }

    #[test]
    fn test_resolve_context_id_workspace_takes_precedence() {
        let ws_id = Uuid::new_v4();
        let req = SendMessageRequest {
            workspace_id: Some(ws_id),
            repo_id: Some(Uuid::new_v4()),
            message: "hi".to_string(),
            model: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        let id = resolve_context_id(&req).unwrap();
        assert_eq!(id, ws_id);
    }

    #[test]
    fn test_resolve_context_id_neither() {
        let req = SendMessageRequest {
            workspace_id: None,
            repo_id: None,
            message: "hi".to_string(),
            model: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        assert!(resolve_context_id(&req).is_err());
    }

    #[test]
    fn test_status_from_exit_success() {
        assert_eq!(status_from_exit(Some(0), true), AgentStatus::Idle);
    }

    #[test]
    fn test_status_from_exit_sigterm() {
        assert_eq!(status_from_exit(Some(143), false), AgentStatus::Idle);
    }

    #[test]
    fn test_status_from_exit_error_code() {
        let status = status_from_exit(Some(1), false);
        assert!(matches!(status, AgentStatus::Error(_)));
        if let AgentStatus::Error(msg) = status {
            assert!(msg.contains("1"));
        }
    }

    #[test]
    fn test_status_from_exit_unknown_code() {
        let status = status_from_exit(None, false);
        assert!(matches!(status, AgentStatus::Error(_)));
        if let AgentStatus::Error(msg) = status {
            assert!(msg.contains("unknown"));
        }
    }

    #[test]
    fn test_should_emit_status_normal_transition() {
        assert!(should_emit_status(&AgentStatus::Running, &AgentStatus::Idle));
    }

    #[test]
    fn test_should_emit_status_suppresses_error_when_idle() {
        // When stop_agent already set Idle, suppress Error
        assert!(!should_emit_status(
            &AgentStatus::Idle,
            &AgentStatus::Error("crash".to_string())
        ));
    }

    #[test]
    fn test_should_emit_status_running_to_error() {
        assert!(should_emit_status(
            &AgentStatus::Running,
            &AgentStatus::Error("crash".to_string())
        ));
    }

    #[test]
    fn test_should_emit_status_idle_to_idle() {
        assert!(should_emit_status(&AgentStatus::Idle, &AgentStatus::Idle));
    }

    #[test]
    fn test_activate_agent_new() {
        let mut agents = HashMap::new();
        let id = Uuid::new_v4();

        let session = activate_agent(&mut agents, id);
        assert!(session.is_none()); // new agent has no session
        assert_eq!(agents.get(&id).unwrap().status, AgentStatus::Running);
        assert!(agents.get(&id).unwrap().started_at.is_some());
    }

    #[test]
    fn test_activate_agent_existing_with_session() {
        let mut agents = HashMap::new();
        let id = Uuid::new_v4();
        let mut agent = AgentInfo::new(id);
        agent.session_id = Some("sess-123".to_string());
        agent.status = AgentStatus::Idle;
        agents.insert(id, agent);

        let session = activate_agent(&mut agents, id);
        assert_eq!(session, Some("sess-123".to_string()));
        assert_eq!(agents.get(&id).unwrap().status, AgentStatus::Running);
    }

    #[test]
    fn test_is_agent_alive_idle() {
        let agent = AgentInfo::new(Uuid::new_v4());
        assert!(!is_agent_alive(&agent));
    }

    #[test]
    fn test_is_agent_alive_running_no_pid() {
        // Running with no PID = sidecar-based agent, considered alive
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Running;
        assert!(is_agent_alive(&agent));
    }

    #[test]
    fn test_is_agent_alive_running_dead_pid() {
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Running;
        // Use PID 999999999 which almost certainly doesn't exist
        agent.pid = Some(999_999_999);
        assert!(!is_agent_alive(&agent));
    }

    // --- permission_response_str tests ---

    #[test]
    fn test_permission_response_str_approved() {
        assert_eq!(permission_response_str(true), "yes");
    }

    #[test]
    fn test_permission_response_str_denied() {
        assert_eq!(permission_response_str(false), "no");
    }

    // --- should_clear_session_on_cold_error tests ---

    #[test]
    fn test_cold_error_no_content_error_exit() {
        // No content + error exit = should clear
        assert!(should_clear_session_on_cold_error(false, false, Some(1)));
    }

    #[test]
    fn test_cold_error_no_content_sigterm() {
        // No content + SIGTERM (143) = should NOT clear (user-initiated stop)
        assert!(!should_clear_session_on_cold_error(false, false, Some(143)));
    }

    #[test]
    fn test_cold_error_no_content_success() {
        // No content + success = should NOT clear
        assert!(!should_clear_session_on_cold_error(false, true, Some(0)));
    }

    #[test]
    fn test_cold_error_had_content_error() {
        // Had content + error = should NOT clear (content was produced)
        assert!(!should_clear_session_on_cold_error(true, false, Some(1)));
    }

    #[test]
    fn test_cold_error_no_content_unknown_code() {
        // No content + error + unknown code = should clear
        assert!(should_clear_session_on_cold_error(false, false, None));
    }

    #[test]
    fn test_cold_error_had_content_success() {
        // Normal successful case = should NOT clear
        assert!(!should_clear_session_on_cold_error(true, true, Some(0)));
    }

    // --- validate_working_dir tests ---

    #[test]
    fn test_validate_working_dir_exists() {
        let dir = tempfile::tempdir().unwrap();
        assert!(validate_working_dir(dir.path()).is_ok());
    }

    #[test]
    fn test_validate_working_dir_not_exists() {
        let result = validate_working_dir(std::path::Path::new("/nonexistent/path/xyz123"));
        assert!(result.is_err());
        let err_msg = format!("{:?}", result.unwrap_err());
        assert!(err_msg.contains("Working directory does not exist"));
    }

    // --- can_reuse_persistent_process tests ---

    #[test]
    fn test_can_reuse_matching_settings() {
        assert!(can_reuse_persistent_process(false, false, false, false));
        assert!(can_reuse_persistent_process(true, true, true, true));
        assert!(can_reuse_persistent_process(true, false, true, false));
    }

    #[test]
    fn test_cannot_reuse_mismatched_thinking() {
        assert!(!can_reuse_persistent_process(true, false, false, false));
        assert!(!can_reuse_persistent_process(false, false, true, false));
    }

    #[test]
    fn test_cannot_reuse_mismatched_plan_mode() {
        assert!(!can_reuse_persistent_process(false, true, false, false));
        assert!(!can_reuse_persistent_process(false, false, false, true));
    }

    // --- parse_agent_workspace_id tests ---

    #[test]
    fn test_parse_agent_workspace_id_valid() {
        let id = Uuid::new_v4();
        assert_eq!(parse_agent_workspace_id(&id.to_string()).unwrap(), id);
    }

    #[test]
    fn test_parse_agent_workspace_id_invalid() {
        assert!(parse_agent_workspace_id("not-a-uuid").is_err());
    }

    #[test]
    fn test_parse_agent_workspace_id_empty() {
        assert!(parse_agent_workspace_id("").is_err());
    }

    // --- activate_agent edge cases ---

    #[test]
    fn test_activate_agent_reactivate_after_error() {
        let mut agents = HashMap::new();
        let id = Uuid::new_v4();
        let mut agent = AgentInfo::new(id);
        agent.status = AgentStatus::Error("previous crash".to_string());
        agents.insert(id, agent);

        activate_agent(&mut agents, id);
        assert_eq!(agents.get(&id).unwrap().status, AgentStatus::Running);
    }

    #[test]
    fn test_activate_agent_preserves_session_id() {
        let mut agents = HashMap::new();
        let id = Uuid::new_v4();
        let mut agent = AgentInfo::new(id);
        agent.session_id = Some("my-session".to_string());
        agent.status = AgentStatus::Idle;
        agents.insert(id, agent);

        let session = activate_agent(&mut agents, id);
        assert_eq!(session, Some("my-session".to_string()));
        // session_id should still be there after activation
        assert_eq!(
            agents.get(&id).unwrap().session_id,
            Some("my-session".to_string())
        );
    }

    // --- status_from_exit edge cases ---

    #[test]
    fn test_status_from_exit_various_error_codes() {
        for code in [2, 127, 130, 255] {
            let status = status_from_exit(Some(code), false);
            match status {
                AgentStatus::Error(msg) => assert!(msg.contains(&code.to_string())),
                _ => panic!("Expected Error for code {}", code),
            }
        }
    }

    #[test]
    fn test_status_from_exit_success_ignores_code() {
        // If success=true, always Idle regardless of code
        assert_eq!(status_from_exit(Some(0), true), AgentStatus::Idle);
        assert_eq!(status_from_exit(Some(1), true), AgentStatus::Idle);
        assert_eq!(status_from_exit(None, true), AgentStatus::Idle);
    }

    // --- should_emit_status edge cases ---

    #[test]
    fn test_should_emit_stopping_to_idle() {
        assert!(should_emit_status(&AgentStatus::Stopping, &AgentStatus::Idle));
    }

    #[test]
    fn test_should_emit_stopping_to_error() {
        assert!(should_emit_status(
            &AgentStatus::Stopping,
            &AgentStatus::Error("crash".to_string())
        ));
    }

    #[test]
    fn test_should_emit_error_to_idle() {
        assert!(should_emit_status(
            &AgentStatus::Error("old".to_string()),
            &AgentStatus::Idle
        ));
    }

    #[test]
    fn test_should_emit_error_to_error() {
        assert!(should_emit_status(
            &AgentStatus::Error("old".to_string()),
            &AgentStatus::Error("new".to_string())
        ));
    }

    // --- is_agent_alive edge cases ---

    #[test]
    fn test_is_agent_alive_stopping_status() {
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Stopping;
        agent.pid = Some(1);
        assert!(!is_agent_alive(&agent));
    }

    #[test]
    fn test_is_agent_alive_error_status() {
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Error("crashed".to_string());
        agent.pid = Some(1);
        assert!(!is_agent_alive(&agent));
    }

    // --- resolve_context_id edge cases ---

    #[test]
    fn test_resolve_context_id_error_message() {
        let req = SendMessageRequest {
            workspace_id: None,
            repo_id: None,
            message: "test".to_string(),
            model: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        let err = resolve_context_id(&req).unwrap_err();
        let msg = format!("{:?}", err);
        assert!(msg.contains("workspaceId") || msg.contains("repoId"));
    }

    // -----------------------------------------------------------------------
    // collect_sibling_workspace_names tests
    // -----------------------------------------------------------------------

    use crate::test_helpers::test_workspace;

    #[test]
    fn test_collect_sibling_names_empty_map() {
        let workspaces = HashMap::new();
        let names = collect_sibling_workspace_names(&workspaces, Uuid::new_v4(), Uuid::new_v4());
        assert!(names.is_empty());
    }

    #[test]
    fn test_collect_sibling_names_no_siblings() {
        let repo_id = Uuid::new_v4();
        let ws = test_workspace(repo_id);
        let ws_id = ws.id;
        let mut workspaces = HashMap::new();
        workspaces.insert(ws_id, ws);

        let names = collect_sibling_workspace_names(&workspaces, ws_id, repo_id);
        assert!(names.is_empty());
    }

    #[test]
    fn test_collect_sibling_names_different_repo() {
        let repo_a = Uuid::new_v4();
        let repo_b = Uuid::new_v4();
        let ws_a = test_workspace(repo_a);
        let ws_b = test_workspace(repo_b);
        let ws_a_id = ws_a.id;
        let mut workspaces = HashMap::new();
        workspaces.insert(ws_a.id, ws_a);
        workspaces.insert(ws_b.id, ws_b);

        // ws_b belongs to repo_b, should not appear as sibling of ws_a (repo_a)
        let names = collect_sibling_workspace_names(&workspaces, ws_a_id, repo_a);
        assert!(names.is_empty());
    }

    #[test]
    fn test_collect_sibling_names_with_siblings() {
        let repo_id = Uuid::new_v4();
        let ws1 = test_workspace(repo_id);
        let ws1_id = ws1.id;
        let mut ws2 = test_workspace(repo_id);
        ws2.name = "sibling-a".to_string();
        let mut ws3 = test_workspace(repo_id);
        ws3.name = "sibling-b".to_string();
        let mut workspaces = HashMap::new();
        workspaces.insert(ws1.id, ws1);
        workspaces.insert(ws2.id, ws2);
        workspaces.insert(ws3.id, ws3);

        let mut names = collect_sibling_workspace_names(&workspaces, ws1_id, repo_id);
        names.sort();
        assert_eq!(names, vec!["sibling-a", "sibling-b"]);
    }

    #[test]
    fn test_collect_sibling_names_excludes_self() {
        let repo_id = Uuid::new_v4();
        let mut ws = test_workspace(repo_id);
        ws.name = "myself".to_string();
        let ws_id = ws.id;
        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws);

        let names = collect_sibling_workspace_names(&workspaces, ws_id, repo_id);
        assert!(names.is_empty());
    }

    // -----------------------------------------------------------------------
    // resolve_container_exec_context tests
    // -----------------------------------------------------------------------

    use crate::models::devcontainer::{AgentExecMode, DevContainerConfig};

    #[test]
    fn test_container_ctx_no_devcontainer_config() {
        let ws = test_workspace(Uuid::new_v4());
        // devcontainer_config is None by default
        let ctx = resolve_container_exec_context(&ws, "my-repo", Some("cid".to_string()));
        assert!(ctx.is_none());
    }

    #[test]
    fn test_container_ctx_disabled() {
        let mut ws = test_workspace(Uuid::new_v4());
        ws.devcontainer_config = Some(DevContainerConfig {
            enabled: false,
            agent_exec_mode: AgentExecMode::Container,
            ..Default::default()
        });
        let ctx = resolve_container_exec_context(&ws, "my-repo", Some("cid".to_string()));
        assert!(ctx.is_none());
    }

    #[test]
    fn test_container_ctx_host_mode() {
        let mut ws = test_workspace(Uuid::new_v4());
        ws.devcontainer_config = Some(DevContainerConfig {
            enabled: true,
            agent_exec_mode: AgentExecMode::Host,
            ..Default::default()
        });
        let ctx = resolve_container_exec_context(&ws, "my-repo", Some("cid".to_string()));
        assert!(ctx.is_none());
    }

    #[test]
    fn test_container_ctx_no_container_id() {
        let mut ws = test_workspace(Uuid::new_v4());
        ws.devcontainer_config = Some(DevContainerConfig {
            enabled: true,
            agent_exec_mode: AgentExecMode::Container,
            ..Default::default()
        });
        let ctx = resolve_container_exec_context(&ws, "my-repo", None);
        assert!(ctx.is_none());
    }

    #[test]
    fn test_container_ctx_success() {
        let mut ws = test_workspace(Uuid::new_v4());
        ws.devcontainer_config = Some(DevContainerConfig {
            enabled: true,
            agent_exec_mode: AgentExecMode::Container,
            ..Default::default()
        });
        let ctx = resolve_container_exec_context(&ws, "my-repo", Some("abc123".to_string()));
        assert!(ctx.is_some());
        let ctx = ctx.unwrap();
        assert_eq!(ctx.container_id, "abc123");
        // Default container_workspace_path is None, so it should use the repo name fallback
        assert!(ctx.container_working_dir.contains("my-repo"));
    }

    #[test]
    fn test_container_ctx_custom_workspace_path() {
        let mut ws = test_workspace(Uuid::new_v4());
        ws.devcontainer_config = Some(DevContainerConfig {
            enabled: true,
            agent_exec_mode: AgentExecMode::Container,
            container_workspace_path: Some("/custom/path".to_string()),
            ..Default::default()
        });
        let ctx = resolve_container_exec_context(&ws, "my-repo", Some("cid".to_string()));
        assert!(ctx.is_some());
        assert_eq!(ctx.unwrap().container_working_dir, "/custom/path");
    }

    // -----------------------------------------------------------------------
    // extract_toggle_flags tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_extract_toggle_flags_defaults() {
        let req = SendMessageRequest {
            workspace_id: Some(Uuid::new_v4()),
            repo_id: None,
            message: "hi".to_string(),
            model: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        let (thinking, plan) = extract_toggle_flags(&req);
        assert!(!thinking);
        assert!(!plan);
    }

    #[test]
    fn test_extract_toggle_flags_explicit_true() {
        let req = SendMessageRequest {
            workspace_id: Some(Uuid::new_v4()),
            repo_id: None,
            message: "hi".to_string(),
            model: None,
            disable_thinking: Some(true),
            disable_plan_mode: Some(true),
        };
        let (thinking, plan) = extract_toggle_flags(&req);
        assert!(thinking);
        assert!(plan);
    }

    #[test]
    fn test_extract_toggle_flags_explicit_false() {
        let req = SendMessageRequest {
            workspace_id: Some(Uuid::new_v4()),
            repo_id: None,
            message: "hi".to_string(),
            model: None,
            disable_thinking: Some(false),
            disable_plan_mode: Some(false),
        };
        let (thinking, plan) = extract_toggle_flags(&req);
        assert!(!thinking);
        assert!(!plan);
    }

    #[test]
    fn test_extract_toggle_flags_mixed() {
        let req = SendMessageRequest {
            workspace_id: Some(Uuid::new_v4()),
            repo_id: None,
            message: "hi".to_string(),
            model: None,
            disable_thinking: Some(true),
            disable_plan_mode: None,
        };
        let (thinking, plan) = extract_toggle_flags(&req);
        assert!(thinking);
        assert!(!plan);
    }

    // ─── should_block_new_message tests ──────────────────────────────

    #[test]
    fn test_should_block_running_no_pid_sidecar() {
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Running;
        agent.pid = None; // Sidecar-based, no PID
        // Sidecar agent is considered alive when Running
        assert!(should_block_new_message(&agent));
    }

    #[test]
    fn test_should_block_running_dead_pid() {
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Running;
        agent.pid = Some(999_999_999); // Dead PID
        // Process is dead — should NOT block (stale Running)
        assert!(!should_block_new_message(&agent));
    }

    #[test]
    fn test_should_not_block_idle() {
        let agent = AgentInfo::new(Uuid::new_v4());
        assert!(!should_block_new_message(&agent));
    }

    #[test]
    fn test_should_not_block_error() {
        let mut agent = AgentInfo::new(Uuid::new_v4());
        agent.status = AgentStatus::Error("crash".to_string());
        assert!(!should_block_new_message(&agent));
    }

    // ─── normalize_null_value tests ──────────────────────────────────

    #[test]
    fn test_normalize_null_value_none() {
        assert!(normalize_null_value(None).is_none());
    }

    #[test]
    fn test_normalize_null_value_json_null() {
        assert!(normalize_null_value(Some(serde_json::Value::Null)).is_none());
    }

    #[test]
    fn test_normalize_null_value_json_string() {
        let val = serde_json::json!("hello");
        assert_eq!(normalize_null_value(Some(val.clone())), Some(val));
    }

    #[test]
    fn test_normalize_null_value_json_object() {
        let val = serde_json::json!({"key": "value"});
        assert_eq!(normalize_null_value(Some(val.clone())), Some(val));
    }

    // ─── normalize_empty_string tests ────────────────────────────────

    #[test]
    fn test_normalize_empty_string_none() {
        assert!(normalize_empty_string(None).is_none());
    }

    #[test]
    fn test_normalize_empty_string_empty() {
        assert!(normalize_empty_string(Some(String::new())).is_none());
    }

    #[test]
    fn test_normalize_empty_string_non_empty() {
        assert_eq!(
            normalize_empty_string(Some("allow".to_string())),
            Some("allow".to_string())
        );
    }

    // ─── supports_permission_response tests ──────────────────────────

    #[test]
    fn test_supports_permission_claude_code() {
        assert!(supports_permission_response(&AgentType::ClaudeCode));
    }

    #[test]
    fn test_does_not_support_permission_codex() {
        assert!(!supports_permission_response(&AgentType::CodexCli));
    }
}
