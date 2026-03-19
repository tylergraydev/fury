use std::collections::HashMap;

use crate::error::AppError;
use crate::models::mcp::{McpScope, McpServer};
use crate::platform;
use crate::services::claude_process;

// --- Extracted pure parsing logic for testability ---

/// Parse the text output of `claude mcp get <name>` into an McpServer.
pub fn parse_mcp_get_output(name: &str, stdout: &str) -> McpServer {
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

    McpServer {
        name: name.to_string(),
        command,
        args,
        env,
        scope,
    }
}

/// Parse server names from the text output of `claude mcp list`.
/// Returns a list of server names (first whitespace-delimited token per line).
pub fn parse_mcp_list_output(stdout: &str) -> Vec<String> {
    let mut names = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(name) = line.split_whitespace().next() {
            names.push(name.to_string());
        }
    }
    names
}

/// Build the argument list for `claude mcp add`.
pub fn build_mcp_add_args(
    name: &str,
    command: &str,
    args: &[String],
    env: &HashMap<String, String>,
    scope: &McpScope,
) -> Vec<String> {
    let mut cmd_args = vec![
        "mcp".to_string(),
        "add".to_string(),
        name.to_string(),
        "-s".to_string(),
        scope.as_str().to_string(),
    ];

    for (key, value) in env {
        cmd_args.push("-e".to_string());
        cmd_args.push(format!("{}={}", key, value));
    }

    cmd_args.push("--".to_string());
    cmd_args.push(command.to_string());
    cmd_args.extend(args.iter().cloned());

    cmd_args
}

/// Get details for a single MCP server by name.
fn get_mcp_server(claude: &std::path::Path, name: &str) -> Option<McpServer> {
    let output = platform::command(claude)
        .args(["mcp", "get", name])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Some(parse_mcp_get_output(name, &stdout))
}

