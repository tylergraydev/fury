use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::mcp::{CursorMigrationResult, CursorRulesImportResult, McpScope, McpServer};
use crate::services::mcp as mcp_svc;

/// Check if Cursor MCP config exists at ~/.cursor/mcp.json.
pub fn detect_cursor_config() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let path = home.join(".cursor").join("mcp.json");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Parse Cursor's mcp.json format into McpServer entries.
///
/// Expected format:
/// ```json
/// {
///   "mcpServers": {
///     "server-name": {
///       "command": "node",
///       "args": ["/path/to/server.js"],
///       "env": { "KEY": "value" }
///     }
///   }
/// }
/// ```
pub fn parse_cursor_mcp(path: &Path) -> Result<Vec<McpServer>, AppError> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| AppError::McpError(format!("Failed to read Cursor config: {}", e)))?;

    let raw: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::McpError(format!("Failed to parse Cursor config: {}", e)))?;

    let servers_obj = raw
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .ok_or_else(|| AppError::McpError("No mcpServers key in Cursor config".to_string()))?;

    let servers = servers_obj
        .iter()
        .map(|(name, val)| McpServer {
            name: name.clone(),
            command: val
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            args: val
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
            env: val
                .get("env")
                .and_then(|v| serde_json::from_value::<HashMap<String, String>>(v.clone()).ok())
                .unwrap_or_default(),
            scope: McpScope::User,
        })
        .collect();

    Ok(servers)
}

/// Import MCP servers from Cursor config into Claude Code.
pub fn import_cursor_mcp_servers() -> Result<CursorMigrationResult, AppError> {
    let config_path = detect_cursor_config().ok_or_else(|| {
        AppError::McpError("Cursor config not found at ~/.cursor/mcp.json".to_string())
    })?;

    let servers = parse_cursor_mcp(&config_path)?;
    let found = servers.len();
    let mut imported = 0;

    for server in &servers {
        match mcp_svc::add_mcp_server(
            &server.name,
            &server.command,
            &server.args,
            &server.env,
            &McpScope::User,
        ) {
            Ok(()) => imported += 1,
            Err(e) => {
                eprintln!("Failed to import MCP server '{}': {}", server.name, e);
            }
        }
    }

    Ok(CursorMigrationResult {
        mcp_servers_found: found,
        mcp_servers_imported: imported,
        rules_found: false,
    })
}

/// Check if .cursorrules exists in a repo directory.
pub fn detect_cursorrules(repo_path: &Path) -> bool {
    repo_path.join(".cursorrules").exists()
}

/// Read the content of a .cursorrules file.
pub fn read_cursorrules(repo_path: &Path) -> Result<String, AppError> {
    let rules_path = repo_path.join(".cursorrules");
    std::fs::read_to_string(&rules_path)
        .map_err(|e| AppError::McpError(format!("Failed to read .cursorrules: {}", e)))
}

