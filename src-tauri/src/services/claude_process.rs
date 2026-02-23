use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, FrontendStreamEvent};
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;

/// Locate the `claude` binary in PATH.
pub fn find_claude_binary() -> Result<PathBuf, AppError> {
    which::which("claude").map_err(|_| {
        AppError::AgentError(
            "Claude Code CLI not found in PATH. Install it with: npm install -g @anthropic-ai/claude-code".to_string(),
        )
    })
}

/// Build environment variables for the Claude Code process (workspace mode).
pub fn build_env_vars(
    workspace: &Workspace,
    repo: &Repository,
    settings: &AppSettings,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

    // Conductor-compatible env vars
    env.insert(
        "CONDUCTOR_WORKSPACE_NAME".to_string(),
        workspace.name.clone(),
    );
    env.insert(
        "CONDUCTOR_WORKSPACE_PATH".to_string(),
        workspace.worktree_path.to_string_lossy().to_string(),
    );
    env.insert(
        "CONDUCTOR_ROOT_PATH".to_string(),
        repo.path.to_string_lossy().to_string(),
    );
    env.insert(
        "CONDUCTOR_DEFAULT_BRANCH".to_string(),
        repo.default_branch.clone(),
    );
    env.insert(
        "CONDUCTOR_PORT".to_string(),
        workspace.port_base.to_string(),
    );

    // Provider env vars from settings
    for (key, value) in &settings.provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    // Agent teams experimental feature
    if settings.experimental.agent_teams {
        env.insert("CONDUCTOR_AGENT_TEAMS".to_string(), "true".to_string());
    }

    env
}

/// Build environment variables for the Claude Code process (repo-direct mode).
pub fn build_repo_env_vars(
    repo: &Repository,
    settings: &AppSettings,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

    env.insert(
        "CONDUCTOR_ROOT_PATH".to_string(),
        repo.path.to_string_lossy().to_string(),
    );
    env.insert(
        "CONDUCTOR_DEFAULT_BRANCH".to_string(),
        repo.default_branch.clone(),
    );

    for (key, value) in &settings.provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    env
}

/// Build common CLI arguments shared between spawn modes.
fn build_common_args(
    session_id: Option<&str>,
    linked_dirs: &[PathBuf],
    system_prompt_additions: Option<&str>,
    model: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    if let Some(sid) = session_id {
        args.push("--resume".to_string());
        args.push(sid.to_string());
    }

    for dir in linked_dirs {
        args.push("--add-dir".to_string());
        args.push(dir.to_string_lossy().to_string());
    }

    if let Some(prompt) = system_prompt_additions {
        if !prompt.is_empty() {
            args.push("--append-system-prompt".to_string());
            args.push(prompt.to_string());
        }
    }

    if let Some(m) = model {
        const ALLOWED_MODELS: &[&str] = &["sonnet", "opus", "haiku"];
        if ALLOWED_MODELS.contains(&m) {
            args.push("--model".to_string());
            args.push(m.to_string());
        }
    }

    args
}

/// Try to capture session_id from a stream event and save it to agent info.
/// Returns true if a session_id was found and stored.
fn try_capture_session_id(
    event: &FrontendStreamEvent,
    agents: &Mutex<HashMap<Uuid, AgentInfo>>,
    workspace_id: Uuid,
) -> bool {
    let sid = match event {
        FrontendStreamEvent::System { session_id, .. } => session_id.clone(),
        FrontendStreamEvent::Result { session_id, .. } => session_id.clone(),
        _ => None,
    };
    if let Some(sid) = sid {
        let mut lock = agents.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(agent) = lock.get_mut(&workspace_id) {
            agent.session_id = Some(sid);
        }
        true
    } else {
        false
    }
}

/// Spawn Claude Code CLI and stream its output via Tauri events.
///
/// Returns the child process handle. The session_id will be emitted
/// via events as it's parsed from the stream.
pub async fn spawn_and_stream(
    workspace_id: Uuid,
    message: &str,
    session_id: Option<&str>,
    worktree_path: &Path,
    env_vars: HashMap<String, String>,
    linked_dirs: Vec<PathBuf>,
    system_prompt_additions: Option<&str>,
    model: Option<&str>,
    app_handle: AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
) -> Result<Child, AppError> {
    let claude_bin = find_claude_binary()?;

    let mut args = vec!["-p".to_string(), message.to_string()];
    args.extend(build_common_args(
        session_id,
        &linked_dirs,
        system_prompt_additions,
        model,
    ));

    let mut cmd = Command::new(&claude_bin);
    cmd.args(&args)
        .current_dir(worktree_path)
        .envs(&env_vars)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Set process group on Unix for clean teardown
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            });
        }
    }

    // Set CREATE_NEW_PROCESS_GROUP on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00000200);
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::AgentError(format!("Failed to spawn Claude Code: {}", e))
    })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stdout".to_string())
    })?;

    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stderr".to_string())
    })?;

    // Spawn task to read stdout (NDJSON stream)
    let app_handle_stdout = app_handle.clone();
    let ws_id = workspace_id;
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let event_name = format!("agent-stream:{}", ws_id);
        let mut session_id_captured = false;

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            if let Some(frontend_event) = parse_stream_line(&line) {
                if !session_id_captured {
                    session_id_captured =
                        try_capture_session_id(&frontend_event, &agents, ws_id);
                }

                let _ = app_handle_stdout.emit(&event_name, &frontend_event);
            }
        }
    });

    // Spawn task to read stderr (log it, don't emit)
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[claude-stderr:{}] {}", ws_id, line);
        }
    });

    Ok(child)
}

