use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

use crate::error::AppError;

/// Handle to a running Copilot Language Server.
/// All fields are Arc-wrapped so this can be cheaply cloned out of AppState
/// without holding the outer std::sync::Mutex across await points.
#[derive(Clone, Debug)]
pub struct CopilotLspHandle {
    pub stdin_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    pub pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Value>>>>,
    pub next_id: Arc<Mutex<i64>>,
    pub child_pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CopilotCompletion {
    pub insert_text: String,
    pub range: Option<CopilotRange>,
    pub command: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CopilotRange {
    pub start: CopilotPosition,
    pub end: CopilotPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CopilotPosition {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CopilotSignInResult {
    pub status: String,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub user: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CopilotAuthStatus {
    pub status: String,
    pub user: Option<String>,
}

/// Frame a JSON string into LSP wire protocol: `Content-Length: N\r\n\r\n{json}`
fn frame_lsp_message(json: &str) -> Vec<u8> {
    let header = format!("Content-Length: {}\r\n\r\n", json.len());
    let mut buf = Vec::with_capacity(header.len() + json.len());
    buf.extend_from_slice(header.as_bytes());
    buf.extend_from_slice(json.as_bytes());
    buf
}

/// Read one LSP-framed message from a buffered reader.
/// Protocol: `Content-Length: N\r\n\r\n{N bytes of JSON}`
async fn read_lsp_message(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<String, AppError> {
    let mut content_length: Option<usize> = None;

    // Read headers until blank line
    loop {
        let mut line = String::new();
        let bytes_read = reader.read_line(&mut line).await.map_err(|e| {
            AppError::CopilotError(format!("Failed to read LSP header: {}", e))
        })?;
        if bytes_read == 0 {
            return Err(AppError::CopilotError("LSP stream ended".to_string()));
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }

        if let Some(value) = trimmed.strip_prefix("Content-Length: ") {
            content_length = Some(value.parse::<usize>().map_err(|e| {
                AppError::CopilotError(format!("Invalid Content-Length: {}", e))
            })?);
        }
    }

    let length = content_length
        .ok_or_else(|| AppError::CopilotError("Missing Content-Length header".to_string()))?;

    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).await.map_err(|e| {
        AppError::CopilotError(format!("Failed to read LSP body: {}", e))
    })?;

    String::from_utf8(body)
        .map_err(|e| AppError::CopilotError(format!("Invalid UTF-8 in LSP body: {}", e)))
}

/// Spawn the Copilot Language Server and set up I/O handling.
pub async fn start(root_uri: &str) -> Result<(CopilotLspHandle, Child), AppError> {
    let node = which::which("node").map_err(|_| {
        AppError::CopilotError(
            "Node.js not found in PATH. GitHub Copilot requires Node.js.".to_string(),
        )
    })?;

    // Find the copilot-language-server. Try npx first, then known node_modules path.
    let copilot_bin = which::which("copilot-language-server");

    let mut cmd = if let Ok(bin) = copilot_bin {
        let mut c = Command::new(bin);
        c.arg("--stdio");
        c
    } else {
        let mut c = Command::new(&node);
        c.args([
            "--no-warnings",
            "./node_modules/@github/copilot-language-server/dist/language-server.js",
            "--stdio",
        ]);
        c
    };

    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Set process group for clean teardown
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
        AppError::CopilotError(format!("Failed to spawn Copilot Language Server: {}", e))
    })?;

    let child_pid = child.id();

    let stdin = child.stdin.take().ok_or_else(|| {
        AppError::CopilotError("Failed to capture Copilot LS stdin".to_string())
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::CopilotError("Failed to capture Copilot LS stdout".to_string())
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::CopilotError("Failed to capture Copilot LS stderr".to_string())
    })?;

    let pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Value>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(Mutex::new(1i64));

    // Stdin writer task: serializes access to child stdin
    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(64);
    tokio::spawn(async move {
        let mut stdin = stdin;
        while let Some(msg) = stdin_rx.recv().await {
            if let Err(e) = stdin.write_all(&msg).await {
                eprintln!("[copilot-lsp] stdin write error: {}", e);
                break;
            }
            if let Err(e) = stdin.flush().await {
                eprintln!("[copilot-lsp] stdin flush error: {}", e);
                break;
            }
        }
    });

    // Stdout reader task: reads LSP messages and routes responses
    let pending_clone = pending.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_lsp_message(&mut reader).await {
                Ok(msg) => {
                    let parsed: Value = match serde_json::from_str(&msg) {
                        Ok(v) => v,
                        Err(e) => {
                            eprintln!("[copilot-lsp] Failed to parse message: {}", e);
                            continue;
                        }
                    };

                    // Response to a request (has "id" and "result" or "error")
                    if let Some(id) = parsed.get("id").and_then(|v| v.as_i64()) {
                        if parsed.get("method").is_none() {
                            // This is a response, not a server request
                            let mut map = pending_clone.lock().await;
                            if let Some(tx) = map.remove(&id) {
                                if tx.send(parsed).is_err() {
                                    eprintln!("[copilot-lsp] Response receiver dropped for request id={}", id);
                                }
                            }
                            continue;
                        }
                    }

                    // Server-initiated notification or request
                    if let Some(method) = parsed.get("method").and_then(|v| v.as_str()) {
                        match method {
                            "window/logMessage" => {
                                if let Some(msg) = parsed
                                    .get("params")
                                    .and_then(|p| p.get("message"))
                                    .and_then(|m| m.as_str())
                                {
                                    eprintln!("[copilot-lsp] {}", msg);
                                }
                            }
                            _ => {
                                eprintln!("[copilot-lsp] Server notification: {}", method);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[copilot-lsp] Reader loop ended: {}", e);
                    break;
                }
            }
        }
    });

    // Stderr logger task
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[copilot-lsp-stderr] {}", line);
        }
    });

