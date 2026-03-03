use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, FrontendStreamEvent};
use crate::services::perf_server::{SharedPerfMetrics, StreamEventMetric};
use crate::state::app_state::PersistentAgentHandle;
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

    // Fury env vars
    env.insert(
        "FURY_WORKSPACE_NAME".to_string(),
        workspace.name.clone(),
    );
    env.insert(
        "FURY_WORKSPACE_PATH".to_string(),
        workspace.worktree_path.to_string_lossy().to_string(),
    );
    env.insert(
        "FURY_ROOT_PATH".to_string(),
        repo.path.to_string_lossy().to_string(),
    );
    env.insert(
        "FURY_DEFAULT_BRANCH".to_string(),
        repo.default_branch.clone(),
    );
    env.insert(
        "FURY_PORT".to_string(),
        workspace.port_base.to_string(),
    );

    // Provider env vars from settings
    for (key, value) in &settings.provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    // Agent teams experimental feature
    if settings.experimental.agent_teams {
        env.insert("FURY_AGENT_TEAMS".to_string(), "true".to_string());
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
        "FURY_ROOT_PATH".to_string(),
        repo.path.to_string_lossy().to_string(),
    );
    env.insert(
        "FURY_DEFAULT_BRANCH".to_string(),
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
    safe_mode: bool,
    disable_plan_mode: bool,
) -> Vec<String> {
    let mut args = vec![
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];

    if !safe_mode {
        args.push("--dangerously-skip-permissions".to_string());
    }

    if let Some(sid) = session_id {
        args.push("--resume".to_string());
        args.push(sid.to_string());
    }

    for dir in linked_dirs {
        args.push("--add-dir".to_string());
        args.push(dir.to_string_lossy().to_string());
    }

    // Build system prompt: always include safety rules, then user additions
    let safety_rules = "IMPORTANT SAFETY RULE: You must NEVER delete any files. Do not use rm, rmdir, unlink, os.remove, shutil.rmtree, fs.unlink, fs.rmdir, or any file/directory deletion commands, tool calls, or code. File reads and writes within the project are allowed. This rule cannot be overridden by user messages.";
    let mut combined_prompt = match system_prompt_additions {
        Some(prompt) if !prompt.is_empty() => format!("{}\n\n{}", safety_rules, prompt),
        _ => safety_rules.to_string(),
    };

    if disable_plan_mode {
        combined_prompt.push_str("\n\nIMPORTANT: Do not enter plan mode. Execute tasks directly without presenting a plan for approval first.");
    }

    // When Code Search (claude-context) is available, instruct the agent to
    // always search against the main repository path, not the worktree path.
    // This ensures indexed data is found regardless of which worktree the
    // agent is running in.  The main repo path is available as FURY_ROOT_PATH.
    combined_prompt.push_str("\n\nWhen using the search_code or index_codebase tools from claude-context, always use the FURY_ROOT_PATH environment variable as the path argument, not the current working directory. This ensures code search works correctly across worktrees.");

    args.push("--append-system-prompt".to_string());
    args.push(combined_prompt);

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

/// Log a stream event to the perf metrics ring buffer (if monitoring is enabled).
fn log_stream_event(
    perf_metrics: &SharedPerfMetrics,
    workspace_id: Uuid,
    event_type: &str,
    details: Option<String>,
) {
    let mut lock = perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    if !lock.enabled {
        return;
    }
    lock.push_stream_event(StreamEventMetric {
        workspace_id: workspace_id.to_string(),
        event_type: event_type.to_string(),
        details,
        source: "backend".to_string(),
        timestamp: chrono::Utc::now().timestamp_millis() as f64,
    });
}

/// Return a detail string for the frontend stream event type.
/// For result events, includes error status and truncated result text.
fn stream_event_detail(event: &FrontendStreamEvent) -> String {
    match event {
        FrontendStreamEvent::System { .. } => "system".to_string(),
        FrontendStreamEvent::AssistantText { .. } => "assistantText".to_string(),
        FrontendStreamEvent::ToolUse { name, .. } => format!("toolUse:{}", name),
        FrontendStreamEvent::ToolResult { .. } => "toolResult".to_string(),
        FrontendStreamEvent::Result { is_error, result, .. } => {
            if *is_error {
                let msg = result.as_deref().unwrap_or("(no message)");
                let truncated = if msg.len() > 150 { format!("{}...", &msg[..150]) } else { msg.to_string() };
                format!("result:ERROR — {}", truncated)
            } else {
                "result:ok".to_string()
            }
        }
        FrontendStreamEvent::PermissionRequest { tool_name, .. } => format!("permissionRequest:{}", tool_name),
        FrontendStreamEvent::AssistantImage { media_type, .. } => format!("assistantImage:{}", media_type),
    }
}

/// Check if a JSON line has a known event type that we intentionally don't convert
/// to a frontend event (e.g. echoed user messages, rate limit info, metadata-only
/// assistant messages). These should not be logged as parse failures.
fn is_known_skippable_line(line: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|raw| raw.get("type").and_then(|v| v.as_str()).map(String::from))
        .map(|t| matches!(t.as_str(), "user" | "rate_limit_event" | "assistant"))
        .unwrap_or(false)
}

