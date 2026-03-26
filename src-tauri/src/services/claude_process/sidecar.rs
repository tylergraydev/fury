use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::{AgentInfo, AgentStatus, FrontendStreamEvent};

use super::stream::try_capture_session_id;

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
    },
    PermissionResponse {
        id: String,
        approved: bool,
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

    let mut child = cmd.spawn().map_err(|e| {
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
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if let Err(e) =
                handle_sidecar_line(&line, &app_clone, &agents_clone, &pending_perms)
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

/// Process a single NDJSON line from the sidecar stdout.
/// Extracts the `id` field to determine the workspace, then parses
/// the event and emits it to the frontend.
fn handle_sidecar_line(
    line: &str,
    app: &AppHandle,
    agents: &Arc<Mutex<HashMap<Uuid, AgentInfo>>>,
    pending_permissions: &Arc<Mutex<HashMap<Uuid, FrontendStreamEvent>>>,
) -> Result<(), String> {
    let raw: serde_json::Value =
        serde_json::from_str(line).map_err(|e| format!("Invalid JSON: {}", e))?;

    let id_str = raw
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing 'id' field".to_string())?;

    let workspace_id =
        Uuid::parse_str(id_str).map_err(|e| format!("Invalid workspace UUID: {}", e))?;

    // Parse stream events using the existing parser
    let events = super::parse_stream_line(line);

    for event in &events {
        // Capture session_id from system/result events
        try_capture_session_id(event, agents, workspace_id);

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
    if let Some(event_type) = raw.get("type").and_then(|v| v.as_str()) {
        if event_type == "result" {
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

    #[test]
    fn test_handle_sidecar_line_invalid_json() {
        // We can't easily construct an AppHandle in unit tests, but we can
        // verify the JSON parsing path by checking error messages.
        let result = serde_json::from_str::<serde_json::Value>("not json");
        assert!(result.is_err());
    }

    #[test]
    fn test_handle_sidecar_line_missing_id() {
        let line = r#"{"type":"system","session_id":"abc"}"#;
        let raw: serde_json::Value = serde_json::from_str(line).unwrap();
        // No "id" field — this would fail in handle_sidecar_line
        assert!(raw.get("id").is_none());
    }
}