/// Convert .cursorrules content to CLAUDE.md format.
pub fn convert_cursorrules_to_claude_md(rules_content: &str) -> String {
    let mut output = String::new();
    output.push_str("# Project Guidelines\n\n");
    output.push_str("<!-- Imported from .cursorrules -->\n\n");
    output.push_str(rules_content.trim());
    output.push('\n');
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_cursor_config() {
        // Just verify it doesn't panic and returns an Option
        let result = detect_cursor_config();
        // We can't control ~/.cursor/mcp.json in tests, but the function should work
        let _ = result;
    }

    #[test]
    fn test_parse_cursor_mcp_valid() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("mcp.json");
        std::fs::write(
            &path,
            r#"{
                "mcpServers": {
                    "test-server": {
                        "command": "node",
                        "args": ["/path/to/server.js", "--stdio"],
                        "env": { "API_KEY": "secret" }
                    }
                }
            }"#,
        )
        .unwrap();

        let servers = parse_cursor_mcp(&path).unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "test-server");
        assert_eq!(servers[0].command, "node");
        assert_eq!(servers[0].args, vec!["/path/to/server.js", "--stdio"]);
        assert_eq!(servers[0].env.get("API_KEY").unwrap(), "secret");
    }

    #[test]
    fn test_parse_cursor_mcp_empty_servers() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("mcp.json");
        std::fs::write(&path, r#"{"mcpServers": {}}"#).unwrap();
        let servers = parse_cursor_mcp(&path).unwrap();
        assert!(servers.is_empty());
    }

    #[test]
    fn test_parse_cursor_mcp_missing_key() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("mcp.json");
        std::fs::write(&path, r#"{"other": "stuff"}"#).unwrap();
        let result = parse_cursor_mcp(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_cursor_mcp_malformed_json() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("mcp.json");
        std::fs::write(&path, "not json").unwrap();
        let result = parse_cursor_mcp(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_cursor_mcp_missing_optional_fields() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("mcp.json");
        std::fs::write(&path, r#"{"mcpServers": {"minimal": {}}}"#).unwrap();
        let servers = parse_cursor_mcp(&path).unwrap();
        assert_eq!(servers[0].command, "");
        assert!(servers[0].args.is_empty());
        assert!(servers[0].env.is_empty());
    }

    #[test]
    fn test_parse_cursor_mcp_file_not_found() {
        let result = parse_cursor_mcp(Path::new("/nonexistent/mcp.json"));
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_cursorrules_present() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join(".cursorrules"), "rules").unwrap();
        assert!(detect_cursorrules(dir.path()));
    }

    #[test]
    fn test_detect_cursorrules_absent() {
        let dir = tempfile::TempDir::new().unwrap();
        assert!(!detect_cursorrules(dir.path()));
    }

    #[test]
    fn test_read_cursorrules_success() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join(".cursorrules"), "my rules").unwrap();
        let result = read_cursorrules(dir.path()).unwrap();
        assert_eq!(result, "my rules");
    }

    #[test]
    fn test_read_cursorrules_missing() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = read_cursorrules(dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_convert_cursorrules_to_claude_md() {
        let result = convert_cursorrules_to_claude_md("Use TypeScript strict mode");
        assert!(result.contains("# Project Guidelines"));
        assert!(result.contains("Imported from .cursorrules"));
        assert!(result.contains("Use TypeScript strict mode"));
    }

    #[test]
    fn test_convert_cursorrules_to_claude_md_trims_whitespace() {
        let result = convert_cursorrules_to_claude_md("  content  \n  ");
        assert!(result.contains("content"));
    }

    #[test]
    fn test_convert_cursorrules_to_claude_md_empty() {
        let result = convert_cursorrules_to_claude_md("");
        assert!(result.contains("# Project Guidelines"));
    }

    #[test]
    fn test_import_cursorrules_no_rules() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = import_cursorrules(dir.path(), false).unwrap();
        assert!(!result.rules_found);
        assert!(!result.written);
    }

    #[test]
    fn test_import_cursorrules_creates_claude_md() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join(".cursorrules"), "rules content").unwrap();
        let result = import_cursorrules(dir.path(), false).unwrap();
        assert!(result.rules_found);
        assert!(!result.claude_md_existed);
        assert!(result.written);
        assert!(dir.path().join("CLAUDE.md").exists());
    }

    #[test]
    fn test_import_cursorrules_existing_claude_md_no_overwrite() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join(".cursorrules"), "rules").unwrap();
        std::fs::write(dir.path().join("CLAUDE.md"), "existing").unwrap();
        let result = import_cursorrules(dir.path(), false).unwrap();
        assert!(result.rules_found);
        assert!(result.claude_md_existed);
        assert!(!result.written);
        // CLAUDE.md should be unchanged
        assert_eq!(
            std::fs::read_to_string(dir.path().join("CLAUDE.md")).unwrap(),
            "existing"
        );
    }

    #[test]
    fn test_import_cursorrules_existing_claude_md_with_overwrite() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join(".cursorrules"), "new rules").unwrap();
        std::fs::write(dir.path().join("CLAUDE.md"), "existing content").unwrap();
        let result = import_cursorrules(dir.path(), true).unwrap();
        assert!(result.written);
        let content = std::fs::read_to_string(dir.path().join("CLAUDE.md")).unwrap();
        assert!(content.contains("new rules"));
        assert!(content.contains("existing content"));
        assert!(content.contains("---"));
    }
}

/// Import .cursorrules into CLAUDE.md for a given repo.
pub fn import_cursorrules(
    repo_path: &Path,
    overwrite: bool,
) -> Result<CursorRulesImportResult, AppError> {
    if !detect_cursorrules(repo_path) {
        return Ok(CursorRulesImportResult {
            rules_found: false,
            claude_md_existed: false,
            written: false,
            claude_md_path: String::new(),
        });
    }

    let claude_md_path = repo_path.join("CLAUDE.md");
    let claude_md_existed = claude_md_path.exists();

    if claude_md_existed && !overwrite {
        return Ok(CursorRulesImportResult {
            rules_found: true,
            claude_md_existed: true,
            written: false,
            claude_md_path: claude_md_path.to_string_lossy().to_string(),
        });
    }

    let rules_content = read_cursorrules(repo_path)?;
    let claude_md_content = convert_cursorrules_to_claude_md(&rules_content);

    if claude_md_existed && overwrite {
        let existing = std::fs::read_to_string(&claude_md_path)
            .map_err(|e| AppError::McpError(format!("Failed to read CLAUDE.md: {}", e)))?;
        let merged = format!("{}\n---\n\n{}", claude_md_content.trim(), existing);
        std::fs::write(&claude_md_path, merged)
            .map_err(|e| AppError::McpError(format!("Failed to write CLAUDE.md: {}", e)))?;
    } else {
        std::fs::write(&claude_md_path, &claude_md_content)
            .map_err(|e| AppError::McpError(format!("Failed to write CLAUDE.md: {}", e)))?;
    }

    Ok(CursorRulesImportResult {
        rules_found: true,
        claude_md_existed,
        written: true,
        claude_md_path: claude_md_path.to_string_lossy().to_string(),
    })
}