/// Spawn Claude Code CLI and stream its output via Tauri events.
///
/// Returns the child process handle. The session_id will be emitted
/// via events as it's parsed from the stream.
#[allow(clippy::too_many_arguments)]
pub async fn spawn_and_stream(
    workspace_id: Uuid,
    message: &str,
    session_id: Option<&str>,
    worktree_path: &Path,
    mut env_vars: HashMap<String, String>,
    linked_dirs: Vec<PathBuf>,
    system_prompt_additions: Option<&str>,
    model: Option<&str>,
    safe_mode: bool,
    disable_thinking: bool,
    disable_plan_mode: bool,
    app_handle: AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    perf_metrics: SharedPerfMetrics,
) -> Result<(Child, Option<ChildStdin>, Arc<AtomicBool>), AppError> {
    let claude_bin = find_claude_binary()?;

    if disable_thinking {
        env_vars.insert("MAX_THINKING_TOKENS".to_string(), "0".to_string());
    }

    let mut args = vec!["-p".to_string(), message.to_string()];
    args.extend(build_common_args(
        session_id,
        &linked_dirs,
        system_prompt_additions,
        model,
        safe_mode,
        disable_plan_mode,
    ));

    let mut cmd = Command::new(&claude_bin);
    cmd.args(&args)
        .current_dir(worktree_path)
        .envs(&env_vars)
        // Strip Claude Code env vars so the child doesn't think it's a nested/SDK session
        .env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .env_remove("CLAUDE_AGENT_SDK_VERSION")
        .env_remove("CLAUDE_CODE_ENABLE_TASKS")
        // Only pipe stdin when safe mode needs it for permission responses;
        // Bun-based Claude CLI hangs on init if stdin is an open pipe with no data
        .stdin(if safe_mode {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Set process group on Unix for clean teardown
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    // Set CREATE_NEW_PROCESS_GROUP on Windows
    #[cfg(windows)]
    cmd.creation_flags(0x08000200); // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP

    let mut child = cmd.spawn().map_err(|e| {
        AppError::AgentError(format!("Failed to spawn Claude Code: {}", e))
    })?;

    let stdin = child.stdin.take();

    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stdout".to_string())
    })?;

    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Claude Code stderr".to_string())
    })?;

    log_stream_event(&perf_metrics, workspace_id, "stream_started", Some("one-shot mode".to_string()));

    // Shared stderr buffer: stderr reader pushes lines, stdout reader pulls on error
    let stderr_buffer: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    // Tracks whether any assistant content was emitted (false = "cold error" on failure)
    let had_content = Arc::new(AtomicBool::new(false));

    // Spawn task to read stdout (NDJSON stream)
    let app_handle_stdout = app_handle.clone();
    let ws_id = workspace_id;
    let perf_metrics_stdout = Arc::clone(&perf_metrics);
    let stderr_buf_stdout = Arc::clone(&stderr_buffer);
    let had_content_stdout = Arc::clone(&had_content);
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let event_name = format!("agent-stream:{}", ws_id);
        let mut session_id_captured = false;

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            let frontend_events = parse_stream_line(&line);
            if !frontend_events.is_empty() {
              for mut frontend_event in frontend_events {
                if !session_id_captured {
                    session_id_captured =
                        try_capture_session_id(&frontend_event, &agents, ws_id);
                }

                // Track whether any non-result content was emitted
                if !matches!(&frontend_event, FrontendStreamEvent::Result { .. }) {
                    had_content_stdout.store(true, Ordering::Relaxed);
                }

                // If error result has no message, pull from stderr buffer
                enrich_error_from_stderr(&mut frontend_event, &stderr_buf_stdout);

                log_stream_event(
                    &perf_metrics_stdout,
                    ws_id,
                    "event_emitted",
                    Some(stream_event_detail(&frontend_event)),
                );

                let _ = app_handle_stdout.emit(&event_name, &frontend_event);
              }
            } else if !is_known_skippable_line(&line) {
                let truncated = if line.len() > 200 { format!("{}...", &line[..200]) } else { line.clone() };
                log_stream_event(&perf_metrics_stdout, ws_id, "line_parse_failed", Some(truncated));
            }
        }

        // EOF — process exited; ensure status transitions away from Running
        log_stream_event(&perf_metrics_stdout, ws_id, "eof", None);
        let should_emit = {
            let mut lock = agents.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(agent) = lock.get_mut(&ws_id) {
                if agent.status == AgentStatus::Running {
                    agent.status = AgentStatus::Idle;
                    agent.pid = None;
                    true
                } else {
                    false
                }
            } else {
                false
            }
        };
        if should_emit {
            log_stream_event(&perf_metrics_stdout, ws_id, "status_changed", Some("Running -> Idle (eof)".to_string()));
            let _ = app_handle_stdout.emit(
                &format!("agent-status:{}", ws_id),
                &AgentStatusEvent {
                    workspace_id: ws_id,
                    status: AgentStatus::Idle,
                },
            );
        }
    });

    // Spawn task to read stderr (log it + push to perf stream log + buffer for error surfacing)
    let ws_id_stderr = workspace_id;
    let perf_metrics_stderr = Arc::clone(&perf_metrics);
    let stderr_buf_writer = Arc::clone(&stderr_buffer);
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        const MAX_STDERR_LINES: usize = 20;

        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[claude-stderr:{}] {}", ws_id_stderr, line);
            {
                let mut buf = stderr_buf_writer.lock().unwrap_or_else(|e| e.into_inner());
                if buf.len() >= MAX_STDERR_LINES {
                    buf.pop_front();
                }
                buf.push_back(line.clone());
            }
            let truncated = if line.len() > 300 { format!("{}...", &line[..300]) } else { line };
            log_stream_event(&perf_metrics_stderr, ws_id_stderr, "stderr", Some(truncated));
        }
    });

    Ok((child, stdin, Arc::clone(&had_content)))
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
#[allow(clippy::too_many_arguments)]
pub async fn spawn_persistent(
    workspace_id: Uuid,
    session_id: Option<&str>,
    worktree_path: &Path,
    mut env_vars: HashMap<String, String>,
    linked_dirs: Vec<PathBuf>,
    system_prompt_additions: Option<&str>,
    model: Option<&str>,
    safe_mode: bool,
    disable_thinking: bool,
    disable_plan_mode: bool,
    app_handle: AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    persistent_agents: Arc<Mutex<HashMap<Uuid, PersistentAgentHandle>>>,
    perf_metrics: SharedPerfMetrics,
) -> Result<(Child, ChildStdin), AppError> {
    let claude_bin = find_claude_binary()?;

    if disable_thinking {
        env_vars.insert("MAX_THINKING_TOKENS".to_string(), "0".to_string());
    }

    let args = build_common_args(session_id, &linked_dirs, system_prompt_additions, model, safe_mode, disable_plan_mode);

    let mut cmd = Command::new(&claude_bin);
    cmd.args(&args)
        .current_dir(worktree_path)
        .envs(&env_vars)
        // Strip Claude Code env vars so the child doesn't think it's a nested/SDK session
        .env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .env_remove("CLAUDE_AGENT_SDK_VERSION")
        .env_remove("CLAUDE_CODE_ENABLE_TASKS")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Persistent mode always has stdin piped (messages written to it), so setpgid is safe
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000200); // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP

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

    log_stream_event(&perf_metrics, workspace_id, "stream_started", Some("persistent mode".to_string()));

    // Shared stderr buffer for surfacing errors in result events
    let stderr_buffer: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));

    // Spawn persistent stdout reader — stays alive between turns
    let app_handle_stdout = app_handle.clone();
    let ws_id = workspace_id;
    let agents_stdout = Arc::clone(&agents);
    let perf_metrics_stdout = Arc::clone(&perf_metrics);
    let stderr_buf_stdout = Arc::clone(&stderr_buffer);
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let event_name = format!("agent-stream:{}", ws_id);
        let mut session_id_captured = false;

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            let frontend_events = parse_stream_line(&line);
            if !frontend_events.is_empty() {
              for mut frontend_event in frontend_events {
                if !session_id_captured {
                    session_id_captured =
                        try_capture_session_id(&frontend_event, &agents_stdout, ws_id);
                }

                // If error result has no message, pull from stderr buffer
                enrich_error_from_stderr(&mut frontend_event, &stderr_buf_stdout);

                log_stream_event(
                    &perf_metrics_stdout,
                    ws_id,
                    "event_emitted",
                    Some(stream_event_detail(&frontend_event)),
                );

                // In persistent mode, a result event means the turn is done (set Idle)
                if matches!(&frontend_event, FrontendStreamEvent::Result { .. }) {
                    {
                        let mut lock =
                            agents_stdout.lock().unwrap_or_else(|e| e.into_inner());
                        if let Some(agent) = lock.get_mut(&ws_id) {
                            agent.status = AgentStatus::Idle;
                        }
                    }
                    log_stream_event(&perf_metrics_stdout, ws_id, "status_changed", Some("Running -> Idle (result)".to_string()));
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
            } else if !is_known_skippable_line(&line) {
                let truncated = if line.len() > 200 { format!("{}...", &line[..200]) } else { line.clone() };
                log_stream_event(&perf_metrics_stdout, ws_id, "line_parse_failed", Some(truncated));
            }
        }

        // EOF — process exited unexpectedly, clean up
        log_stream_event(&perf_metrics_stdout, ws_id, "eof", None);
        persistent_agents
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&ws_id);
        let should_emit = {
            let mut lock = agents_stdout.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(agent) = lock.get_mut(&ws_id) {
                if agent.status == AgentStatus::Running {
                    agent.status = AgentStatus::Idle;
                    agent.pid = None;
                    true
                } else {
                    false
                }
            } else {
                false
            }
        };
        if should_emit {
            log_stream_event(&perf_metrics_stdout, ws_id, "status_changed", Some("Running -> Idle (eof)".to_string()));
            let _ = app_handle_stdout.emit(
                &format!("agent-status:{}", ws_id),
                &AgentStatusEvent {
                    workspace_id: ws_id,
                    status: AgentStatus::Idle,
                },
            );
        }
    });

    // Spawn task to read stderr (log it + push to perf stream log + buffer for error surfacing)
    let perf_metrics_stderr = Arc::clone(&perf_metrics);
    let ws_id_stderr = workspace_id;
    let stderr_buf_writer = Arc::clone(&stderr_buffer);
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        const MAX_STDERR_LINES: usize = 20;
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[claude-persistent-stderr:{}] {}", ws_id_stderr, line);
            {
                let mut buf = stderr_buf_writer.lock().unwrap_or_else(|e| e.into_inner());
                if buf.len() >= MAX_STDERR_LINES {
                    buf.pop_front();
                }
                buf.push_back(line.clone());
            }
            let truncated = if line.len() > 300 { format!("{}...", &line[..300]) } else { line };
            log_stream_event(&perf_metrics_stderr, ws_id_stderr, "stderr", Some(truncated));
        }
    });

    Ok((child, stdin))
}

