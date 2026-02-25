use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read as _, Write};
use std::process::{ChildStderr, ChildStdout, Stdio};

use serde_json::{json, Value};

use crate::error::AppError;
use crate::models::mcp::McpScope;
use crate::models::settings::ClaudeContextSettings;
use crate::platform;
use crate::services::mcp as mcp_svc;

/// Minimal MCP JSON-RPC client over stdio.
struct McpClient {
    child: std::process::Child,
    reader: BufReader<ChildStdout>,
    stderr: ChildStderr,
    request_id: u64,
}

impl McpClient {
    fn spawn(settings: &ClaudeContextSettings) -> Result<Self, AppError> {
        let mut env = HashMap::new();
        if let Some(ref key) = settings.openai_api_key {
            env.insert("OPENAI_API_KEY".to_string(), key.clone());
        }
        if let Some(ref uri) = settings.zilliz_uri {
            env.insert("MILVUS_ADDRESS".to_string(), uri.clone());
        }
        if let Some(ref token) = settings.zilliz_token {
            env.insert("MILVUS_TOKEN".to_string(), token.clone());
        }

        let mut child = platform::command("npx")
            .args(["@zilliz/claude-context-mcp@latest"])
            .envs(&env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                AppError::McpError(format!("Failed to spawn claude-context MCP server: {}", e))
            })?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::McpError("No stdout handle".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::McpError("No stderr handle".to_string()))?;
        let reader = BufReader::new(stdout);

