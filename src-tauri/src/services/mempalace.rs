use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemPalaceStatus {
    pub python_available: bool,
    pub python_command: Option<String>,
    pub mempalace_installed: bool,
    pub mempalace_version: Option<String>,
    pub palace_initialized: bool,
    pub palace_path: String,
}

/// Try `python3 --version`, then fall back to `python --version`.
/// Returns the working command name (e.g. "python3" or "python").
pub async fn detect_python(override_cmd: Option<&str>) -> Option<String> {
    if let Some(cmd) = override_cmd {
        if run_version_check(cmd).await.is_ok() {
            return Some(cmd.to_string());
        }
        return None;
    }
    for cmd in &["python3", "python"] {
        if run_version_check(cmd).await.is_ok() {
            return Some(cmd.to_string());
        }
    }
    None
}

async fn run_version_check(cmd: &str) -> Result<String, AppError> {
    let output = Command::new(cmd)
        .arg("--version")
        .output()
        .await
        .map_err(|e| AppError::AgentError(format!("Failed to run {cmd}: {e}")))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(AppError::AgentError(format!("{cmd} --version failed")))
    }
}

/// Check if `mempalace` is importable via the given Python command.
/// Returns the version string on success.
pub async fn detect_mempalace(python_cmd: &str) -> Option<String> {
    let output = Command::new(python_cmd)
        .args(["-m", "mempalace", "--version"])
        .output()
        .await
        .ok()?;
    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Some(if version.is_empty() {
            String::from_utf8_lossy(&output.stderr).trim().to_string()
        } else {
            version
        })
    } else {
        None
    }
}

/// Resolve the palace path, defaulting to `~/.mempalace/palace`.
pub fn resolve_palace_path(configured: Option<&str>) -> String {
    if let Some(p) = configured {
        return p.to_string();
    }
    dirs::home_dir()
        .map(|h| h.join(".mempalace").join("palace").to_string_lossy().to_string())
        .unwrap_or_else(|| "~/.mempalace/palace".to_string())
}

/// Check if the palace directory exists.
pub fn palace_exists(palace_path: &str) -> bool {
    Path::new(palace_path).is_dir()
}

/// Initialize a MemPalace palace at the given path.
pub async fn initialize_palace(python_cmd: &str, palace_path: &str) -> Result<(), AppError> {
    let output = Command::new(python_cmd)
        .args(["-m", "mempalace", "init", palace_path])
        .output()
        .await
        .map_err(|e| AppError::AgentError(format!("Failed to run mempalace init: {e}")))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::AgentError(format!(
            "mempalace init failed: {stderr}"
        )))
    }
}

/// Install mempalace using pipx, uv, or pip (in that order of preference).
pub async fn install_mempalace(python_cmd: &str) -> Result<String, AppError> {
    // Try pipx first
    if let Ok(output) = Command::new("pipx")
        .args(["install", "mempalace"])
        .output()
        .await
    {
        if output.status.success() {
            return Ok("Installed via pipx".to_string());
        }
    }

    // Try uv tool
    if let Ok(output) = Command::new("uv")
        .args(["tool", "install", "mempalace"])
        .output()
        .await
    {
        if output.status.success() {
            return Ok("Installed via uv".to_string());
        }
    }

    // Fall back to pip install --user
    let output = Command::new(python_cmd)
        .args(["-m", "pip", "install", "--user", "mempalace"])
        .output()
        .await
        .map_err(|e| AppError::AgentError(format!("pip install failed: {e}")))?;

    if output.status.success() {
        Ok("Installed via pip".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::AgentError(format!(
            "Failed to install mempalace: {stderr}"
        )))
    }
}

/// Get the full status of the MemPalace integration.
pub async fn get_status(
    configured_python: Option<&str>,
    configured_palace_path: Option<&str>,
) -> MemPalaceStatus {
    let palace_path = resolve_palace_path(configured_palace_path);

    let python_cmd = detect_python(configured_python).await;
    let (mempalace_installed, mempalace_version) = if let Some(ref cmd) = python_cmd {
        match detect_mempalace(cmd).await {
            Some(v) => (true, Some(v)),
            None => (false, None),
        }
    } else {
        (false, None)
    };

    MemPalaceStatus {
        python_available: python_cmd.is_some(),
        python_command: python_cmd,
        mempalace_installed,
        mempalace_version,
        palace_initialized: palace_exists(&palace_path),
        palace_path,
    }
}

