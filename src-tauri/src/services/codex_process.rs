use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, AgentStatusEvent, FrontendStreamEvent};
use crate::services::utils::safe_truncate;
use crate::models::repository::Repository;
use crate::models::settings::{AppSettings, ProviderConfig};
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
    provider_override: Option<&ProviderConfig>,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

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

    let provider = provider_override.unwrap_or(&settings.provider);
    for (key, value) in &provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    env
}

/// Build environment variables for the Codex process (repo-direct mode).
pub fn build_repo_env_vars(
    repo: &Repository,
    settings: &AppSettings,
    provider_override: Option<&ProviderConfig>,
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

    let provider = provider_override.unwrap_or(&settings.provider);
    for (key, value) in &provider.env_vars {
        env.insert(key.clone(), value.clone());
    }

    env
}

use crate::services::utils::is_valid_env_key;

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
#[allow(clippy::too_many_arguments)]
pub async fn spawn_and_stream(
    workspace_id: Uuid,
    message: &str,
    worktree_path: &Path,
    env_vars: HashMap<String, String>,
    model: Option<&str>,
    app_handle: AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    container_ctx: Option<crate::models::devcontainer::ContainerExecContext>,
) -> Result<(Child, ChildStdin), AppError> {
    let codex_bin = find_codex_binary()?;
    let args = build_args(message, model);

    let mut cmd = if let Some(ref ctx) = container_ctx {
        let docker_bin = which::which("docker").unwrap_or_else(|_| std::path::PathBuf::from("docker"));
        let mut docker_args = vec![
            "exec".to_string(), "-i".to_string(),
            "-w".to_string(), ctx.container_working_dir.clone(),
        ];
        for (key, value) in &env_vars {
            if !is_valid_env_key(key) {
                eprintln!("[codex-spawn] Skipping invalid env var key: {:?}", key);
                continue;
            }
            docker_args.push("-e".to_string());
            docker_args.push(format!("{}={}", key, value));
        }
        docker_args.push(ctx.container_id.clone());
        docker_args.push(codex_bin.to_string_lossy().to_string());
        docker_args.extend(args.iter().cloned());
        let mut c = Command::new(&docker_bin);
        c.args(&docker_args);
        c
    } else {
        let mut c = Command::new(&codex_bin);
        c.args(&args)
            .current_dir(worktree_path)
            .envs(&env_vars);
        c
    };
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

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
                safe_truncate(line, 200)
            );
            return None;
        }
    };
    let event_type = match raw.get("type").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => {
            eprintln!(
                "[codex-parse] JSONL missing 'type' field: {}",
                safe_truncate(line, 200)
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
                    "image" => {
                        // Codex image blocks: { type: "image", url: "..." } or base64 source
                        if let Some(url) = block.get("url").and_then(|v| v.as_str()) {
                            // URL-based image — encode as data with media_type hint
                            return Some(FrontendStreamEvent::AssistantImage {
                                media_type: "image/png".to_string(),
                                data: url.to_string(),
                            });
                        }
                        if let Some(source) = block.get("source") {
                            let media_type = source.get("media_type").and_then(|v| v.as_str()).unwrap_or("image/png").to_string();
                            if let Some(data) = source.get("data").and_then(|v| v.as_str()) {
                                return Some(FrontendStreamEvent::AssistantImage {
                                    media_type,
                                    data: data.to_string(),
                                });
                            }
                        }
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
                safe_truncate(line, 200)
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
    fn test_parse_image_content_block_url() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"image","url":"https://example.com/img.png"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantImage { media_type, data } => {
                assert_eq!(media_type, "image/png");
                assert_eq!(data, "https://example.com/img.png");
            }
            _ => panic!("Expected AssistantImage event"),
        }
    }

    #[test]
    fn test_parse_unknown_content_block_type() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"audio","data":"..."}]}}"#;
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

    // --- build_env_vars tests ---

    #[test]
    fn test_build_env_vars_basic() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert_eq!(env.get("FURY_WORKSPACE_NAME").unwrap(), "test-workspace");
        assert_eq!(env.get("FURY_DEFAULT_BRANCH").unwrap(), "main");
        assert!(env.contains_key("FURY_PORT"));
        assert!(env.contains_key("FURY_ROOT_PATH"));
        assert!(env.contains_key("FURY_WORKSPACE_PATH"));
    }

    #[test]
    fn test_build_env_vars_with_provider_override() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings.provider.env_vars.insert("OPENAI_API_KEY".to_string(), "sk-global".to_string());
        let override_config = crate::models::settings::ProviderConfig {
            provider_type: crate::models::settings::ProviderType::Anthropic,
            env_vars: std::collections::HashMap::from([("OPENAI_API_KEY".to_string(), "sk-repo".to_string())]),
        };
        let env = build_env_vars(&ws, &repo, &settings, Some(&override_config));
        assert_eq!(env.get("OPENAI_API_KEY").unwrap(), "sk-repo");
    }

    #[test]
    fn test_build_env_vars_includes_provider_vars() {
        let ws = crate::test_helpers::test_workspace(uuid::Uuid::new_v4());
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings.provider.env_vars.insert("OPENAI_API_KEY".to_string(), "sk-test".to_string());
        let env = build_env_vars(&ws, &repo, &settings, None);
        assert_eq!(env.get("OPENAI_API_KEY").unwrap(), "sk-test");
    }

    // --- build_repo_env_vars tests ---

    #[test]
    fn test_build_repo_env_vars_basic() {
        let repo = crate::test_helpers::test_repo();
        let settings = crate::test_helpers::test_settings();
        let env = build_repo_env_vars(&repo, &settings, None);
        assert!(env.contains_key("FURY_ROOT_PATH"));
        assert_eq!(env.get("FURY_DEFAULT_BRANCH").unwrap(), "main");
        assert!(!env.contains_key("FURY_WORKSPACE_NAME"));
        assert!(!env.contains_key("FURY_WORKSPACE_PATH"));
        assert!(!env.contains_key("FURY_PORT"));
    }

    #[test]
    fn test_build_repo_env_vars_with_provider_override() {
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings.provider.env_vars.insert("OPENAI_API_KEY".to_string(), "sk-global".to_string());
        let override_config = crate::models::settings::ProviderConfig {
            provider_type: crate::models::settings::ProviderType::Anthropic,
            env_vars: std::collections::HashMap::from([("OPENAI_API_KEY".to_string(), "sk-repo".to_string())]),
        };
        let env = build_repo_env_vars(&repo, &settings, Some(&override_config));
        assert_eq!(env.get("OPENAI_API_KEY").unwrap(), "sk-repo");
    }

    #[test]
    fn test_build_repo_env_vars_includes_provider_vars() {
        let repo = crate::test_helpers::test_repo();
        let mut settings = crate::test_helpers::test_settings();
        settings.provider.env_vars.insert("MY_VAR".to_string(), "val".to_string());
        let env = build_repo_env_vars(&repo, &settings, None);
        assert_eq!(env.get("MY_VAR").unwrap(), "val");
    }

    // --- Additional parse_codex_line edge cases ---

    #[test]
    fn test_parse_codex_line_missing_type_field() {
        let line = r#"{"data":"something"}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_codex_line_thread_started_id_fallback() {
        let line = r#"{"type":"thread.started","id":"alt-id"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::System { session_id, .. } => {
                assert_eq!(session_id, Some("alt-id".to_string()));
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn test_parse_codex_line_thread_started_no_id() {
        let line = r#"{"type":"thread.started"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::System { session_id, .. } => {
                assert!(session_id.is_none());
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn test_parse_codex_line_item_message_no_content() {
        let line = r#"{"type":"item.message","item":{"role":"assistant"}}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_codex_line_function_call_with_call_id() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"function_call","call_id":"c1","name":"shell","arguments":"{}"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolUse { id, .. } => {
                assert_eq!(id, "c1");
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn test_parse_codex_line_function_call_output_missing_output() {
        let line = r#"{"type":"item.function_call_output","item":{"call_id":"c1"}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolResult { content, .. } => {
                assert_eq!(content, "");
            }
            _ => panic!("Expected ToolResult"),
        }
    }

    #[test]
    fn test_parse_codex_line_reasoning_no_summary_or_text() {
        let line = r#"{"type":"item.reasoning","item":{}}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_codex_line_error_with_detail_field() {
        let line = r#"{"type":"error","detail":"Detailed error info"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result { result, .. } => {
                assert_eq!(result.as_deref(), Some("Detailed error info"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_codex_line_error_with_reason_field() {
        let line = r#"{"type":"error","reason":"Context too long"}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::Result { result, .. } => {
                assert_eq!(result.as_deref(), Some("Context too long"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_codex_line_image_source_block() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"image","source":{"media_type":"image/jpeg","data":"base64data"}}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantImage { media_type, data } => {
                assert_eq!(media_type, "image/jpeg");
                assert_eq!(data, "base64data");
            }
            _ => panic!("Expected AssistantImage"),
        }
    }

    #[test]
    fn test_parse_codex_line_image_source_default_media_type() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"image","source":{"data":"base64data"}}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::AssistantImage { media_type, .. } => {
                assert_eq!(media_type, "image/png");
            }
            _ => panic!("Expected AssistantImage"),
        }
    }

    #[test]
    fn test_parse_codex_line_image_source_without_data() {
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"image","source":{"media_type":"image/png"}}]}}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_codex_line_item_message_no_item() {
        let line = r#"{"type":"item.message"}"#;
        assert!(parse_codex_line(line).is_none());
    }

    #[test]
    fn test_parse_codex_line_function_call_no_arguments() {
        // When arguments key is missing, defaults to "{}" which parses to empty object
        let line = r#"{"type":"item.message","item":{"role":"assistant","content":[{"type":"function_call","id":"c1","name":"shell"}]}}"#;
        let event = parse_codex_line(line).unwrap();
        match event {
            FrontendStreamEvent::ToolUse { input, .. } => {
                assert_eq!(input, serde_json::json!({}));
            }
            _ => panic!("Expected ToolUse"),
        }
    }

    #[test]
    fn test_build_args_empty_message() {
        let args = build_args("", None);
        assert_eq!(args, vec!["exec", "--json", "--full-auto", ""]);
    }
}
