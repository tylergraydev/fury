use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, FrontendStreamEvent};
use crate::models::repository::Repository;
use crate::models::settings::AppSettings;
use crate::models::workspace::Workspace;

/// Locate the `codex` binary in PATH.
pub fn find_codex_binary() -> Result<PathBuf, AppError> {
    which::which("codex").map_err(|_| {
        AppError::AgentError(
            "Codex CLI not found in PATH. Install it with: npm install -g @openai/codex"
                .to_string(),
        )
    })
}

/// Build environment variables for the Codex process (workspace mode).
pub fn build_env_vars(
    workspace: &Workspace,
    repo: &Repository,
    settings: &AppSettings,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

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

    for (key, value) in &settings.provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    env
}

/// Build environment variables for the Codex process (repo-direct mode).
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

/// Build CLI arguments for `codex exec`.
///
/// Always passes `--full-auto` because Codex CLI without it expects
/// TTY-based interactive approval, which is incompatible with piped stdin.
fn build_args(
    message: &str,
    model: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--full-auto".to_string(),
    ];

    if let Some(m) = model {
        args.push("--model".to_string());
        args.push(m.to_string());
    }

    // Prompt must be the final positional argument, after all flags
    args.push(message.to_string());

    args
}

/// Spawn Codex CLI and stream its JSONL output via Tauri events.
///
/// Uses `codex exec --json --full-auto` (one-shot mode). The process exits
/// after completing the task. Returns a tuple of the child process handle
/// and its stdin handle.
pub async fn spawn_and_stream(
    workspace_id: Uuid,
    message: &str,
    worktree_path: &Path,
    env_vars: HashMap<String, String>,
    model: Option<&str>,
    app_handle: AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
) -> Result<(Child, ChildStdin), AppError> {
    let codex_bin = find_codex_binary()?;
    let args = build_args(message, model);

    let mut cmd = Command::new(&codex_bin);
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
        cmd.creation_flags(0x08000200); // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::AgentError(format!("Failed to spawn Codex CLI: {}", e))
    })?;

    let stdin = child.stdin.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Codex stdin".to_string())
    })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Codex stdout".to_string())
    })?;

    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture Codex stderr".to_string())
    })?;

    // Spawn task to read stdout (JSONL stream)
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

            if let Some(frontend_event) = parse_codex_line(&line) {
                if !session_id_captured {
                    if let FrontendStreamEvent::System {
                        session_id: Some(ref sid),
                        ..
                    } = &frontend_event
                    {
                        let mut lock =
                            agents.lock().unwrap_or_else(|e| e.into_inner());
                        if let Some(agent) = lock.get_mut(&ws_id) {
                            agent.session_id = Some(sid.clone());
                        }
                        session_id_captured = true;
                    }
                }

                let _ = app_handle_stdout.emit(&event_name, &frontend_event);
            }
        }

        // EOF — process exited; ensure status transitions away from Running
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
            let _ = app_handle_stdout.emit(
                &format!("agent-status:{}", ws_id),
                &AgentStatusEvent {
                    workspace_id: ws_id,
                    status: AgentStatus::Idle,
                },
            );
        }
    });

    // Spawn task to read stderr (log it, don't emit)
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[codex-stderr:{}] {}", ws_id, line);
        }
    });

    Ok((child, stdin))
}

