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
#[derive(Clone)]
pub struct CopilotLspHandle {
    pub stdin_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    pub pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Value>>>>,
    pub next_id: Arc<Mutex<i64>>,
    pub child_pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotCompletion {
    pub insert_text: String,
    pub range: Option<CopilotRange>,
    pub command: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotRange {
    pub start: CopilotPosition,
    pub end: CopilotPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotPosition {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotSignInResult {
    pub status: String,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub user: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
            if stdin.write_all(&msg).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
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
                                let _ = tx.send(parsed);
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

    let response = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
        .await
        .map_err(|_| AppError::CopilotError(format!("Copilot LS request timed out: {}", method)))?
        .map_err(|_| {
            AppError::CopilotError("Copilot LS response channel closed".to_string())
        })?;

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

/// Gracefully stop the Copilot Language Server.
pub async fn stop(handle: &CopilotLspHandle, child: &mut Child) {
    // Try graceful shutdown
    let _ = send_request(handle, "shutdown", Value::Null).await;
    let _ = send_notification(handle, "exit", Value::Null).await;

    // Give it a moment to exit
    tokio::select! {
        _ = child.wait() => {},
        _ = tokio::time::sleep(std::time::Duration::from_secs(3)) => {
            // Force kill
            if let Some(pid) = handle.child_pid {
                let _ = crate::platform::kill_process_group(pid);
            }
            let _ = child.kill().await;
        }
    }
}