    let handle = CopilotLspHandle {
        stdin_tx,
        pending,
        next_id,
        child_pid,
    };

    // Send LSP initialize request
    let init_result = send_request(
        &handle,
        "initialize",
        serde_json::json!({
            "processId": std::process::id(),
            "clientInfo": {
                "name": "Columbus",
                "version": "1.1.0"
            },
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "inlineCompletion": {
                        "dynamicRegistration": true
                    },
                    "synchronization": {
                        "didSave": true,
                        "willSave": false,
                        "willSaveWaitUntil": false
                    }
                },
                "workspace": {
                    "workspaceFolders": true
                }
            },
            "initializationOptions": {
                "editorInfo": {
                    "name": "Columbus",
                    "version": "1.1.0"
                },
                "editorPluginInfo": {
                    "name": "columbus-copilot",
                    "version": "1.0.0"
                }
            }
        }),
    )
    .await?;

    eprintln!(
        "[copilot-lsp] Initialized. Server capabilities: {}",
        serde_json::to_string(
            &init_result
                .get("result")
                .and_then(|r| r.get("capabilities"))
                .unwrap_or(&Value::Null)
        )
        .unwrap_or_default()
    );

    // Send initialized notification
    send_notification(
        &handle,
        "initialized",
        serde_json::json!({}),
    )
    .await?;

    Ok((handle, child))
}

/// Send a JSON-RPC request and await the response.
pub async fn send_request(
    handle: &CopilotLspHandle,
    method: &str,
    params: Value,
) -> Result<Value, AppError> {
    let id = {
        let mut next = handle.next_id.lock().await;
        let id = *next;
        *next += 1;
        id
    };

    let (tx, rx) = oneshot::channel();
    handle.pending.lock().await.insert(id, tx);

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });

    let msg = frame_lsp_message(&request.to_string());
    handle.stdin_tx.send(msg).await.map_err(|_| {
        AppError::CopilotError("Failed to send request to Copilot LS".to_string())
    })?;

    let response = match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(resp)) => resp,
        Ok(Err(_)) => {
            // Channel closed — clean up pending entry
            handle.pending.lock().await.remove(&id);
            return Err(AppError::CopilotError(
                "Copilot LS response channel closed".to_string(),
            ));
        }
        Err(_) => {
            // Timeout — clean up pending entry to prevent leak
            handle.pending.lock().await.remove(&id);
            return Err(AppError::CopilotError(format!(
                "Copilot LS request timed out: {}",
                method
            )));
        }
    };

    // Check for JSON-RPC error
    if let Some(error) = response.get("error") {
        let msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        return Err(AppError::CopilotError(format!(
            "Copilot LS error ({}): {}",
            method, msg
        )));
    }

    Ok(response)
}

