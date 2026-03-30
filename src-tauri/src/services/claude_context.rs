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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_settings(
        enabled: bool,
        key: Option<&str>,
        uri: Option<&str>,
        token: Option<&str>,
    ) -> ClaudeContextSettings {
        ClaudeContextSettings {
            enabled,
            openai_api_key: key.map(String::from),
            zilliz_uri: uri.map(String::from),
            zilliz_token: token.map(String::from),
        }
    }

    #[test]
    fn test_validate_settings_all_valid() {
        let settings = test_settings(true, Some("key"), Some("uri"), Some("token"));
        assert!(validate_settings(&settings).is_ok());
    }

    #[test]
    fn test_validate_settings_not_enabled() {
        let settings = test_settings(false, Some("key"), Some("uri"), Some("token"));
        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not enabled"));
    }

    #[test]
    fn test_validate_settings_missing_api_key() {
        let settings = test_settings(true, None, Some("uri"), Some("token"));
        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("OpenAI API key"));
    }

    #[test]
    fn test_validate_settings_empty_api_key() {
        let settings = test_settings(true, Some(""), Some("uri"), Some("token"));
        let result = validate_settings(&settings);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_settings_missing_zilliz_uri() {
        let settings = test_settings(true, Some("key"), None, Some("token"));
        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Zilliz Cloud URI"));
    }

    #[test]
    fn test_validate_settings_empty_zilliz_uri() {
        let settings = test_settings(true, Some("key"), Some(""), Some("token"));
        let result = validate_settings(&settings);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_settings_missing_zilliz_token() {
        let settings = test_settings(true, Some("key"), Some("uri"), None);
        let result = validate_settings(&settings);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Zilliz Cloud Token"));
    }

    #[test]
    fn test_validate_settings_empty_zilliz_token() {
        let settings = test_settings(true, Some("key"), Some("uri"), Some(""));
        let result = validate_settings(&settings);
        assert!(result.is_err());
    }

    // --- Tests for extracted pure logic ---

    #[test]
    fn test_extract_status_text_valid() {
        let val = serde_json::json!({
            "content": [{"text": "Indexing in progress: 50%"}]
        });
        assert_eq!(extract_status_text(&val), "Indexing in progress: 50%");
    }

    #[test]
    fn test_extract_status_text_empty_content() {
        let val = serde_json::json!({"content": []});
        assert_eq!(extract_status_text(&val), "");
    }

    #[test]
    fn test_extract_status_text_no_content_key() {
        let val = serde_json::json!({"result": "ok"});
        assert_eq!(extract_status_text(&val), "");
    }

    #[test]
    fn test_extract_status_text_null() {
        let val = serde_json::json!(null);
        assert_eq!(extract_status_text(&val), "");
    }

    #[test]
    fn test_extract_status_text_no_text_field() {
        let val = serde_json::json!({"content": [{"type": "text"}]});
        assert_eq!(extract_status_text(&val), "");
    }

    #[test]
    fn test_extract_status_text_multiple_items_picks_first() {
        let val = serde_json::json!({
            "content": [
                {"text": "first"},
                {"text": "second"}
            ]
        });
        assert_eq!(extract_status_text(&val), "first");
    }

    #[test]
    fn test_is_indexing_complete_completed() {
        assert!(is_indexing_complete("Indexing completed successfully"));
    }

    #[test]
    fn test_is_indexing_complete_100_percent() {
        assert!(is_indexing_complete("Progress: 100%"));
    }

    #[test]
    fn test_is_indexing_complete_case_insensitive() {
        assert!(is_indexing_complete("COMPLETED"));
        assert!(is_indexing_complete("Completed"));
    }

    #[test]
    fn test_is_indexing_complete_in_progress() {
        assert!(!is_indexing_complete("Indexing in progress: 50%"));
    }

    #[test]
    fn test_is_indexing_complete_empty() {
        assert!(!is_indexing_complete(""));
    }

    #[test]
    fn test_is_indexing_complete_99_percent() {
        assert!(!is_indexing_complete("Progress: 99%"));
    }

    #[test]
    fn test_is_indexing_error_error() {
        assert!(is_indexing_error("Error: connection refused"));
    }

    #[test]
    fn test_is_indexing_error_failed() {
        assert!(is_indexing_error("Indexing failed: timeout"));
    }

    #[test]
    fn test_is_indexing_error_case_insensitive() {
        assert!(is_indexing_error("ERROR occurred"));
        assert!(is_indexing_error("FAILED to index"));
    }

    #[test]
    fn test_is_indexing_error_normal_status() {
        assert!(!is_indexing_error("Indexing in progress"));
    }

    #[test]
    fn test_is_indexing_error_empty() {
        assert!(!is_indexing_error(""));
    }

    #[test]
    fn test_is_inactive_indexing_no_keywords() {
        assert!(is_inactive_indexing("Repository ready"));
    }

    #[test]
    fn test_is_inactive_indexing_has_indexing() {
        assert!(!is_inactive_indexing("Currently indexing files"));
    }

    #[test]
    fn test_is_inactive_indexing_has_progress() {
        assert!(!is_inactive_indexing("In progress: 50%"));
    }

    #[test]
    fn test_is_inactive_indexing_has_processing() {
        assert!(!is_inactive_indexing("Processing files..."));
    }

    #[test]
    fn test_is_inactive_indexing_empty() {
        assert!(is_inactive_indexing(""));
    }

    #[test]
    fn test_is_inactive_indexing_case_insensitive() {
        assert!(!is_inactive_indexing("INDEXING"));
        assert!(!is_inactive_indexing("Progress"));
        assert!(!is_inactive_indexing("PROCESSING"));
    }

    #[test]
    fn test_is_json_line_valid() {
        assert!(is_json_line(r#"{"jsonrpc":"2.0","id":1}"#));
    }

    #[test]
    fn test_is_json_line_with_whitespace() {
        assert!(is_json_line(r#"  {"jsonrpc":"2.0"}  "#));
    }

    #[test]
    fn test_is_json_line_log_output() {
        assert!(!is_json_line("INFO: Server starting on port 3000"));
    }

    #[test]
    fn test_is_json_line_empty() {
        assert!(!is_json_line(""));
    }

    #[test]
    fn test_is_json_line_array() {
        assert!(!is_json_line("[1, 2, 3]"));
    }

    #[test]
    fn test_is_json_line_brace_in_middle() {
        assert!(!is_json_line("log: {some data}"));
    }

    // ─── parse_indexing_status tests ────────────────────────────────

    #[test]
    fn test_parse_indexing_status_complete() {
        let val = serde_json::json!({"content": [{"text": "Indexing completed successfully"}]});
        assert_eq!(parse_indexing_status(&val), IndexingOutcome::Complete);
    }

    #[test]
    fn test_parse_indexing_status_complete_100_percent() {
        let val = serde_json::json!({"content": [{"text": "Progress: 100%"}]});
        assert_eq!(parse_indexing_status(&val), IndexingOutcome::Complete);
    }

    #[test]
    fn test_parse_indexing_status_error() {
        let val = serde_json::json!({"content": [{"text": "Indexing failed with error"}]});
        match parse_indexing_status(&val) {
            IndexingOutcome::Error(msg) => assert!(msg.contains("failed")),
            other => panic!("Expected Error, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_indexing_status_in_progress() {
        let val = serde_json::json!({"content": [{"text": "Currently indexing 50% progress"}]});
        match parse_indexing_status(&val) {
            IndexingOutcome::InProgress(msg) => assert!(msg.contains("indexing")),
            other => panic!("Expected InProgress, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_indexing_status_inactive() {
        let val = serde_json::json!({"content": [{"text": "No tasks running"}]});
        match parse_indexing_status(&val) {
            IndexingOutcome::Inactive(msg) => assert!(msg.contains("No tasks")),
            other => panic!("Expected Inactive, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_indexing_status_empty_response() {
        let val = serde_json::json!({});
        // Empty response → extract_status_text returns "" → inactive (no keywords)
        assert!(matches!(parse_indexing_status(&val), IndexingOutcome::Inactive(_)));
    }
}

// --- Extracted pure logic for testability ---

/// Parse the text content from an MCP tool response value.
/// The response format is: `{"content": [{"text": "..."}]}`
#[allow(dead_code)]
pub fn extract_status_text(val: &serde_json::Value) -> &str {
    val.get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
}

/// Check if a status text indicates indexing is complete.
#[allow(dead_code)]
pub fn is_indexing_complete(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("completed") || lower.contains("100%")
}

/// Check if a status text indicates an indexing error.
#[allow(dead_code)]
pub fn is_indexing_error(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("error") || lower.contains("failed")
}

/// Check if the status text indicates no active indexing is happening.
/// This is used to detect when indexing has silently finished (no keywords
/// suggesting activity). Returns true if there's no indexing activity.
#[allow(dead_code)]
pub fn is_inactive_indexing(text: &str) -> bool {
    let lower = text.to_lowercase();
    !lower.contains("indexing") && !lower.contains("progress") && !lower.contains("processing")
}

/// Determine if a line from MCP stdout is a JSON-RPC response (starts with '{').
#[allow(dead_code)]
pub fn is_json_line(line: &str) -> bool {
    line.trim().starts_with('{')
}

/// The outcome of checking an indexing status response.
#[derive(Debug, PartialEq)]
pub(crate) enum IndexingOutcome {
    /// Indexing completed successfully.
    Complete,
    /// Indexing is still running.
    InProgress(String),
    /// Indexing encountered an error.
    Error(String),
    /// No active indexing detected (assumed done after initial poll).
    Inactive(String),
}

/// Determine the indexing outcome from an MCP status response value.
pub(crate) fn parse_indexing_status(response: &serde_json::Value) -> IndexingOutcome {
    let status = extract_status_text(response);
    if is_indexing_complete(status) {
        IndexingOutcome::Complete
    } else if is_indexing_error(status) {
        IndexingOutcome::Error(status.to_string())
    } else if is_inactive_indexing(status) {
        IndexingOutcome::Inactive(status.to_string())
    } else {
        IndexingOutcome::InProgress(status.to_string())
    }
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
                let text = extract_status_text(val);
                eprintln!("[claude-context] poll {}: {}", poll_count + 1, text);

                match parse_indexing_status(val) {
                    IndexingOutcome::Complete => {
                        eprintln!("[claude-context] Indexing complete!");
                        break;
                    }
                    IndexingOutcome::Error(msg) => {
                        client.shutdown();
                        return Err(AppError::McpError(format!("Indexing failed: {}", msg)));
                    }
                    IndexingOutcome::Inactive(_) if poll_count > 0 => {
                        eprintln!("[claude-context] No active indexing detected, assuming complete.");
                        break;
                    }
                    _ => {} // InProgress or first-poll Inactive — continue polling
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
