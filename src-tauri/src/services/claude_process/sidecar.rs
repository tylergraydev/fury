use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, FrontendStreamEvent};

use super::stream::try_capture_session_id_with_db;
use crate::db::Database;

/// Handle to the long-lived Node.js sidecar process.
/// The sidecar wraps the Claude Agent SDK and communicates via NDJSON on stdin/stdout.
pub struct SidecarHandle {
    /// The child process handle — kept alive to prevent the sidecar from being dropped.
    #[allow(dead_code)]
    pub child: Child,
    pub stdin: ChildStdin,
}

/// Commands sent from Rust to the Node.js sidecar via stdin NDJSON.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub enum SidecarCommand {
    Query {
        id: String,
        prompt: String,
        cwd: String,
        #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(rename = "systemPrompt", skip_serializing_if = "Option::is_none")]
        system_prompt: Option<String>,
        #[serde(rename = "permissionMode")]
        permission_mode: String,
        #[serde(rename = "envVars", skip_serializing_if = "Option::is_none")]
        env_vars: Option<HashMap<String, String>>,
        #[serde(rename = "additionalDirs", skip_serializing_if = "Option::is_none")]
        additional_dirs: Option<Vec<String>>,
        #[serde(rename = "disableThinking", skip_serializing_if = "Option::is_none")]
        disable_thinking: Option<bool>,
        #[serde(rename = "disablePlanMode", skip_serializing_if = "Option::is_none")]
        disable_plan_mode: Option<bool>,
    },
    PermissionResponse {
        id: String,
        approved: bool,
        #[serde(rename = "updatedPermissions", skip_serializing_if = "Option::is_none")]
        updated_permissions: Option<serde_json::Value>,
        #[serde(rename = "decisionClassification", skip_serializing_if = "Option::is_none")]
        decision_classification: Option<String>,
    },
    Interrupt {
        id: String,
    },
    #[allow(dead_code)]
    Shutdown,
}

/// Start the Node.js sidecar process.
///
/// The sidecar script location:
/// - Dev: `<CARGO_MANIFEST_DIR>/sidecar/dist/claude-agent-sidecar.cjs`
/// - Production: `<resource_dir>/claude-agent-sidecar.cjs`
///
/// A background task reads stdout NDJSON, routes events by the `id` field
/// (which maps to workspace UUID), and emits them to the frontend.
pub fn start_sidecar(
    app: &AppHandle,
    agents: Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    db: Arc<Mutex<Option<Database>>>,
) -> Result<SidecarHandle, AppError> {
    let sidecar_path = find_sidecar_path(app)?;

    let node = which::which("node").map_err(|_| {
        AppError::AgentError(
            "Node.js not found in PATH. Required for Claude Agent SDK.".to_string(),
        )
    })?;

    let mut cmd = tokio::process::Command::new(node);
    cmd.arg(&sidecar_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Strip Claude Code env vars to prevent nested-session detection
    cmd.env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .env_remove("CLAUDE_AGENT_SDK_VERSION");

    let mut child = cmd.kill_on_drop(true).spawn().map_err(|e| {
        AppError::AgentError(format!("Failed to start sidecar: {}", e))
    })?;

    let stdin = child.stdin.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture sidecar stdin".to_string())
    })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::AgentError("Failed to capture sidecar stdout".to_string())
    })?;

    // Background task: read NDJSON from stdout, route events to workspaces
    let app_clone = app.clone();
    let agents_clone = Arc::clone(&agents);
    let pending_perms = app
        .state::<crate::state::app_state::AppState>()
        .pending_permissions
        .clone();
    let db_clone = Arc::clone(&db);
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if let Err(e) =
                handle_sidecar_line(&line, &app_clone, &agents_clone, &pending_perms, &db_clone)
            {
                eprintln!("[sidecar] Error handling line: {}", e);
            }
        }

        eprintln!("[sidecar] Sidecar process exited (stdout EOF)");
    });

    // Background task: log stderr
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[sidecar:stderr] {}", line);
            }
        });
    }

    Ok(SidecarHandle { child, stdin })
}