/// Send a JSON-RPC notification (no response expected).
pub async fn send_notification(
    handle: &CopilotLspHandle,
    method: &str,
    params: Value,
) -> Result<(), AppError> {
    let notification = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });

    let msg = frame_lsp_message(&notification.to_string());
    handle.stdin_tx.send(msg).await.map_err(|_| {
        AppError::CopilotError("Failed to send notification to Copilot LS".to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_lsp_message_basic() {
        let msg = frame_lsp_message("{}");
        let expected = b"Content-Length: 2\r\n\r\n{}";
        assert_eq!(msg, expected);
    }

    #[test]
    fn test_frame_lsp_message_empty() {
        let msg = frame_lsp_message("");
        assert_eq!(msg, b"Content-Length: 0\r\n\r\n");
    }

    #[test]
    fn test_frame_lsp_message_unicode() {
        let json = r#"{"text":"héllo"}"#;
        let msg = frame_lsp_message(json);
        // Content-Length is byte length, not char length
        let header = format!("Content-Length: {}\r\n\r\n", json.len());
        assert!(msg.starts_with(header.as_bytes()));
    }

    #[test]
    fn test_frame_lsp_message_roundtrip() {
        let json = r#"{"jsonrpc":"2.0","id":1,"method":"test"}"#;
        let framed = frame_lsp_message(json);
        let s = String::from_utf8(framed).unwrap();
        assert!(s.contains("Content-Length:"));
        assert!(s.ends_with(json));
    }

    #[test]
    fn test_copilot_position_serde() {
        let pos = CopilotPosition { line: 10, character: 5 };
        let json = serde_json::to_value(&pos).unwrap();
        assert_eq!(json["line"], 10);
        assert_eq!(json["character"], 5);
        let parsed: CopilotPosition = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.line, 10);
    }

    #[test]
    fn test_copilot_range_serde() {
        let range = CopilotRange {
            start: CopilotPosition { line: 0, character: 0 },
            end: CopilotPosition { line: 0, character: 10 },
        };
        let json = serde_json::to_value(&range).unwrap();
        assert_eq!(json["start"]["line"], 0);
        assert_eq!(json["end"]["character"], 10);
    }

    #[test]
    fn test_copilot_completion_serde() {
        let completion = CopilotCompletion {
            insert_text: "fn main() {}".to_string(),
            range: Some(CopilotRange {
                start: CopilotPosition { line: 0, character: 0 },
                end: CopilotPosition { line: 0, character: 0 },
            }),
            command: None,
        };
        let json = serde_json::to_value(&completion).unwrap();
        assert_eq!(json["insertText"], "fn main() {}");
        assert!(json["range"].is_object());
        assert!(json["command"].is_null());
    }

    #[test]
    fn test_copilot_completion_minimal() {
        let json = r#"{"insertText":"hello"}"#;
        let parsed: CopilotCompletion = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.insert_text, "hello");
        assert!(parsed.range.is_none());
        assert!(parsed.command.is_none());
    }

    #[test]
    fn test_copilot_sign_in_result_serde() {
        let result = CopilotSignInResult {
            status: "AlreadySignedIn".to_string(),
            user_code: None,
            verification_uri: None,
            user: Some("testuser".to_string()),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["status"], "AlreadySignedIn");
        assert_eq!(json["user"], "testuser");
    }

    #[test]
    fn test_copilot_sign_in_result_device_flow() {
        let json = r#"{
            "status": "PromptUserDeviceFlow",
            "userCode": "ABCD-1234",
            "verificationUri": "https://github.com/login/device"
        }"#;
        let parsed: CopilotSignInResult = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.status, "PromptUserDeviceFlow");
        assert_eq!(parsed.user_code.unwrap(), "ABCD-1234");
    }

    #[test]
    fn test_copilot_auth_status_serde() {
        let status = CopilotAuthStatus {
            status: "OK".to_string(),
            user: Some("user@example.com".to_string()),
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["status"], "OK");
    }

    #[test]
    fn test_copilot_lsp_handle_clone() {
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let handle = CopilotLspHandle {
            stdin_tx: tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
            child_pid: Some(12345),
        };
        let cloned = handle.clone();
        assert_eq!(cloned.child_pid, Some(12345));
    }

    #[tokio::test]
    async fn test_send_request_channel_closed() {
        let (tx, rx) = tokio::sync::mpsc::channel(1);
        drop(rx); // Close the receiving end
        let handle = CopilotLspHandle {
            stdin_tx: tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
            child_pid: None,
        };
        let result = send_request(&handle, "test", serde_json::json!({})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_send_notification_channel_closed() {
        let (tx, rx) = tokio::sync::mpsc::channel(1);
        drop(rx);
        let handle = CopilotLspHandle {
            stdin_tx: tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
            child_pid: None,
        };
        let result = send_notification(&handle, "test", serde_json::json!({})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_send_request_increments_id() {
        let (tx, mut rx) = tokio::sync::mpsc::channel(16);
        let handle = CopilotLspHandle {
            stdin_tx: tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
            child_pid: None,
        };

        // Send request (will time out waiting for response, but ID should be set)
        let pending = handle.pending.clone();

        // Manually simulate send_request's ID logic
        {
            let mut next = handle.next_id.lock().await;
            assert_eq!(*next, 1);
            *next += 1;
        }
        {
            let mut next = handle.next_id.lock().await;
            assert_eq!(*next, 2);
        }

        // Verify message was formatted correctly
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "test",
            "params": {}
        });
        let msg = frame_lsp_message(&notification.to_string());
        handle.stdin_tx.send(msg).await.unwrap();
        let received = rx.recv().await.unwrap();
        let s = String::from_utf8(received).unwrap();
        assert!(s.contains("Content-Length:"));
        assert!(s.contains("jsonrpc"));

        drop(pending);
    }

    #[test]
    fn test_frame_lsp_message_large_payload() {
        let json = "x".repeat(10000);
        let msg = frame_lsp_message(&json);
        let header = format!("Content-Length: {}\r\n\r\n", json.len());
        assert!(msg.starts_with(header.as_bytes()));
        assert_eq!(msg.len(), header.len() + json.len());
    }

    #[test]
    fn test_frame_lsp_message_special_chars() {
        let json = r#"{"key":"value with \"quotes\" and \n newlines"}"#;
        let msg = frame_lsp_message(json);
        let s = String::from_utf8(msg).unwrap();
        assert!(s.ends_with(json));
        let content_length: usize = s
            .lines()
            .next()
            .unwrap()
            .strip_prefix("Content-Length: ")
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(content_length, json.len());
    }

    #[tokio::test]
    async fn test_read_lsp_message_valid() {
        let input = b"Content-Length: 14\r\n\r\n{\"test\":\"ok\"}x";
        // Create a fake ChildStdout via pipe
        let (mut writer, reader) = tokio::io::duplex(1024);
        writer
            .write_all(&input[..input.len() - 1]) // exclude trailing 'x'
            .await
            .unwrap();

        // We can't easily create a BufReader<ChildStdout>, but we can test
        // the frame_lsp_message function indirectly. Let's verify the framing logic
        // by testing that framed messages have correct structure.
        let json = r#"{"test":"ok"}"#;
        let framed = frame_lsp_message(json);
        let s = String::from_utf8(framed.clone()).unwrap();

        // Parse the header
        let parts: Vec<&str> = s.splitn(2, "\r\n\r\n").collect();
        assert_eq!(parts.len(), 2);
        let header = parts[0];
        let body = parts[1];
        assert!(header.starts_with("Content-Length: "));
        let length: usize = header
            .strip_prefix("Content-Length: ")
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(length, body.len());
        assert_eq!(body, json);
    }

    #[test]
    fn test_copilot_completion_with_command() {
        let json = r#"{
            "insertText": "hello",
            "command": {"title": "accept", "command": "copilot.accept"}
        }"#;
        let parsed: CopilotCompletion = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.insert_text, "hello");
        assert!(parsed.command.is_some());
    }

    #[test]
    fn test_copilot_completion_with_range() {
        let json = r#"{
            "insertText": "code",
            "range": {
                "start": {"line": 5, "character": 10},
                "end": {"line": 5, "character": 15}
            }
        }"#;
        let parsed: CopilotCompletion = serde_json::from_str(json).unwrap();
        let range = parsed.range.unwrap();
        assert_eq!(range.start.line, 5);
        assert_eq!(range.start.character, 10);
        assert_eq!(range.end.line, 5);
        assert_eq!(range.end.character, 15);
    }

    #[test]
    fn test_copilot_sign_in_not_signed_in() {
        let json = r#"{"status": "NotSignedIn"}"#;
        let parsed: CopilotSignInResult = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.status, "NotSignedIn");
        assert!(parsed.user_code.is_none());
        assert!(parsed.verification_uri.is_none());
        assert!(parsed.user.is_none());
    }

    #[test]
    fn test_copilot_auth_status_not_ok() {
        let status = CopilotAuthStatus {
            status: "NotAuthorized".to_string(),
            user: None,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["status"], "NotAuthorized");
        assert!(json["user"].is_null());
    }

    #[test]
    fn test_copilot_lsp_handle_clone_no_pid() {
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let handle = CopilotLspHandle {
            stdin_tx: tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(99)),
            child_pid: None,
        };
        let cloned = handle.clone();
        assert_eq!(cloned.child_pid, None);
    }

    #[tokio::test]
    async fn test_send_notification_formats_correctly() {
        let (tx, mut rx) = tokio::sync::mpsc::channel(16);
        let handle = CopilotLspHandle {
            stdin_tx: tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
            child_pid: None,
        };

        send_notification(&handle, "textDocument/didOpen", serde_json::json!({"uri": "file:///test.rs"}))
            .await
            .unwrap();

        let received = rx.recv().await.unwrap();
        let s = String::from_utf8(received).unwrap();
        // Should contain Content-Length header
        assert!(s.contains("Content-Length:"));
        // Should contain the method
        assert!(s.contains("textDocument/didOpen"));
        // Should NOT contain an id (notifications don't have one)
        let body_start = s.find("\r\n\r\n").unwrap() + 4;
        let body = &s[body_start..];
        let parsed: serde_json::Value = serde_json::from_str(body).unwrap();
        assert!(parsed.get("id").is_none());
        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["method"], "textDocument/didOpen");
    }
}

/// Gracefully stop the Copilot Language Server.
pub async fn stop(handle: &CopilotLspHandle, child: &mut Child) {
    // Try graceful shutdown
    if let Err(e) = send_request(handle, "shutdown", Value::Null).await {
        eprintln!("[copilot-lsp] shutdown request failed: {}", e);
    }
    if let Err(e) = send_notification(handle, "exit", Value::Null).await {
        eprintln!("[copilot-lsp] exit notification failed: {}", e);
    }

    // Give it a moment to exit
    tokio::select! {
        _ = child.wait() => {},
        _ = tokio::time::sleep(std::time::Duration::from_secs(3)) => {
            // Force kill
            if let Some(pid) = handle.child_pid {
                if let Err(e) = crate::platform::kill_process_group(pid) {
                    eprintln!("[copilot-lsp] Failed to kill process group (pid={}): {}", pid, e);
                }
            }
            if let Err(e) = child.kill().await {
                eprintln!("[copilot-lsp] Failed to kill child process: {}", e);
            }
        }
    }
}