/// Write a message to a persistent Claude process's stdin.
pub async fn write_message(stdin: &mut ChildStdin, message: &str) -> Result<(), AppError> {
    stdin
        .write_all(format!("{}\n", message).as_bytes())
        .await
        .map_err(|e| AppError::AgentError(format!("Failed to write to Claude stdin: {}", e)))?;
    stdin
        .flush()
        .await
        .map_err(|e| AppError::AgentError(format!("Failed to flush Claude stdin: {}", e)))?;
    Ok(())
}

/// Spawn a persistent Claude Code CLI process (Performance Mode).
///
/// Unlike `spawn_and_stream`, this spawns without `-p` so the process stays
/// alive between turns. Messages are written to stdin via `write_message`.
/// Returns `(Child, ChildStdin)` — the caller keeps the ChildStdin for future writes.
pub async fn spawn_persistent(
    workspace_id: Uuid,
    session_id: Option<&str>,
    worktree_path: &Path,
    env_vars: HashMap<String, String>,
    linked_dirs: Vec<PathBuf>,
    system_prompt_additions: Option<&str>,
    model: Option<&str>,
    app_handle: AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    persistent_agents: Arc<Mutex<HashMap<Uuid, ChildStdin>>>,
) -> Result<(Child, ChildStdin), AppError> {
    let claude_bin = find_claude_binary()?;

    let args = build_common_args(session_id, &linked_dirs, system_prompt_additions, model);

    let mut cmd = Command::new(&claude_bin);
    cmd.args(&args)
        .current_dir(worktree_path)
        .envs(&env_vars)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            });
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00000200);
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::AgentError(format!("Failed to spawn persistent Claude Code: {}", e))
    })?;

    let stdin = child.stdin.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stdin".to_string())
    })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stdout".to_string())
    })?;

    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stderr".to_string())
    })?;

    // Spawn persistent stdout reader — stays alive between turns
    let app_handle_stdout = app_handle.clone();
    let ws_id = workspace_id;
    let agents_stdout = Arc::clone(&agents);
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let event_name = format!("agent-stream:{}", ws_id);
        let mut session_id_captured = false;

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            if let Some(frontend_event) = parse_stream_line(&line) {
                if !session_id_captured {
                    session_id_captured =
                        try_capture_session_id(&frontend_event, &agents_stdout, ws_id);
                }

                // In persistent mode, a result event means the turn is done (set Idle)
                if matches!(&frontend_event, FrontendStreamEvent::Result { .. }) {
                    {
                        let mut lock =
                            agents_stdout.lock().unwrap_or_else(|e| e.into_inner());
                        if let Some(agent) = lock.get_mut(&ws_id) {
                            agent.status = AgentStatus::Idle;
                        }
                    }
                    let _ = app_handle_stdout.emit(
                        &format!("agent-status:{}", ws_id),
                        &AgentStatusEvent {
                            workspace_id: ws_id,
                            status: AgentStatus::Idle,
                        },
                    );
                }

                let _ = app_handle_stdout.emit(&event_name, &frontend_event);
            }
        }

        // EOF — process exited unexpectedly, clean up
        persistent_agents
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&ws_id);
        {
            let mut lock = agents_stdout.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(agent) = lock.get_mut(&ws_id) {
                agent.status = AgentStatus::Idle;
                agent.pid = None;
            }
        }
        let _ = app_handle_stdout.emit(
            &format!("agent-status:{}", ws_id),
            &AgentStatusEvent {
                workspace_id: ws_id,
                status: AgentStatus::Idle,
            },
        );
    });

    // Spawn task to read stderr
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[claude-persistent-stderr:{}] {}", ws_id, line);
        }
    });

    Ok((child, stdin))
}

/// Parse a single NDJSON line from Claude Code's stream output
/// into a frontend-friendly event.
pub fn parse_stream_line(line: &str) -> Option<FrontendStreamEvent> {
    let raw: serde_json::Value = serde_json::from_str(line).ok()?;

    let event_type = raw.get("type")?.as_str()?;

    match event_type {
        "system" => {
            let session_id = raw.get("session_id").and_then(|v| v.as_str()).map(String::from);
            let message = raw.get("message").and_then(|v| v.as_str()).map(String::from);
            Some(FrontendStreamEvent::System {
                session_id,
                message,
            })
        }
        "assistant" => {
            // Extract content blocks from the message
            let content = raw
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())?;

            // Process each content block
            let mut events = Vec::new();
            for block in content {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            events.push(FrontendStreamEvent::AssistantText {
                                text: text.to_string(),
                            });
                        }
                    }
                    "tool_use" => {
                        let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let input = block.get("input").cloned().unwrap_or(serde_json::Value::Null);
                        events.push(FrontendStreamEvent::ToolUse { id, name, input });
                    }
                    "tool_result" => {
                        let tool_use_id = block.get("tool_use_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let content = block.get("content").map(|v| {
                            if let Some(s) = v.as_str() {
                                s.to_string()
                            } else {
                                v.to_string()
                            }
                        }).unwrap_or_default();
                        events.push(FrontendStreamEvent::ToolResult { tool_use_id, content });
                    }
                    _ => {}
                }
            }

            // Return the first event (most assistant messages have one content block)
            // For multi-block messages, we emit them as separate events
            events.into_iter().next()
        }
        "result" => {
            let is_error = raw.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false)
                || raw.get("subtype").and_then(|v| v.as_str()) == Some("error");
            let result = raw.get("result").and_then(|v| v.as_str()).map(String::from);
            let session_id = raw.get("session_id").and_then(|v| v.as_str()).map(String::from);
            Some(FrontendStreamEvent::Result {
                is_error,
                result,
                session_id,
            })
        }
        _ => None,
    }
}