/// Send a command to the sidecar via stdin NDJSON.
pub async fn send_command(
    handle: &mut SidecarHandle,
    cmd: &SidecarCommand,
) -> Result<(), AppError> {
    let json = serde_json::to_string(cmd).map_err(|e| {
        AppError::AgentError(format!("Failed to serialize sidecar command: {}", e))
    })?;
    handle
        .stdin
        .write_all(format!("{}\n", json).as_bytes())
        .await
        .map_err(|e| {
            AppError::AgentError(format!("Failed to write to sidecar stdin: {}", e))
        })?;
    handle.stdin.flush().await.map_err(|e| {
        AppError::AgentError(format!("Failed to flush sidecar stdin: {}", e))
    })?;
    Ok(())
}

/// Parse a sidecar NDJSON line and extract the workspace UUID and raw JSON.
/// This is the pure parsing step, separated from side-effectful event emission.
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn parse_sidecar_line_id(line: &str) -> Result<(Uuid, serde_json::Value), String> {
    let raw: serde_json::Value =
        serde_json::from_str(line).map_err(|e| format!("Invalid JSON: {e}"))?;
    let id_str = raw
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing 'id' field".to_string())?;
    let uuid = Uuid::parse_str(id_str).map_err(|e| format!("Invalid workspace UUID: {e}"))?;
    Ok((uuid, raw))
}

/// Determine if a sidecar event's raw JSON indicates the agent run completed.
pub(crate) fn is_result_event(raw: &serde_json::Value) -> bool {
    raw.get("type").and_then(|v| v.as_str()) == Some("result")
}

/// Process a single NDJSON line from the sidecar stdout.
/// Extracts the `id` field to determine the workspace, then parses
/// the event and emits it to the frontend.
pub(crate) fn handle_sidecar_line<R: tauri::Runtime>(
    line: &str,
    app: &tauri::AppHandle<R>,
    agents: &Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    pending_permissions: &Arc<Mutex<HashMap<Uuid, FrontendStreamEvent>>>,
    db: &Arc<Mutex<Option<Database>>>,
) -> Result<(), String> {
    let (workspace_id, raw) = parse_sidecar_line_id(line)?;

    // Parse stream events using the existing parser
    let events = super::parse_stream_line(line);

    for event in &events {
        // Capture session_id from system/result events and persist to DB
        try_capture_session_id_with_db(event, agents, workspace_id, Some(db));

        // Track pending permission requests so they can be re-emitted after HMR
        match event {
            FrontendStreamEvent::PermissionRequest { .. } => {
                pending_permissions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .insert(workspace_id, event.clone());
            }
            FrontendStreamEvent::Result { .. } => {
                pending_permissions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&workspace_id);
            }
            _ => {}
        }

        // Emit to frontend
        let event_name = format!("agent-stream:{}", workspace_id);
        let _ = app.emit(&event_name, event);
    }

    // Check for result event — transition agent back to Idle
    if is_result_event(&raw) {
        let mut lock = agents.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(agent) = lock.get_mut(&workspace_id) {
            agent.status = AgentStatus::Idle;
        }
        let status_event = lock
            .get(&workspace_id)
            .cloned()
            .unwrap_or_else(|| AgentInfo::new(workspace_id));
        // Drop the lock before emitting
        drop(lock);
        let _ = app.emit(&format!("agent-status:{}", workspace_id), &status_event);
    }

    Ok(())
}