        let mut client = Self {
            child,
            reader,
            stderr,
            request_id: 0,
        };
        client.initialize()?;
        Ok(client)
    }

    fn send_request(&mut self, method: &str, params: Value) -> Result<Value, AppError> {
        self.request_id += 1;
        let request = json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method,
            "params": params,
        });

        let stdin = self
            .child
            .stdin
            .as_mut()
            .ok_or_else(|| AppError::McpError("No stdin handle".to_string()))?;
        let msg = serde_json::to_string(&request)
            .map_err(|e| AppError::McpError(format!("JSON serialize failed: {}", e)))?;
        writeln!(stdin, "{}", msg)
            .map_err(|e| AppError::McpError(format!("Write to stdin failed: {}", e)))?;
        stdin
            .flush()
            .map_err(|e| AppError::McpError(format!("Flush stdin failed: {}", e)))?;

        self.read_response()
    }

    fn send_notification(&mut self, method: &str, params: Value) -> Result<(), AppError> {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });

        let stdin = self
            .child
            .stdin
            .as_mut()
            .ok_or_else(|| AppError::McpError("No stdin handle".to_string()))?;
        let msg = serde_json::to_string(&notification)
            .map_err(|e| AppError::McpError(format!("JSON serialize failed: {}", e)))?;
        writeln!(stdin, "{}", msg)
            .map_err(|e| AppError::McpError(format!("Write to stdin failed: {}", e)))?;
        stdin
            .flush()
            .map_err(|e| AppError::McpError(format!("Flush stdin failed: {}", e)))?;
        Ok(())
    }

    fn read_response(&mut self) -> Result<Value, AppError> {
        // Read lines until we get a valid JSON-RPC response (skip non-JSON lines)
        loop {
            let mut line = String::new();
            let bytes_read = self
                .reader
                .read_line(&mut line)
                .map_err(|e| AppError::McpError(format!("Read from stdout failed: {}", e)))?;
            if bytes_read == 0 {
                let mut stderr_output = String::new();
                let _ = self.stderr.read_to_string(&mut stderr_output);
                let detail = if stderr_output.trim().is_empty() {
                    "no stderr output".to_string()
                } else {
                    stderr_output.trim().to_string()
                };
                return Err(AppError::McpError(format!(
                    "MCP server closed stdout unexpectedly: {}",
                    detail
                )));
            }
            let trimmed = line.trim();
            if trimmed.starts_with('{') {
                let response: Value = serde_json::from_str(trimmed)
                    .map_err(|e| AppError::McpError(format!("JSON parse failed: {}", e)))?;
                return Ok(response);
            }
            // Skip non-JSON lines (e.g. logging output)
        }
    }

    fn initialize(&mut self) -> Result<(), AppError> {
        self.send_request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "fury", "version": "1.0.0" }
            }),
        )?;
        self.send_notification("notifications/initialized", json!({}))?;
        Ok(())
    }

    fn call_tool(&mut self, name: &str, arguments: Value) -> Result<Value, AppError> {
        let response = self.send_request(
            "tools/call",
            json!({
                "name": name,
                "arguments": arguments,
            }),
        )?;

        if let Some(error) = response.get("error") {
            return Err(AppError::McpError(format!("MCP tool error: {}", error)));
        }

        Ok(response.get("result").cloned().unwrap_or(json!(null)))
    }

    fn shutdown(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Validate that all required credentials are configured.
pub fn validate_settings(settings: &ClaudeContextSettings) -> Result<(), AppError> {
    if !settings.enabled {
        return Err(AppError::McpError(
            "Claude Context is not enabled".to_string(),
        ));
    }
    if settings.openai_api_key.as_deref().unwrap_or("").is_empty() {
        return Err(AppError::McpError(
            "OpenAI API key is required for Claude Context".to_string(),
        ));
    }
    if settings.zilliz_uri.as_deref().unwrap_or("").is_empty() {
        return Err(AppError::McpError(
            "Zilliz Cloud URI is required for Claude Context".to_string(),
        ));
    }
    if settings.zilliz_token.as_deref().unwrap_or("").is_empty() {
        return Err(AppError::McpError(
            "Zilliz Cloud Token is required for Claude Context".to_string(),
        ));
    }
    Ok(())
}

/// Index a codebase by spawning the MCP server, calling index_codebase,
/// then polling get_indexing_status until completion before shutting down.
pub fn index_codebase(
    settings: &ClaudeContextSettings,
    repo_path: &str,
) -> Result<Value, AppError> {
    validate_settings(settings)?;
    eprintln!(
        "[claude-context] Spawning MCP client for indexing: {}",
        repo_path
    );
    let mut client = McpClient::spawn(settings)?;

    // Clear any stale indexing state from a previous killed process
    eprintln!(
        "[claude-context] Clearing previous index for: {}",
        repo_path
    );
    let _ = client.call_tool("clear_index", json!({ "path": repo_path }));

    eprintln!("[claude-context] Calling index_codebase...");
    let result = client.call_tool("index_codebase", json!({ "path": repo_path }));
    match &result {
        Ok(val) => eprintln!("[claude-context] index_codebase returned: {}", val),
        Err(e) => {
            eprintln!("[claude-context] index_codebase error: {}", e);
            client.shutdown();
            return result;
        }
    }

    // Indexing runs async inside the MCP server process.
    // Poll get_indexing_status until completion, error, or timeout.
    eprintln!("[claude-context] Polling get_indexing_status until complete...");
    let max_polls = 200; // ~10 minutes at 3s intervals
    for poll_count in 0..max_polls {
        std::thread::sleep(std::time::Duration::from_secs(3));

        let status = client.call_tool("get_indexing_status", json!({ "path": repo_path }));
        match &status {
            Ok(val) => {
                let text = val
                    .get("content")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|item| item.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");

                eprintln!("[claude-context] poll {}: {}", poll_count + 1, text);

                let text_lower = text.to_lowercase();

                // "completed" or "100%" means done. "indexed" alone is ambiguous
                // ("being indexed" = in progress vs "indexed" = done)
                if text_lower.contains("completed") || text_lower.contains("100%") {
                    eprintln!("[claude-context] Indexing complete!");
                    break;
                }

                // "not being indexed" or "no active indexing" = nothing running,
                // but also not "being indexed" = still in progress
                if !text_lower.contains("indexing")
                    && !text_lower.contains("progress")
                    && !text_lower.contains("processing")
                    && poll_count > 0
                {
                    // No indexing activity detected — assume done
                    eprintln!("[claude-context] No active indexing detected, assuming complete.");
                    break;
                }

                if text_lower.contains("error") || text_lower.contains("failed") {
                    client.shutdown();
                    return Err(AppError::McpError(format!("Indexing failed: {}", text)));
                }
            }
            Err(e) => {
                eprintln!("[claude-context] get_indexing_status error: {}", e);
                client.shutdown();
                return Err(AppError::McpError(format!(
                    "Failed to get indexing status: {}",
                    e
                )));
            }
        }
    }

    client.shutdown();
    result
}

/// Ensure the claude-context MCP server is registered at user scope.
/// Always removes and re-adds to keep env vars in sync with settings.
pub fn ensure_mcp_server_registered(settings: &ClaudeContextSettings) -> Result<(), AppError> {
    // Remove first so env vars are always up-to-date
    let _ = mcp_svc::remove_mcp_server("claude-context", &McpScope::User);

    let mut env = HashMap::new();
    if let Some(ref key) = settings.openai_api_key {
        env.insert("OPENAI_API_KEY".to_string(), key.clone());
    }
    if let Some(ref uri) = settings.zilliz_uri {
        env.insert("MILVUS_ADDRESS".to_string(), uri.clone());
    }
    if let Some(ref token) = settings.zilliz_token {
        env.insert("MILVUS_TOKEN".to_string(), token.clone());
    }

    mcp_svc::add_mcp_server(
        "claude-context",
        "npx",
        &["@zilliz/claude-context-mcp@latest".to_string()],
        &env,
        &McpScope::User,
    )
}

/// Remove the claude-context MCP server from user scope.
pub fn remove_mcp_server_registration() -> Result<(), AppError> {
    mcp_svc::remove_mcp_server("claude-context", &McpScope::User)
}
