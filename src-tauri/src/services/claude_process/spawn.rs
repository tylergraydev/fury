use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, FrontendStreamEvent};
use crate::services::perf_server::SharedPerfMetrics;
use crate::state::app_state::PersistentAgentHandle;

use super::setup::{build_command, build_common_args, find_claude_binary};
use super::stream::{
    enrich_error_from_stderr, is_known_skippable_line, log_stream_event, parse_stream_line,
    stream_event_detail, try_capture_session_id,
};

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
    container_ctx: Option<crate::models::devcontainer::ContainerExecContext>,
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

    let mut cmd = build_command(&claude_bin, &args, worktree_path, &env_vars, container_ctx.as_ref());
    cmd
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
    container_ctx: Option<crate::models::devcontainer::ContainerExecContext>,
) -> Result<(Child, ChildStdin), AppError> {
    let claude_bin = find_claude_binary()?;

    if disable_thinking {
        env_vars.insert("MAX_THINKING_TOKENS".to_string(), "0".to_string());
    }

    let args = build_common_args(session_id, &linked_dirs, system_prompt_additions, model, safe_mode, disable_plan_mode);

    let mut cmd = build_command(&claude_bin, &args, worktree_path, &env_vars, container_ctx.as_ref());
    cmd
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