/// Locate the sidecar JavaScript entrypoint.
fn find_sidecar_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    // Dev path: relative to the Cargo manifest directory
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("sidecar")
        .join("dist")
        .join("claude-agent-sidecar.cjs");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    // Production path: Tauri resource directory
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| AppError::AgentError(format!("Cannot resolve resource dir: {}", e)))?;
    let prod_path = resource_dir.join("claude-agent-sidecar.cjs");
    if prod_path.exists() {
        return Ok(prod_path);
    }

    Err(AppError::AgentError(
        "Claude Agent SDK sidecar not found. Run 'npm run build:sidecar' first.".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sidecar_command_query_serializes() {
        let cmd = SidecarCommand::Query {
            id: "test-id".to_string(),
            prompt: "hello".to_string(),
            cwd: "/tmp".to_string(),
            session_id: None,
            model: Some("sonnet".to_string()),
            system_prompt: None,
            permission_mode: "default".to_string(),
            env_vars: None,
            additional_dirs: None,
            disable_thinking: None,
            disable_plan_mode: None,
        };
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"type\":\"query\""));
        assert!(json.contains("\"prompt\":\"hello\""));
        assert!(json.contains("\"model\":\"sonnet\""));
        // Fields should be camelCase for the TypeScript sidecar
        assert!(json.contains("\"permissionMode\":\"default\""));
        // session_id is None so should be skipped
        assert!(!json.contains("sessionId"));
    }

    #[test]
    fn test_sidecar_command_query_serializes_session_id_as_camel_case() {
        let cmd = SidecarCommand::Query {
            id: "test-id".to_string(),
            prompt: "hello".to_string(),
            cwd: "/tmp".to_string(),
            session_id: Some("sess-abc".to_string()),
            model: None,
            system_prompt: Some("Be helpful".to_string()),
            permission_mode: "bypassPermissions".to_string(),
            env_vars: None,
            additional_dirs: Some(vec!["/extra".to_string()]),
            disable_thinking: Some(true),
            disable_plan_mode: None,
        };
        let json = serde_json::to_string(&cmd).unwrap();
        // All fields must use camelCase to match TypeScript protocol
        assert!(json.contains("\"sessionId\":\"sess-abc\""));
        assert!(json.contains("\"systemPrompt\":\"Be helpful\""));
        assert!(json.contains("\"permissionMode\":\"bypassPermissions\""));
        assert!(json.contains("\"additionalDirs\""));
        assert!(json.contains("\"disableThinking\":true"));
        // Should NOT contain snake_case versions
        assert!(!json.contains("session_id"));
        assert!(!json.contains("system_prompt"));
        assert!(!json.contains("permission_mode"));
        assert!(!json.contains("additional_dirs"));
        assert!(!json.contains("disable_thinking"));
    }

    #[test]
    fn test_sidecar_command_permission_response_serializes() {
        let cmd = SidecarCommand::PermissionResponse {
            id: "ws-123".to_string(),
            approved: true,
            updated_permissions: None,
            decision_classification: None,
        };
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"type\":\"permission_response\""));
        assert!(json.contains("\"approved\":true"));
    }

    #[test]
    fn test_sidecar_command_interrupt_serializes() {
        let cmd = SidecarCommand::Interrupt {
            id: "ws-456".to_string(),
        };
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"type\":\"interrupt\""));
        assert!(json.contains("\"id\":\"ws-456\""));
    }

    #[test]
    fn test_sidecar_command_shutdown_serializes() {
        let cmd = SidecarCommand::Shutdown;
        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"type\":\"shutdown\""));
    }

    // ─── parse_sidecar_line_id tests ───────────────────────────────

    #[test]
    fn test_parse_sidecar_line_id_valid() {
        let line = r#"{"id":"550e8400-e29b-41d4-a716-446655440000","type":"system"}"#;
        let (uuid, raw) = parse_sidecar_line_id(line).unwrap();
        assert_eq!(uuid.to_string(), "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(raw.get("type").unwrap().as_str().unwrap(), "system");
    }

    #[test]
    fn test_parse_sidecar_line_id_invalid_json() {
        let result = parse_sidecar_line_id("not json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid JSON"));
    }

    #[test]
    fn test_parse_sidecar_line_id_missing_id_field() {
        let line = r#"{"type":"system","session_id":"abc"}"#;
        let result = parse_sidecar_line_id(line);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'id' field"));
    }

    #[test]
    fn test_parse_sidecar_line_id_invalid_uuid() {
        let line = r#"{"id":"not-a-uuid","type":"system"}"#;
        let result = parse_sidecar_line_id(line);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid workspace UUID"));
    }

    #[test]
    fn test_parse_sidecar_line_id_numeric_id() {
        let line = r#"{"id":12345,"type":"system"}"#;
        let result = parse_sidecar_line_id(line);
        assert!(result.is_err()); // id must be a string
    }

    // ─── is_result_event tests ──────────────────────────────────────

    #[test]
    fn test_is_result_event_true() {
        let raw: serde_json::Value = serde_json::json!({"type": "result", "id": "abc"});
        assert!(is_result_event(&raw));
    }

    #[test]
    fn test_is_result_event_false_for_system() {
        let raw: serde_json::Value = serde_json::json!({"type": "system", "id": "abc"});
        assert!(!is_result_event(&raw));
    }

    #[test]
    fn test_is_result_event_false_for_missing_type() {
        let raw: serde_json::Value = serde_json::json!({"id": "abc"});
        assert!(!is_result_event(&raw));
    }

    #[test]
    fn test_is_result_event_false_for_stream_event() {
        let raw: serde_json::Value = serde_json::json!({"type": "stream_event", "id": "abc"});
        assert!(!is_result_event(&raw));
    }

    // ─── handle_sidecar_line tests ───────────────────────────────────

    fn setup_sidecar_test() -> (
        tauri::AppHandle<tauri::test::MockRuntime>,
        Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
        Arc<Mutex<HashMap<Uuid, FrontendStreamEvent>>>,
    ) {
        let app = crate::test_helpers::mock_app_with_state();
        let handle = app.handle().clone();
        let agents = Arc::new(Mutex::new(HashMap::new()));
        let pending = Arc::new(Mutex::new(HashMap::new()));
        // Leak app to keep handle alive (test only)
        std::mem::forget(app);
        (handle, agents, pending)
    }

    #[test]
    fn test_handle_sidecar_line_invalid_json() {
        let (handle, agents, pending) = setup_sidecar_test();
        let result = handle_sidecar_line("not json", &handle, &agents, &pending);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid JSON"));
    }

    #[test]
    fn test_handle_sidecar_line_missing_id() {
        let (handle, agents, pending) = setup_sidecar_test();
        let result =
            handle_sidecar_line(r#"{"type":"system"}"#, &handle, &agents, &pending);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'id'"));
    }

    #[test]
    fn test_handle_sidecar_line_result_transitions_to_idle() {
        let (handle, agents, pending) = setup_sidecar_test();
        let ws_id = Uuid::new_v4();

        // Set agent as Running
        {
            let mut lock = agents.lock().unwrap();
            let mut info = AgentInfo::new(ws_id);
            info.status = AgentStatus::Running;
            lock.insert(ws_id, info);
        }

        let line = format!(
            r#"{{"id":"{}","type":"result","result":"done","is_error":false}}"#,
            ws_id
        );
        let result = handle_sidecar_line(&line, &handle, &agents, &pending);
        assert!(result.is_ok());

        let lock = agents.lock().unwrap();
        assert_eq!(lock[&ws_id].status, AgentStatus::Idle);
    }

    #[test]
    fn test_handle_sidecar_line_permission_request_stored() {
        let (handle, agents, pending) = setup_sidecar_test();
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        // parse_stream_line expects type "input_request" with a "tool" object
        let line = format!(
            r#"{{"id":"{}","type":"input_request","tool":{{"name":"bash","input":{{"command":"ls"}}}}}}"#,
            ws_id
        );
        let result = handle_sidecar_line(&line, &handle, &agents, &pending);
        assert!(result.is_ok());
        assert!(pending.lock().unwrap().contains_key(&ws_id));
    }

    #[test]
    fn test_handle_sidecar_line_result_clears_permission() {
        let (handle, agents, pending) = setup_sidecar_test();
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        // Insert a pending permission
        pending.lock().unwrap().insert(
            ws_id,
            FrontendStreamEvent::PermissionRequest {
                tool_name: "Write".into(),
                input: serde_json::json!({}),
                suggestions: None,
            },
        );

        let line = format!(
            r#"{{"id":"{}","type":"result","result":"ok","is_error":false}}"#,
            ws_id
        );
        let result = handle_sidecar_line(&line, &handle, &agents, &pending);
        assert!(result.is_ok());
        assert!(!pending.lock().unwrap().contains_key(&ws_id));
    }

    #[test]
    fn test_handle_sidecar_line_captures_session_id() {
        let (handle, agents, pending) = setup_sidecar_test();
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        let line = format!(
            r#"{{"id":"{}","type":"system","session_id":"sess-abc123"}}"#,
            ws_id
        );
        let result = handle_sidecar_line(&line, &handle, &agents, &pending);
        assert!(result.is_ok());

        let lock = agents.lock().unwrap();
        assert_eq!(lock[&ws_id].session_id.as_deref(), Some("sess-abc123"));
    }

    #[test]
    fn test_handle_sidecar_line_unknown_event_no_crash() {
        let (handle, agents, pending) = setup_sidecar_test();
        let ws_id = Uuid::new_v4();

        // Unknown type — parse_stream_line returns empty vec, but handle_sidecar_line shouldn't crash
        let line = format!(r#"{{"id":"{}","type":"unknown_thing","data":"foo"}}"#, ws_id);
        let result = handle_sidecar_line(&line, &handle, &agents, &pending);
        assert!(result.is_ok());
    }
}