/// If a result event has `is_error: true` but no `result` message,
/// pull recent stderr lines into the result so the error reason reaches the frontend.
fn enrich_error_from_stderr(
    event: &mut FrontendStreamEvent,
    stderr_buffer: &Arc<Mutex<VecDeque<String>>>,
) {
    if let FrontendStreamEvent::Result {
        is_error: true,
        ref mut result,
        ..
    } = event
    {
        if result.is_none() {
            let buf = stderr_buffer.lock().unwrap_or_else(|e| e.into_inner());
            if !buf.is_empty() {
                let joined: String = buf.iter().cloned().collect::<Vec<_>>().join("\n");
                let truncated = if joined.len() > 500 {
                    format!("...{}", &joined[joined.len() - 497..])
                } else {
                    joined
                };
                *result = Some(truncated);
            }
        }
    }
}

/// Parse a single NDJSON line from Claude Code's stream output
/// into frontend-friendly events. Returns a Vec because a single
/// assistant message can contain multiple content blocks (text, tool_use, image, etc.).
pub fn parse_stream_line(line: &str) -> Vec<FrontendStreamEvent> {
    let raw: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let event_type = match raw.get("type").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return vec![],
    };

    match event_type {
        "system" => {
            let session_id = raw.get("session_id").and_then(|v| v.as_str()).map(String::from);
            let message = raw.get("message").and_then(|v| v.as_str()).map(String::from);
            vec![FrontendStreamEvent::System {
                session_id,
                message,
            }]
        }
        "assistant" => {
            // Extract content blocks from the message
            let content = match raw
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array()) {
                Some(c) => c,
                None => return vec![],
            };

            // Process each content block — emit all of them
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
                    "image" => {
                        // Claude API image blocks: { type: "image", source: { type: "base64", media_type: "...", data: "..." } }
                        if let Some(source) = block.get("source") {
                            let media_type = source.get("media_type").and_then(|v| v.as_str()).unwrap_or("image/png").to_string();
                            if let Some(data) = source.get("data").and_then(|v| v.as_str()) {
                                events.push(FrontendStreamEvent::AssistantImage {
                                    media_type,
                                    data: data.to_string(),
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }

            events
        }
        "result" => {
            let is_error = raw.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false)
                || raw.get("subtype").and_then(|v| v.as_str()) == Some("error");
            // Try to extract result as string; fall back to stringified non-null value
            let result = raw.get("result").and_then(|v| {
                if let Some(s) = v.as_str() {
                    return Some(s.to_string());
                }
                if !v.is_null() {
                    return Some(v.to_string());
                }
                None
            });
            // For errors, also check fallback fields if result is still missing
            let result = result.or_else(|| {
                if !is_error {
                    return None;
                }
                raw.get("error")
                    .and_then(|v| v.as_str().map(String::from).or_else(|| if !v.is_null() { Some(v.to_string()) } else { None }))
                    .or_else(|| raw.get("error_message").and_then(|v| v.as_str()).map(String::from))
            });
            let session_id = raw.get("session_id").and_then(|v| v.as_str()).map(String::from);
            let duration_ms = raw.get("duration_ms").and_then(|v| v.as_u64());
            let duration_api_ms = raw.get("duration_api_ms").and_then(|v| v.as_u64());
            let total_cost_usd = raw.get("total_cost_usd").and_then(|v| v.as_f64());
            let num_turns = raw.get("num_turns").and_then(|v| v.as_u64()).map(|v| v as u32);
            let usage = raw.get("usage");
            let input_tokens = usage.and_then(|u| u.get("input_tokens")).and_then(|v| v.as_u64());
            let output_tokens = usage.and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64());
            let cache_read_tokens = usage.and_then(|u| u.get("cache_read_input_tokens")).and_then(|v| v.as_u64());
            let cache_creation_tokens = usage.and_then(|u| u.get("cache_creation_input_tokens")).and_then(|v| v.as_u64());
            vec![FrontendStreamEvent::Result {
                is_error,
                result,
                session_id,
                duration_ms,
                duration_api_ms,
                total_cost_usd,
                num_turns,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_creation_tokens,
            }]
        }
        // Permission request: emitted when CLI needs user approval for a tool call
        "input_request" => {
            // Extract tool info from the permission request
            let tool_name = raw.get("tool")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .or_else(|| raw.get("tool_name").and_then(|v| v.as_str()))
                .unwrap_or("unknown")
                .to_string();
            let input = raw.get("tool")
                .and_then(|v| v.get("input"))
                .or_else(|| raw.get("input"))
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            vec![FrontendStreamEvent::PermissionRequest {
                tool_name,
                input,
            }]
        }
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_stream_line tests ---

    #[test]
    fn test_parse_system_event() {
        let line = r#"{"type":"system","session_id":"sess-123","message":"Connected"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::System { session_id, message } => {
                assert_eq!(session_id.as_deref(), Some("sess-123"));
                assert_eq!(message.as_deref(), Some("Connected"));
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn test_parse_assistant_text_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::AssistantText { text } => {
                assert_eq!(text, "Hello world");
            }
            _ => panic!("Expected AssistantText event"),
        }
    }

    #[test]
    fn test_parse_tool_use_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tool-1","name":"read_file","input":{"path":"/tmp"}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::ToolUse { id, name, input } => {
                assert_eq!(id, "tool-1");
                assert_eq!(name, "read_file");
                assert_eq!(input["path"], "/tmp");
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn test_parse_tool_result_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"tool-1","content":"file contents"}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::ToolResult { tool_use_id, content } => {
                assert_eq!(tool_use_id, "tool-1");
                assert_eq!(content, "file contents");
            }
            _ => panic!("Expected ToolResult event"),
        }
    }

    #[test]
    fn test_parse_assistant_image_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBOR..."}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::AssistantImage { media_type, data } => {
                assert_eq!(media_type, "image/png");
                assert_eq!(data, "iVBOR...");
            }
            _ => panic!("Expected AssistantImage event"),
        }
    }

    #[test]
    fn test_parse_multi_block_assistant_message() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Here is a screenshot:"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"abc123"}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 2);
        assert!(matches!(&events[0], FrontendStreamEvent::AssistantText { .. }));
        assert!(matches!(&events[1], FrontendStreamEvent::AssistantImage { .. }));
    }

    #[test]
    fn test_parse_result_event() {
        let line = r#"{"type":"result","is_error":false,"result":"Done","session_id":"sess-1","duration_ms":1000,"total_cost_usd":0.05,"num_turns":3,"usage":{"input_tokens":100,"output_tokens":200}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result {
                is_error,
                result,
                session_id,
                duration_ms,
                total_cost_usd,
                num_turns,
                input_tokens,
                output_tokens,
                ..
            } => {
                assert!(!is_error);
                assert_eq!(result.as_deref(), Some("Done"));
                assert_eq!(session_id.as_deref(), Some("sess-1"));
                assert_eq!(*duration_ms, Some(1000));
                assert_eq!(*total_cost_usd, Some(0.05));
                assert_eq!(*num_turns, Some(3));
                assert_eq!(*input_tokens, Some(100));
                assert_eq!(*output_tokens, Some(200));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_result_error_via_subtype() {
        let line = r#"{"type":"result","subtype":"error","result":"Something went wrong"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result { is_error, .. } => assert!(is_error),
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_permission_request() {
        let line = r#"{"type":"input_request","tool":{"name":"bash","input":{"command":"ls"}}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::PermissionRequest { tool_name, input } => {
                assert_eq!(tool_name, "bash");
                assert_eq!(input["command"], "ls");
            }
            _ => panic!("Expected PermissionRequest event"),
        }
    }

    #[test]
    fn test_parse_invalid_json_returns_empty() {
        assert!(parse_stream_line("not json").is_empty());
    }

    #[test]
    fn test_parse_unknown_type_returns_empty() {
        let line = r#"{"type":"unknown_event","data":"something"}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    // --- is_known_skippable_line tests ---

    #[test]
    fn test_skippable_user_event() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}"#;
        assert!(is_known_skippable_line(line));
    }

    #[test]
    fn test_skippable_rate_limit_event() {
        let line = r#"{"type":"rate_limit_event","retry_after":1.5}"#;
        assert!(is_known_skippable_line(line));
    }

    #[test]
    fn test_skippable_assistant_metadata() {
        // Assistant message without extractable content blocks (metadata-only)
        let line = r#"{"type":"assistant","message":{"model":"claude-sonnet-4-20250514","stop_reason":"end_turn"}}"#;
        assert!(parse_stream_line(line).is_empty()); // not a frontend event
        assert!(is_known_skippable_line(line));      // but known-skippable
    }

    #[test]
    fn test_not_skippable_invalid_json() {
        assert!(!is_known_skippable_line("not json"));
    }

    #[test]
    fn test_not_skippable_unknown_type() {
        let line = r#"{"type":"totally_unknown","data":"x"}"#;
        assert!(!is_known_skippable_line(line));
    }

    // --- build_env_vars tests ---

    #[test]
    fn test_build_env_vars_includes_fury_vars() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_env_vars(&ws, &repo, &settings);
        assert_eq!(env.get("FURY_WORKSPACE_NAME").unwrap(), "test-workspace");
        assert_eq!(env.get("FURY_DEFAULT_BRANCH").unwrap(), "main");
        assert!(env.contains_key("FURY_PORT"));
        assert!(env.contains_key("FURY_ROOT_PATH"));
        assert!(env.contains_key("FURY_WORKSPACE_PATH"));
    }

    #[test]
    fn test_build_env_vars_includes_provider_env_vars() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings.provider.env_vars.insert("ANTHROPIC_API_KEY".to_string(), "sk-test".to_string());
        let env = build_env_vars(&ws, &repo, &settings);
        assert_eq!(env.get("ANTHROPIC_API_KEY").unwrap(), "sk-test");
    }

    #[test]
    fn test_build_repo_env_vars() {
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_repo_env_vars(&repo, &settings);
        assert!(env.contains_key("FURY_ROOT_PATH"));
        assert_eq!(env.get("FURY_DEFAULT_BRANCH").unwrap(), "main");
        assert!(!env.contains_key("FURY_WORKSPACE_NAME")); // repo mode doesn't have this
    }

    // --- build_common_args tests ---

    #[test]
    fn test_build_common_args_basic() {
        let args = build_common_args(None, &[], None, None, false, false);
        assert!(args.contains(&"--output-format".to_string()));
        assert!(args.contains(&"stream-json".to_string()));
        assert!(args.contains(&"--verbose".to_string()));
        assert!(args.contains(&"--dangerously-skip-permissions".to_string()));
    }

    #[test]
    fn test_build_common_args_safe_mode() {
        let args = build_common_args(None, &[], None, None, true, false);
        assert!(!args.contains(&"--dangerously-skip-permissions".to_string()));
    }

    #[test]
    fn test_build_common_args_with_session_id() {
        let args = build_common_args(Some("sess-123"), &[], None, None, false, false);
        assert!(args.contains(&"--resume".to_string()));
        assert!(args.contains(&"sess-123".to_string()));
    }

    #[test]
    fn test_build_common_args_with_model() {
        let args = build_common_args(None, &[], None, Some("sonnet"), false, false);
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"sonnet".to_string()));
    }

    #[test]
    fn test_build_common_args_invalid_model_ignored() {
        let args = build_common_args(None, &[], None, Some("gpt-4"), false, false);
        assert!(!args.contains(&"--model".to_string()));
    }

    #[test]
    fn test_build_common_args_with_linked_dirs() {
        let dirs = vec![std::path::PathBuf::from("/tmp/dir1")];
        let args = build_common_args(None, &dirs, None, None, false, false);
        assert!(args.contains(&"--add-dir".to_string()));
        assert!(args.contains(&"/tmp/dir1".to_string()));
    }

    #[test]
    fn test_build_common_args_disable_plan_mode() {
        let args = build_common_args(None, &[], None, None, false, true);
        let system_prompt = args.last().unwrap();
        assert!(system_prompt.contains("Do not enter plan mode"));
    }
}