/// Parse a single JSONL line from Codex CLI's `--json` output
/// into a frontend-friendly event.
///
/// Codex event types:
/// - `thread.started` → System
/// - `item.message` (assistant text) → AssistantText
/// - `item.message` (function_call) → ToolUse
/// - `item.function_call_output` → ToolResult
/// - `item.reasoning` → AssistantText
/// - `turn.completed` → Result (success)
/// - `turn.failed` / `error` → Result (error)
pub fn parse_codex_line(line: &str) -> Option<FrontendStreamEvent> {
    let raw: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            eprintln!(
                "[codex-parse] Failed to parse JSONL: {} -- line: {}",
                e,
                &line[..line.len().min(200)]
            );
            return None;
        }
    };
    let event_type = match raw.get("type").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => {
            eprintln!(
                "[codex-parse] JSONL missing 'type' field: {}",
                &line[..line.len().min(200)]
            );
            return None;
        }
    };

    match event_type {
        "thread.started" => {
            let thread_id = raw
                .get("thread_id")
                .or_else(|| raw.get("id"))
                .and_then(|v| v.as_str())
                .map(String::from);
            Some(FrontendStreamEvent::System {
                session_id: thread_id,
                message: Some("Codex session started".to_string()),
            })
        }

        "item.message" => {
            let item = raw.get("item")?;
            let role = item.get("role").and_then(|r| r.as_str()).unwrap_or("");

            if role != "assistant" {
                return None;
            }

            let content = item.get("content").and_then(|c| c.as_array())?;

            for block in content {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" | "output_text" => {
                        let text = block.get("text").and_then(|t| t.as_str())?;
                        return Some(FrontendStreamEvent::AssistantText {
                            text: text.to_string(),
                        });
                    }
                    "function_call" => {
                        let id = block
                            .get("id")
                            .or_else(|| block.get("call_id"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let name = block
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let arguments = block
                            .get("arguments")
                            .and_then(|v| v.as_str())
                            .unwrap_or("{}");
                        let input = serde_json::from_str(arguments)
                            .unwrap_or(serde_json::Value::Null);
                        return Some(FrontendStreamEvent::ToolUse { id, name, input });
                    }
                    _ => {}
                }
            }
            None
        }

        "item.function_call_output" => {
            let item = raw.get("item")?;
            let call_id = item
                .get("call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let output = item
                .get("output")
                .map(|v| {
                    if let Some(s) = v.as_str() {
                        s.to_string()
                    } else {
                        v.to_string()
                    }
                })
                .unwrap_or_default();
            Some(FrontendStreamEvent::ToolResult {
                tool_use_id: call_id,
                content: output,
            })
        }

        "item.reasoning" => {
            let item = raw.get("item")?;
            let text = item
                .get("summary")
                .or_else(|| item.get("text"))
                .and_then(|t| t.as_str())?;
            Some(FrontendStreamEvent::AssistantText {
                text: text.to_string(),
            })
        }

        "turn.completed" => Some(FrontendStreamEvent::Result {
            is_error: false,
            result: None,
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        }),

        "turn.failed" | "error" => {
            let message = raw
                .get("message")
                .or_else(|| {
                    raw.get("error").and_then(|e| {
                        if e.is_object() {
                            e.get("message")
                        } else {
                            Some(e)
                        }
                    })
                })
                .or_else(|| raw.get("detail"))
                .or_else(|| raw.get("reason"))
                .and_then(|v| v.as_str())
                .map(String::from)
                .or_else(|| Some(format!("Codex error: {}", raw)));
            Some(FrontendStreamEvent::Result {
                is_error: true,
                result: message,
                session_id: None,
                duration_ms: None,
                duration_api_ms: None,
                total_cost_usd: None,
                num_turns: None,
                input_tokens: None,
                output_tokens: None,
                cache_read_tokens: None,
                cache_creation_tokens: None,
            })
        }

        _ => {
            eprintln!(
                "[codex-parse] Unrecognized event type '{}': {}",
                event_type,
                &line[..line.len().min(200)]
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_thread_started() {
        let line = r#"{"type":"thread.started","thread_id":"th_abc123"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::System { session_id, message } => {
                assert_eq!(session_id, Some("th_abc123".to_string()));
                assert_eq!(message, Some("Codex session started".to_string()));
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn test_parse_assistant_text() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantText { text } => {
                assert_eq!(text, "Hello world");
            }
            _ => panic!("Expected AssistantText event"),
        }
    }

    #[test]
    fn test_parse_function_call() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"function_call","id":"call_1","name":"shell","arguments":"{\"command\":\"ls\"}"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolUse { id, name, input } => {
                assert_eq!(id, "call_1");
                assert_eq!(name, "shell");
                assert_eq!(input["command"], "ls");
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn test_parse_function_call_output() {
        let line = r#"{"type":"item.function_call_output","item":{"call_id":"call_1","output":"file1.txt\nfile2.txt"}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolResult {
                tool_use_id,
                content,
            } => {
                assert_eq!(tool_use_id, "call_1");
                assert_eq!(content, "file1.txt\nfile2.txt");
            }
            _ => panic!("Expected ToolResult event"),
        }
    }

    #[test]
    fn test_parse_turn_completed() {
        let line = r#"{"type":"turn.completed"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result { is_error, .. } => {
                assert!(!is_error);
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_turn_failed() {
        let line = r#"{"type":"turn.failed","message":"Rate limit exceeded"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert_eq!(result, Some("Rate limit exceeded".to_string()));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_error() {
        let line = r#"{"type":"error","message":"API key invalid"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert_eq!(result, Some("API key invalid".to_string()));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_reasoning() {
        let line = r#"{"type":"item.reasoning","item":{"summary":"Analyzing the codebase structure"}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantText { text } => {
                assert_eq!(text, "Analyzing the codebase structure");
            }
            _ => panic!("Expected AssistantText event"),
        }
    }

    #[test]
    fn test_parse_unknown_event() {
        let line = r#"{"type":"unknown.event","data":"foo"}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse_codex_line("not json").is_none());
    }

    #[test]
    fn test_parse_non_assistant_message() {
        let line = r#"{"type":"item.message","item":{"role":"user","content":[{"type":"text","text":"Hi"}]}}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_output_text_block() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"output_text","text":"Response via output_text"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantText { text } => {
                assert_eq!(text, "Response via output_text");
            }
            _ => panic!("Expected AssistantText event"),
        }
    }

    #[test]
    fn test_parse_empty_content_array() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[]}}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_unknown_content_block_type() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"image","url":"..."}]}}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_function_call_malformed_arguments() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"function_call","id":"call_1","name":"shell","arguments":"not valid json"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolUse { input, .. } => {
                assert_eq!(input, serde_json::Value::Null);
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn test_parse_error_nested_message() {
        let line = r#"{"type":"error","error":{"message":"Nested error message","code":"rate_limit"}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert_eq!(result, Some("Nested error message".to_string()));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_error_string_error_field() {
        let line = r#"{"type":"error","error":"Rate limit exceeded"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert_eq!(result, Some("Rate limit exceeded".to_string()));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_error_no_message_fallback() {
        let line = r#"{"type":"error","code":500}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert!(result.unwrap().contains("Codex error:"));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_reasoning_text_fallback() {
        let line = r#"{"type":"item.reasoning","item":{"text":"Thinking about the problem"}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantText { text } => {
                assert_eq!(text, "Thinking about the problem");
            }
            _ => panic!("Expected AssistantText event"),
        }
    }

    #[test]
    fn test_parse_function_call_output_json_value() {
        let line = r#"{"type":"item.function_call_output","item":{"call_id":"call_2","output":{"exitCode":0,"stdout":"ok"}}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolResult {
                tool_use_id,
                content,
            } => {
                assert_eq!(tool_use_id, "call_2");
                assert!(content.contains("exitCode"));
            }
            _ => panic!("Expected ToolResult event"),
        }
    }

    #[test]
    fn test_build_args_basic() {
        let args = build_args("fix the bug", None);
        assert_eq!(args, vec!["exec", "--json", "--full-auto", "fix the bug"]);
    }

    #[test]
    fn test_build_args_with_model() {
        let args = build_args("fix the bug", Some("o3"));
        assert_eq!(
            args,
            vec!["exec", "--json", "--full-auto", "--model", "o3", "fix the bug"]
        );
    }
}