/// List MCP servers configured in Claude Code.
pub fn list_mcp_servers(_scope: &McpScope) -> Result<Vec<McpServer>, AppError> {
    let claude = claude_process::find_claude_binary()?;

    let output = platform::command(&claude)
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

    let names = parse_mcp_list_output(&stdout);
    let mut servers = Vec::new();
    for name in &names {
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

    let cmd_args = build_mcp_add_args(name, command, args, env, scope);

    let output = platform::command(&claude)
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

    let output = platform::command(&claude)
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_mcp_get_output tests ---

    #[test]
    fn test_parse_mcp_get_output_full() {
        let stdout = "Type: stdio\nCommand: npx\nArgs: @some/server@latest\nScope: user\nEnv: API_KEY=abc123, HOST=localhost\n";
        let server = parse_mcp_get_output("test-server", stdout);
        assert_eq!(server.name, "test-server");
        assert_eq!(server.command, "npx");
        assert_eq!(server.args, vec!["@some/server@latest"]);
        assert_eq!(server.scope, McpScope::User);
        assert_eq!(server.env.get("API_KEY").unwrap(), "abc123");
        assert_eq!(server.env.get("HOST").unwrap(), "localhost");
    }

    #[test]
    fn test_parse_mcp_get_output_project_scope() {
        let stdout = "Type: stdio\nCommand: node\nArgs: server.js --port 3000\nScope: project\n";
        let server = parse_mcp_get_output("my-server", stdout);
        assert_eq!(server.scope, McpScope::Project);
        assert_eq!(server.args, vec!["server.js", "--port", "3000"]);
    }

    #[test]
    fn test_parse_mcp_get_output_no_args() {
        let stdout = "Type: stdio\nCommand: some-binary\nArgs:\nScope: user\n";
        let server = parse_mcp_get_output("srv", stdout);
        assert_eq!(server.command, "some-binary");
        assert!(server.args.is_empty());
    }

    #[test]
    fn test_parse_mcp_get_output_no_env() {
        let stdout = "Type: stdio\nCommand: node\nArgs: index.js\nScope: user\nEnv:\n";
        let server = parse_mcp_get_output("srv", stdout);
        assert!(server.env.is_empty());
    }

    #[test]
    fn test_parse_mcp_get_output_empty_string() {
        let server = parse_mcp_get_output("empty", "");
        assert_eq!(server.name, "empty");
        assert_eq!(server.command, "");
        assert!(server.args.is_empty());
        assert!(server.env.is_empty());
        assert_eq!(server.scope, McpScope::User);
    }

    #[test]
    fn test_parse_mcp_get_output_extra_whitespace() {
        let stdout =
            "  Type:  stdio  \n  Command:  npx  \n  Args:  foo bar  \n  Scope:  project  \n";
        let server = parse_mcp_get_output("ws", stdout);
        assert_eq!(server.command, "npx");
        assert_eq!(server.args, vec!["foo", "bar"]);
        assert_eq!(server.scope, McpScope::Project);
    }

    #[test]
    fn test_parse_mcp_get_output_unknown_lines_ignored() {
        let stdout = "Name: test\nType: stdio\nCommand: node\nVersion: 1.0\n";
        let server = parse_mcp_get_output("test", stdout);
        assert_eq!(server.command, "node");
    }

    #[test]
    fn test_parse_mcp_get_output_env_with_equals_in_value() {
        let stdout = "Env: KEY=value=with=equals\n";
        let server = parse_mcp_get_output("srv", stdout);
        assert_eq!(server.env.get("KEY").unwrap(), "value=with=equals");
    }

    // --- parse_mcp_list_output tests ---

    #[test]
    fn test_parse_mcp_list_output_multiple_servers() {
        let stdout = "server-a  stdio  user\nserver-b  stdio  project\n";
        let names = parse_mcp_list_output(stdout);
        assert_eq!(names, vec!["server-a", "server-b"]);
    }

    #[test]
    fn test_parse_mcp_list_output_single_server() {
        let stdout = "my-server\n";
        let names = parse_mcp_list_output(stdout);
        assert_eq!(names, vec!["my-server"]);
    }

    #[test]
    fn test_parse_mcp_list_output_empty() {
        let names = parse_mcp_list_output("");
        assert!(names.is_empty());
    }

    #[test]
    fn test_parse_mcp_list_output_blank_lines() {
        let stdout = "\n  \nserver-a\n\nserver-b\n  \n";
        let names = parse_mcp_list_output(stdout);
        assert_eq!(names, vec!["server-a", "server-b"]);
    }

    #[test]
    fn test_parse_mcp_list_output_whitespace_trimmed() {
        let stdout = "  server-a  extra-info  \n";
        let names = parse_mcp_list_output(stdout);
        assert_eq!(names, vec!["server-a"]);
    }

    // --- build_mcp_add_args tests ---

    #[test]
    fn test_build_mcp_add_args_basic() {
        let args = build_mcp_add_args(
            "test-server",
            "npx",
            &["@some/pkg".to_string()],
            &HashMap::new(),
            &McpScope::User,
        );
        assert_eq!(
            args,
            vec![
                "mcp",
                "add",
                "test-server",
                "-s",
                "user",
                "--",
                "npx",
                "@some/pkg"
            ]
        );
    }

    #[test]
    fn test_build_mcp_add_args_with_env() {
        let mut env = HashMap::new();
        env.insert("API_KEY".to_string(), "secret".to_string());
        let args = build_mcp_add_args(
            "srv",
            "node",
            &["server.js".to_string()],
            &env,
            &McpScope::Project,
        );
        assert!(args.contains(&"mcp".to_string()));
        assert!(args.contains(&"add".to_string()));
        assert!(args.contains(&"srv".to_string()));
        assert!(args.contains(&"-s".to_string()));
        assert!(args.contains(&"project".to_string()));
        assert!(args.contains(&"-e".to_string()));
        assert!(args.contains(&"API_KEY=secret".to_string()));
        assert!(args.contains(&"--".to_string()));
        assert!(args.contains(&"node".to_string()));
        assert!(args.contains(&"server.js".to_string()));
    }

    #[test]
    fn test_build_mcp_add_args_no_command_args() {
        let args = build_mcp_add_args("srv", "binary", &[], &HashMap::new(), &McpScope::User);
        assert_eq!(
            args,
            vec!["mcp", "add", "srv", "-s", "user", "--", "binary"]
        );
    }

    #[test]
    fn test_build_mcp_add_args_multiple_args() {
        let args = build_mcp_add_args(
            "srv",
            "node",
            &[
                "--port".to_string(),
                "3000".to_string(),
                "--host".to_string(),
                "0.0.0.0".to_string(),
            ],
            &HashMap::new(),
            &McpScope::User,
        );
        let separator_idx = args.iter().position(|a| a == "--").unwrap();
        let after_sep: Vec<&str> = args[separator_idx + 1..]
            .iter()
            .map(|s| s.as_str())
            .collect();
        assert_eq!(
            after_sep,
            vec!["node", "--port", "3000", "--host", "0.0.0.0"]
        );
    }
}
