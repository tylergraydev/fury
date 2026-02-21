use std::collections::HashMap;
use std::process::Command;

use crate::error::AppError;
use crate::models::mcp::{McpScope, McpServer};
use crate::services::claude_process;

/// Get details for a single MCP server by name.
fn get_mcp_server(claude: &std::path::Path, name: &str) -> Option<McpServer> {
    let output = Command::new(claude)
        .args(["mcp", "get", name])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut command = String::new();
    let mut args = Vec::new();
    let mut env = HashMap::new();
    let mut scope = McpScope::User;

    for line in stdout.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("Type:") {
            let _ = val.trim();
        } else if let Some(val) = line.strip_prefix("Command:") {
            command = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("Args:") {
            let val = val.trim();
            if !val.is_empty() {
                args = val.split_whitespace().map(String::from).collect();
            }
        } else if let Some(val) = line.strip_prefix("Scope:") {
            let val = val.trim();
            scope = if val == "project" {
                McpScope::Project
            } else {
                McpScope::User
            };
        } else if let Some(val) = line.strip_prefix("Env:") {
            let val = val.trim();
            if !val.is_empty() {
                for pair in val.split(',') {
                    let pair = pair.trim();
                    if let Some((k, v)) = pair.split_once('=') {
                        env.insert(k.trim().to_string(), v.trim().to_string());
                    }
                }
            }
        }
    }

    Some(McpServer {
        name: name.to_string(),
        command,
        args,
        env,
        scope,
    })
}

/// List MCP servers configured in Claude Code.
pub fn list_mcp_servers(_scope: &McpScope) -> Result<Vec<McpServer>, AppError> {
    let claude = claude_process::find_claude_binary()?;

    let output = Command::new(&claude)
        .args(["mcp", "list"])
        .output()
        .map_err(|e| AppError::McpError(format!("Failed to run claude mcp list: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Empty list is not an error
        if stderr.contains("No MCP servers") || stderr.trim().is_empty() {
            return Ok(Vec::new());
        }
        return Err(AppError::McpError(format!(
            "claude mcp list failed: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Parse server names from text output (one per line, may have extra columns)
    let mut servers = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // The first whitespace-delimited token is the server name
        let name = line.split_whitespace().next().unwrap_or(line);
        if let Some(server) = get_mcp_server(&claude, name) {
            servers.push(server);
        }
    }

    Ok(servers)
}

/// Add an MCP server to Claude Code configuration.
pub fn add_mcp_server(
    name: &str,
    command: &str,
    args: &[String],
    env: &HashMap<String, String>,
    scope: &McpScope,
) -> Result<(), AppError> {
    let claude = claude_process::find_claude_binary()?;

    let mut cmd_args = vec![
        "mcp".to_string(),
        "add".to_string(),
        name.to_string(),
        "-s".to_string(),
        scope.as_str().to_string(),
    ];

    // Add env vars with -e KEY=VALUE
    for (key, value) in env {
        cmd_args.push("-e".to_string());
        cmd_args.push(format!("{}={}", key, value));
    }

    // Separator and command + args
    cmd_args.push("--".to_string());
    cmd_args.push(command.to_string());
    cmd_args.extend(args.iter().cloned());

    let output = Command::new(&claude)
        .args(&cmd_args)
        .output()
        .map_err(|e| AppError::McpError(format!("Failed to run claude mcp add: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::McpError(format!(
            "claude mcp add failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Remove an MCP server from Claude Code configuration.
pub fn remove_mcp_server(name: &str, scope: &McpScope) -> Result<(), AppError> {
    let claude = claude_process::find_claude_binary()?;

    let output = Command::new(&claude)
        .args(["mcp", "remove", name, "-s", scope.as_str()])
        .output()
        .map_err(|e| AppError::McpError(format!("Failed to run claude mcp remove: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::McpError(format!(
            "claude mcp remove failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}
