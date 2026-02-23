use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, SendMessageRequest};
use crate::services::claude_process;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

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
    let context_id = request
        .workspace_id
        .or(request.repo_id)
        .ok_or_else(|| {
            AppError::AgentError(
                "Either workspaceId or repoId must be provided".to_string(),
            )
        })?;

    // Check if agent is already running
    {
        let agents = state.agents.lock().unwrap();
        if let Some(agent) = agents.get(&context_id) {
            if agent.status == AgentStatus::Running {
                return Err(AppError::AgentError(
                    "Agent is already processing a message".to_string(),
                ));
            }
        }
    }

    // Resolve working directory and env vars based on context type
    let (working_dir, env_vars) = if let Some(workspace_id) = request.workspace_id {
        // Workspace mode: use worktree path
        let (workspace, repo) = {
            let workspaces = state.workspaces.lock().unwrap();
            let ws = workspaces
                .get(&workspace_id)
                .ok_or(AppError::WorkspaceNotFound(workspace_id))?
                .clone();
            let repos = state.repositories.lock().unwrap();
            let repo = repos
                .get(&ws.repo_id)
                .ok_or(AppError::RepoNotFound(ws.repo_id))?
                .clone();
            (ws, repo)
        };
        let settings = state.settings.lock().unwrap().clone();
        let mut env = claude_process::build_env_vars(&workspace, &repo, &settings);

        // Agent teams: add sibling workspace names
        if settings.experimental.agent_teams {
            let workspaces = state.workspaces.lock().unwrap();
            let siblings: Vec<String> = workspaces
                .values()
                .filter(|ws| ws.repo_id == workspace.repo_id && ws.id != workspace.id)
                .map(|ws| ws.name.clone())
                .collect();
            if !siblings.is_empty() {
                env.insert(
                    "CONDUCTOR_TEAM_WORKSPACES".to_string(),
                    siblings.join(","),
                );
            }
        }

        (workspace.worktree_path.clone(), env)
    } else {
        // Repo mode: use repo path directly
        let repo_id = request.repo_id.unwrap();
        let repo = {
            let repos = state.repositories.lock().unwrap();
            repos
                .get(&repo_id)
                .ok_or(AppError::RepoNotFound(repo_id))?
                .clone()
        };
        let settings = state.settings.lock().unwrap().clone();
        let env = claude_process::build_repo_env_vars(&repo, &settings);
        (repo.path.clone(), env)
    };

    // Get or create agent info, extract session_id
    let session_id = {
        let mut agents = state.agents.lock().unwrap();
        let agent = agents
            .entry(context_id)
            .or_insert_with(|| AgentInfo::new(context_id));
        agent.status = AgentStatus::Running;
        agent.started_at = Some(chrono::Utc::now());
        agent.session_id.clone()
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
    let linked_dirs = if request.workspace_id.is_some() {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            let link_ids = db.get_workspace_links(&context_id).unwrap_or_default();
            let workspaces = state.workspaces.lock().unwrap();
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

    // Get system prompt additions, persistent mode, and safe mode settings in a single lock
    let (system_prompt, persistent_mode, safe_mode) = {
        let settings = state.settings.lock().unwrap();
        (
            settings.system_prompt_additions.clone(),
            settings.experimental.persistent_processes,
            settings.experimental.safe_mode,
        )
    };

    let disable_thinking = request.disable_thinking.unwrap_or(false);
    let disable_plan_mode = request.disable_plan_mode.unwrap_or(false);

    if persistent_mode {
        // Performance Mode: reuse a long-running process or spawn one
        // Single remove avoids TOCTOU race between contains_key + remove
        let existing_stdin = state
            .persistent_agents
            .lock()
            .unwrap()
            .remove(&context_id);

        if let Some(mut stdin) = existing_stdin {
            // Reuse existing persistent process
            if let Err(e) = claude_process::write_message(&mut stdin, &request.message).await {
                reset_agent_on_error(&state.agents, &app, context_id);
                return Err(e);
            }

            // Put stdin back for next turn
            state
                .persistent_agents
                .lock()
                .unwrap()
                .insert(context_id, stdin);
        } else {
            // Spawn new persistent process
            let (child, mut stdin) = match claude_process::spawn_persistent(
                context_id,
                session_id.as_deref(),
                &working_dir,
                env_vars,
                linked_dirs,
                system_prompt.as_deref(),
                request.model.as_deref(),
                safe_mode,
                disable_thinking,
                disable_plan_mode,
                app.clone(),
                Arc::clone(&state.agents),
                Arc::clone(&state.persistent_agents),
            )
            .await
            {
                Ok(result) => result,
                Err(e) => {
                    reset_agent_on_error(&state.agents, &app, context_id);
                    return Err(e);
                }
            };

            // Store PID in agent info for stop_agent
            if let Some(pid) = child.id() {
                let mut agents = state.agents.lock().unwrap();
                if let Some(agent) = agents.get_mut(&context_id) {
                    agent.pid = Some(pid);
                }
            }

            // Write the first message
            if let Err(e) = claude_process::write_message(&mut stdin, &request.message).await {
                reset_agent_on_error(&state.agents, &app, context_id);
                return Err(e);
            }

            // Store handles
            state
                .persistent_agents
                .lock()
                .unwrap()
                .insert(context_id, stdin);
            state
                .agent_processes
                .lock()
                .unwrap()
                .insert(context_id, child);

            // Background task: watch for unexpected process exit
            let agents_ref = Arc::clone(&state.agents);
            let processes_ref = Arc::clone(&state.agent_processes);
            let persistent_ref = Arc::clone(&state.persistent_agents);
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

                // Process exited — clean up persistent state
                persistent_ref
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&context_id);

                let new_status = match exit_status {
                    Some(ref status) if status.success() => AgentStatus::Idle,
                    Some(ref status) => AgentStatus::Error(format!(
                        "Persistent process exited with code: {:?}",
                        status.code()
                    )),
                    None => AgentStatus::Idle,
                };

                {
                    let mut agents =
                        agents_ref.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(agent) = agents.get_mut(&context_id) {
                        agent.status = new_status.clone();
                        agent.pid = None;
                    }
                }

                let _ = app_clone.emit(
                    &format!("agent-status:{}", context_id),
                    &AgentStatusEvent {
                        workspace_id: context_id,
                        status: new_status,
                    },
                );
            });
        }
    } else {
        // Low RAM Mode: spawn a new process per turn
        let (child, stdin) = match claude_process::spawn_and_stream(
            context_id,
            &request.message,
            session_id.as_deref(),
            &working_dir,
            env_vars,
            linked_dirs,
            system_prompt.as_deref(),
            request.model.as_deref(),
            safe_mode,
            disable_thinking,
            disable_plan_mode,
            app.clone(),
            Arc::clone(&state.agents),
        )
        .await
        {
            Ok(result) => result,
            Err(e) => {
                reset_agent_on_error(&state.agents, &app, context_id);
                return Err(e);
            }
        };

        // Store stdin for safe mode permission responses
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

            // Clean up stdin handle
            stdins_ref
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&context_id);

            let new_status = match exit_status {
                Some(ref status) if status.success() => AgentStatus::Idle,
                Some(ref status) => AgentStatus::Error(format!(
                    "Process exited with code: {:?}",
                    status.code()
                )),
                None => AgentStatus::Idle,
            };

            {
                let mut agents =
                    agents_ref.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(agent) = agents.get_mut(&context_id) {
                    agent.status = new_status.clone();
                    agent.pid = None;
                }
            }

            let _ = app_clone.emit(
                &format!("agent-status:{}", context_id),
                &AgentStatusEvent {
                    workspace_id: context_id,
                    status: new_status,
                },
            );
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn respond_to_permission(
    state: State<'_, AppState>,
    workspace_id: String,
    approved: bool,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let response = if approved { "yes" } else { "no" };

    // Try agent_stdins first (non-persistent mode), then persistent_agents
    let mut stdin_opt = state.agent_stdins.lock().unwrap().remove(&id);
    let from_persistent = if stdin_opt.is_none() {
        stdin_opt = state.persistent_agents.lock().unwrap().remove(&id);
        true
    } else {
        false
    };

    if let Some(mut stdin) = stdin_opt {
        let write_result = claude_process::write_message(&mut stdin, response).await;

        // Always put stdin back, even on error — losing the handle is unrecoverable
        if from_persistent {
            state.persistent_agents.lock().unwrap().insert(id, stdin);
        } else {
            state.agent_stdins.lock().unwrap().insert(id, stdin);
        }

        write_result?;
        Ok(())
    } else {
        Err(AppError::AgentError(
            "No stdin handle found for this agent".to_string(),
        ))
    }
}