/// Map a Fury observation category to a MemPalace wing/room pair.
pub fn map_observation_to_drawer(
    category: &str,
    repo_name: &str,
) -> (String, String) {
    let wing = if repo_name.is_empty() {
        "_global".to_string()
    } else {
        repo_name.to_string()
    };
    let room = match category {
        "decision" => "decisions",
        "pattern" => "patterns",
        "error" => "errors",
        "file_change" => "progress",
        "preference" => "preferences",
        _ => "general",
    }
    .to_string();
    (wing, room)
}

/// Sync a batch of observations to MemPalace by spawning a one-shot MCP server process.
pub async fn sync_observations_to_mempalace(
    python_cmd: &str,
    palace_path: &str,
    observations: Vec<MemPalaceSyncEntry>,
) -> Result<usize, AppError> {
    if observations.is_empty() {
        return Ok(0);
    }

    let mut child = tokio::process::Command::new(python_cmd)
        .args(["-m", "mempalace.mcp_server", "--palace", palace_path])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::AgentError(format!("Failed to spawn mempalace MCP server: {e}")))?;

    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| AppError::AgentError("No stdin on mempalace process".to_string()))?;

    use tokio::io::AsyncWriteExt;
    use tokio::io::AsyncBufReadExt;

    // Send initialize request
    let init_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "fury", "version": "1.0.0" }
        }
    });
    let init_line = serde_json::to_string(&init_req)
        .map_err(|e| AppError::AgentError(format!("JSON serialize error: {e}")))?;
    stdin
        .write_all(format!("{init_line}\n").as_bytes())
        .await
        .map_err(|e| AppError::AgentError(format!("Write to mempalace stdin: {e}")))?;

    // Send each observation as a tools/call for mempalace_add_drawer
    let mut synced = 0usize;
    for (i, obs) in observations.iter().enumerate() {
        let (wing, room) = map_observation_to_drawer(&obs.category, &obs.repo_name);
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": i + 1,
            "method": "tools/call",
            "params": {
                "name": "mempalace_add_drawer",
                "arguments": {
                    "wing": wing,
                    "room": room,
                    "content": obs.content,
                    "added_by": "fury"
                }
            }
        });
        let line = serde_json::to_string(&req)
            .map_err(|e| AppError::AgentError(format!("JSON serialize error: {e}")))?;
        stdin
            .write_all(format!("{line}\n").as_bytes())
            .await
            .map_err(|e| AppError::AgentError(format!("Write to mempalace stdin: {e}")))?;
        synced += 1;
    }

    // Close stdin to signal EOF → server exits
    drop(child.stdin.take());

    // Read stdout to drain responses (don't block indefinitely)
    if let Some(stdout) = child.stdout.take() {
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        // Read up to synced+1 responses (init + N tool calls)
        let expected = synced + 1;
        for _ in 0..expected {
            match tokio::time::timeout(
                std::time::Duration::from_secs(30),
                lines.next_line(),
            )
            .await
            {
                Ok(Ok(Some(_))) => {}
                _ => break,
            }
        }
    }

    // Wait for process exit (with timeout)
    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), child.wait()).await;

    Ok(synced)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemPalaceSyncEntry {
    pub content: String,
    pub category: String,
    pub repo_name: String,
    pub file_paths: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_observation_to_drawer() {
        let (wing, room) = map_observation_to_drawer("decision", "fury");
        assert_eq!(wing, "fury");
        assert_eq!(room, "decisions");

        let (wing, room) = map_observation_to_drawer("error", "");
        assert_eq!(wing, "_global");
        assert_eq!(room, "errors");

        let (wing, room) = map_observation_to_drawer("unknown_type", "myrepo");
        assert_eq!(wing, "myrepo");
        assert_eq!(room, "general");
    }

    #[test]
    fn test_resolve_palace_path_with_configured() {
        let result = resolve_palace_path(Some("/custom/path"));
        assert_eq!(result, "/custom/path");
    }

    #[test]
    fn test_resolve_palace_path_default() {
        let result = resolve_palace_path(None);
        assert!(result.contains(".mempalace"));
        assert!(result.ends_with("palace"));
    }

    #[test]
    fn test_palace_exists_false_for_nonexistent() {
        assert!(!palace_exists("/nonexistent/path/to/palace"));
    }
}