#[tauri::command]
pub fn stop_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Set status to Stopping and get PID for kill
    let pid = {
        let mut agents = state.agents.lock().unwrap();
        if let Some(agent) = agents.get_mut(&id) {
            agent.status = AgentStatus::Stopping;
            agent.pid
        } else {
            None
        }
    };

    // Kill via PID stored in agent info (works even if background task took the Child)
    if let Some(pid) = pid {
        let _ = crate::platform::kill_process_group(pid);
    }

    // Also try agent_processes as fallback
    {
        let mut processes = state.agent_processes.lock().unwrap();
        if let Some(child) = processes.remove(&id) {
            if let Some(pid) = child.id() {
                let _ = crate::platform::kill_process_group(pid);
            }
        }
    }

    // Clean up persistent state and stdin handles
    state.persistent_agents.lock().unwrap().remove(&id);
    state.agent_stdins.lock().unwrap().remove(&id);

    // Set status to Idle and clear PID
    {
        let mut agents = state.agents.lock().unwrap();
        if let Some(agent) = agents.get_mut(&id) {
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
}

#[tauri::command]
pub fn get_agent_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<AgentInfo, AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let agents = state.agents.lock().unwrap();
    Ok(agents
        .get(&id)
        .cloned()
        .unwrap_or_else(|| AgentInfo::new(id)))
}

#[tauri::command]
pub fn clear_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let mut agents = state.agents.lock().unwrap();
    if let Some(agent) = agents.get_mut(&id) {
        agent.session_id = None;
    }
    drop(agents);

    // Kill any persistent process for this workspace (new session = new process)
    state.persistent_agents.lock().unwrap().remove(&id);
    state.agent_stdins.lock().unwrap().remove(&id);
    {
        let mut processes = state.agent_processes.lock().unwrap();
        if let Some(child) = processes.remove(&id) {
            if let Some(pid) = child.id() {
                let _ = crate::platform::kill_process_group(pid);
            }
        }
    }

    Ok(())
}
