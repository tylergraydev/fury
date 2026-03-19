use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::devcontainer::{
    ContainerBackend, ContainerStatus, ContainerStatusEvent, DevContainerConfig,
};

// --- Extracted pure logic for testability ---

/// Build the argument list for `docker exec` commands.
#[allow(dead_code)]
pub fn build_container_exec_args(
    container_id: &str,
    cmd: &[String],
    working_dir: Option<&str>,
    env_vars: &std::collections::HashMap<String, String>,
) -> Vec<String> {
    let mut args = vec!["exec".to_string(), "-i".to_string()];

    if let Some(dir) = working_dir {
        args.push("-w".to_string());
        args.push(dir.to_string());
    }

    for (key, value) in env_vars {
        args.push("-e".to_string());
        args.push(format!("{}={}", key, value));
    }

    args.push(container_id.to_string());
    args.extend(cmd.iter().cloned());
    args
}

/// Build the argument list for `docker run` to start a container.
#[allow(dead_code)]
pub fn build_docker_run_args(
    container_name: &str,
    workspace_mount: &str,
    image: &str,
    env_vars: &std::collections::HashMap<String, String>,
    extra_docker_args: &[String],
) -> Vec<String> {
    let mut args = vec![
        "run".to_string(),
        "-d".to_string(),
        "--name".to_string(),
        container_name.to_string(),
        "-v".to_string(),
        workspace_mount.to_string(),
    ];

    for (key, value) in env_vars {
        args.push("-e".to_string());
        args.push(format!("{}={}", key, value));
    }

    args.extend(extra_docker_args.iter().cloned());

    args.push(image.to_string());
    args.push("sleep".to_string());
    args.push("infinity".to_string());

    args
}

/// Build the workspace mount string for docker volumes.
#[allow(dead_code)]
pub fn build_workspace_mount(workspace_folder: &Path) -> String {
    format!(
        "{}:/workspaces/{}",
        workspace_folder.to_string_lossy(),
        workspace_folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "workspace".to_string())
    )
}

/// Build container name from workspace ID.
#[allow(dead_code)]
pub fn build_container_name(ws_id: uuid::Uuid) -> String {
    format!("fury-{}", ws_id)
}

/// Build the container log event name.
#[allow(dead_code)]
pub fn build_container_log_event(ws_id: uuid::Uuid) -> String {
    format!("container-log:{}", ws_id)
}

/// Build the container status event name.
#[allow(dead_code)]
pub fn build_container_status_event(ws_id: uuid::Uuid) -> String {
    format!("container-status:{}", ws_id)
}

/// Locate the `docker` binary in PATH.
pub fn find_docker_binary() -> Result<PathBuf, AppError> {
    which::which("docker").map_err(|_| {
        AppError::ContainerError(
            "Docker not found in PATH. Install Docker Desktop from https://www.docker.com"
                .to_string(),
        )
    })
}

/// Locate the `devcontainer` CLI binary in PATH.
pub fn find_devcontainer_binary() -> Result<PathBuf, AppError> {
    which::which("devcontainer").map_err(|_| {
        AppError::ContainerError(
            "devcontainer CLI not found in PATH. Install with: npm install -g @devcontainers/cli"
                .to_string(),
        )
    })
}

/// Scan for devcontainer.json in common locations within a repository.
/// Returns the relative path from repo root if found.
pub fn detect_devcontainer_json(repo_path: &Path) -> Option<String> {
    let candidates = [
        ".devcontainer/devcontainer.json",
        ".devcontainer.json",
    ];
    for candidate in &candidates {
        if repo_path.join(candidate).exists() {
            return Some(candidate.to_string());
        }
    }
    // Check subdirectories of .devcontainer/
    let devcontainer_dir = repo_path.join(".devcontainer");
    if devcontainer_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&devcontainer_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let nested = path.join("devcontainer.json");
                    if nested.exists() {
                        if let Ok(rel) = nested.strip_prefix(repo_path) {
                            return Some(rel.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

/// Start a container using the devcontainer CLI.
/// Streams build logs via `container-log:{ws_id}` events.
/// Returns the container ID on success.
pub async fn devcontainer_up(
    ws_id: Uuid,
    workspace_folder: &Path,
    config: &DevContainerConfig,
    app: &AppHandle,
) -> Result<String, AppError> {
    let devcontainer_bin = find_devcontainer_binary()?;

    let mut args = vec![
        "up".to_string(),
        "--workspace-folder".to_string(),
        workspace_folder.to_string_lossy().to_string(),
    ];

    if let Some(ref dc_path) = config.devcontainer_path {
        args.push("--config".to_string());
        args.push(
            workspace_folder
                .join(dc_path)
                .to_string_lossy()
                .to_string(),
        );
    }

    let mut child = Command::new(&devcontainer_bin)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ContainerError(format!("Failed to start devcontainer: {}", e)))?;

    let stderr = child.stderr.take();
    let app_clone = app.clone();
    let log_event = format!("container-log:{}", ws_id);

    if let Some(stderr) = stderr {
        let event_name = log_event.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit(&event_name, &line);
            }
        });
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| AppError::ContainerError(format!("devcontainer up failed: {}", e)))?;

    if !output.status.success() {
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::ContainerError(format!(
            "devcontainer up failed: {}",
            stderr_str
        )));
    }

    // Parse container ID from stdout JSON output
    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let container_id = parse_devcontainer_up_output(&stdout_str)?;

    Ok(container_id)
}

/// Parse the JSON output from `devcontainer up` to extract containerId.
fn parse_devcontainer_up_output(output: &str) -> Result<String, AppError> {
    // devcontainer up outputs JSON with containerId field
    for line in output.lines().rev() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(id) = json.get("containerId").and_then(|v| v.as_str()) {
                return Ok(id.to_string());
            }
        }
    }
    Err(AppError::ContainerError(
        "Could not parse container ID from devcontainer up output".to_string(),
    ))
}

/// Start a container using raw docker run.
/// Returns the container ID on success.
pub async fn docker_up(
    ws_id: Uuid,
    workspace_folder: &Path,
    config: &DevContainerConfig,
    app: &AppHandle,
) -> Result<String, AppError> {
    let docker_bin = find_docker_binary()?;

    if let Some(ref compose_file) = config.compose_file {
        return docker_compose_up(ws_id, workspace_folder, compose_file, config, app).await;
    }

    let image = config.image.as_deref().ok_or_else(|| {
        AppError::ContainerError("No image specified for raw Docker backend".to_string())
    })?;

    let container_name = format!("fury-{}", ws_id);
    let workspace_mount = format!(
        "{}:/workspaces/{}",
        workspace_folder.to_string_lossy(),
        workspace_folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "workspace".to_string())
    );

    let mut args = vec![
        "run".to_string(),
        "-d".to_string(),
        "--name".to_string(),
        container_name.clone(),
        "-v".to_string(),
        workspace_mount,
    ];

    // Add env vars
    for (key, value) in &config.container_env_vars {
        args.push("-e".to_string());
        args.push(format!("{}={}", key, value));
    }

    // Add extra docker args
    args.extend(config.extra_docker_args.iter().cloned());

    args.push(image.to_string());
    // Keep container alive with sleep infinity
    args.push("sleep".to_string());
    args.push("infinity".to_string());

    let output = Command::new(&docker_bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| AppError::ContainerError(format!("docker run failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::ContainerError(format!(
            "docker run failed: {}",
            stderr
        )));
    }

    let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let _ = app.emit(
        &format!("container-log:{}", ws_id),
        &format!("Container started: {}", &container_id[..12.min(container_id.len())]),
    );

    Ok(container_id)
}

/// Start services using docker-compose.
async fn docker_compose_up(
    ws_id: Uuid,
    workspace_folder: &Path,
    compose_file: &str,
    config: &DevContainerConfig,
    app: &AppHandle,
) -> Result<String, AppError> {
    let docker_bin = find_docker_binary()?;

    let compose_path = workspace_folder.join(compose_file);
    let mut child = Command::new(&docker_bin)
        .args([
            "compose",
            "-f",
            &compose_path.to_string_lossy(),
            "up",
            "-d",
        ])
        .current_dir(workspace_folder)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ContainerError(format!("docker compose up failed: {}", e)))?;

    let stderr = child.stderr.take();
    let app_clone = app.clone();
    let log_event = format!("container-log:{}", ws_id);

    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit(&log_event, &line);
            }
        });
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| AppError::ContainerError(format!("docker compose up failed: {}", e)))?;

    if !output.status.success() {
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::ContainerError(format!(
            "docker compose up failed: {}",
            stderr_str
        )));
    }

    // Get the container ID for the service
    let service = config
        .compose_service
        .as_deref()
        .unwrap_or("app");

    let ps_output = Command::new(&docker_bin)
        .args([
            "compose",
            "-f",
            &compose_path.to_string_lossy(),
            "ps",
            "-q",
            service,
        ])
        .current_dir(workspace_folder)
        .output()
        .await
        .map_err(|e| AppError::ContainerError(format!("docker compose ps failed: {}", e)))?;

    let container_id = String::from_utf8_lossy(&ps_output.stdout)
        .trim()
        .to_string();

    if container_id.is_empty() {
        return Err(AppError::ContainerError(format!(
            "No container found for service '{}'. Check your compose file.",
            service
        )));
    }

    Ok(container_id)
}

/// Execute a command inside a running container.
/// Returns a Child process for streaming.
#[allow(dead_code)]
pub async fn container_exec(
    container_id: &str,
    cmd: &[String],
    working_dir: Option<&str>,
    env_vars: &std::collections::HashMap<String, String>,
) -> Result<tokio::process::Child, AppError> {
    let docker_bin = find_docker_binary()?;

    let mut args = vec!["exec".to_string(), "-i".to_string()];

    if let Some(dir) = working_dir {
        args.push("-w".to_string());
        args.push(dir.to_string());
    }

    for (key, value) in env_vars {
        args.push("-e".to_string());
        args.push(format!("{}={}", key, value));
    }

    args.push(container_id.to_string());
    args.extend(cmd.iter().cloned());

    let child = Command::new(&docker_bin)
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ContainerError(format!("docker exec failed: {}", e)))?;

    Ok(child)
}

/// Stop a container.
pub async fn container_stop(
    container_id: &str,
    config: &DevContainerConfig,
    workspace_folder: Option<&Path>,
) -> Result<(), AppError> {
    if config.backend == ContainerBackend::DevcontainerCli {
        if let Some(folder) = workspace_folder {
            if let Ok(bin) = find_devcontainer_binary() {
                let output = Command::new(&bin)
                    .args(["stop", "--workspace-folder", &folder.to_string_lossy()])
                    .output()
                    .await;
                if let Ok(out) = output {
                    if out.status.success() {
                        return Ok(());
                    }
                }
            }
        }
    }

    // Fallback to docker stop
    let docker_bin = find_docker_binary()?;
    let output = Command::new(&docker_bin)
        .args(["stop", container_id])
        .output()
        .await
        .map_err(|e| AppError::ContainerError(format!("docker stop failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::ContainerError(format!(
            "docker stop failed: {}",
            stderr
        )));
    }

    Ok(())
}

/// Force remove a container.
pub async fn container_remove(container_id: &str) -> Result<(), AppError> {
    let docker_bin = find_docker_binary()?;
    let output = Command::new(&docker_bin)
        .args(["rm", "-f", container_id])
        .output()
        .await
        .map_err(|e| AppError::ContainerError(format!("docker rm failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::ContainerError(format!(
            "docker rm failed: {}",
            stderr
        )));
    }

    Ok(())
}

/// Check if a container is currently running.
#[allow(dead_code)]
pub async fn is_container_running(container_id: &str) -> Result<bool, AppError> {
    let docker_bin = find_docker_binary()?;
    let output = Command::new(&docker_bin)
        .args([
            "inspect",
            "--format",
            "{{.State.Running}}",
            container_id,
        ])
        .output()
        .await
        .map_err(|e| AppError::ContainerError(format!("docker inspect failed: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(stdout == "true")
}

/// Resolve the working directory inside the container.
pub fn resolve_container_workspace_path(
    config: &DevContainerConfig,
    repo_name: &str,
) -> String {
    config
        .container_workspace_path
        .clone()
        .unwrap_or_else(|| format!("/workspaces/{}", repo_name))
}

/// Emit a container status event to the frontend.
pub fn emit_container_status(
    app: &AppHandle,
    ws_id: Uuid,
    status: &ContainerStatus,
    container_id: Option<&str>,
) {
    let event = ContainerStatusEvent {
        workspace_id: ws_id,
        status: status.clone(),
        container_id: container_id.map(|s| s.to_string()),
    };
    let _ = app.emit(&format!("container-status:{}", ws_id), &event);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_devcontainer_json_not_found() {
        let dir = tempfile::tempdir().unwrap();
        assert!(detect_devcontainer_json(dir.path()).is_none());
    }

    #[test]
    fn test_detect_devcontainer_json_standard() {
        let dir = tempfile::tempdir().unwrap();
        let dc_dir = dir.path().join(".devcontainer");
        std::fs::create_dir_all(&dc_dir).unwrap();
        std::fs::write(dc_dir.join("devcontainer.json"), "{}").unwrap();
        assert_eq!(
            detect_devcontainer_json(dir.path()),
            Some(".devcontainer/devcontainer.json".to_string())
        );
    }

    #[test]
    fn test_detect_devcontainer_json_root() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".devcontainer.json"), "{}").unwrap();
        assert_eq!(
            detect_devcontainer_json(dir.path()),
            Some(".devcontainer.json".to_string())
        );
    }

    #[test]
    fn test_detect_devcontainer_json_subdirectory() {
        let dir = tempfile::tempdir().unwrap();
        let sub_dir = dir.path().join(".devcontainer").join("python");
        std::fs::create_dir_all(&sub_dir).unwrap();
        std::fs::write(sub_dir.join("devcontainer.json"), "{}").unwrap();
        let result = detect_devcontainer_json(dir.path());
        assert!(result.is_some());
        assert!(result.unwrap().contains("python/devcontainer.json"));
    }

    #[test]
    fn test_resolve_container_workspace_path_default() {
        let config = DevContainerConfig::default();
        let path = resolve_container_workspace_path(&config, "myrepo");
        assert_eq!(path, "/workspaces/myrepo");
    }

    #[test]
    fn test_resolve_container_workspace_path_custom() {
        let config = DevContainerConfig {
            container_workspace_path: Some("/app".to_string()),
            ..Default::default()
        };
        let path = resolve_container_workspace_path(&config, "myrepo");
        assert_eq!(path, "/app");
    }

    #[test]
    fn test_parse_devcontainer_up_output_valid() {
        let output = r#"{"outcome":"success","containerId":"abc123def456","remoteUser":"vscode"}"#;
        let id = parse_devcontainer_up_output(output).unwrap();
        assert_eq!(id, "abc123def456");
    }

    #[test]
    fn test_parse_devcontainer_up_output_invalid() {
        let output = "some random output\nnot json";
        assert!(parse_devcontainer_up_output(output).is_err());
    }

    #[test]
    fn test_detect_devcontainer_json_prefers_standard_over_root() {
        let dir = tempfile::tempdir().unwrap();
        // Create both: .devcontainer/devcontainer.json and .devcontainer.json
        let dc_dir = dir.path().join(".devcontainer");
        std::fs::create_dir_all(&dc_dir).unwrap();
        std::fs::write(dc_dir.join("devcontainer.json"), "{}").unwrap();
        std::fs::write(dir.path().join(".devcontainer.json"), "{}").unwrap();
        // Should find .devcontainer/devcontainer.json first (candidates array order)
        assert_eq!(
            detect_devcontainer_json(dir.path()),
            Some(".devcontainer/devcontainer.json".to_string())
        );
    }

    #[test]
    fn test_detect_devcontainer_json_empty_devcontainer_dir() {
        let dir = tempfile::tempdir().unwrap();
        let dc_dir = dir.path().join(".devcontainer");
        std::fs::create_dir_all(&dc_dir).unwrap();
        // Dir exists but no devcontainer.json inside
        assert!(detect_devcontainer_json(dir.path()).is_none());
    }

    #[test]
    fn test_parse_devcontainer_up_output_multiline_picks_last_json() {
        let output = "Building image...\nPulling base...\n{\"outcome\":\"success\",\"containerId\":\"final123\",\"remoteUser\":\"vscode\"}";
        let id = parse_devcontainer_up_output(output).unwrap();
        assert_eq!(id, "final123");
    }

    #[test]
    fn test_parse_devcontainer_up_output_json_without_container_id() {
        let output = r#"{"outcome":"success","remoteUser":"vscode"}"#;
        assert!(parse_devcontainer_up_output(output).is_err());
    }

    #[test]
    fn test_parse_devcontainer_up_output_empty_string() {
        assert!(parse_devcontainer_up_output("").is_err());
    }

    #[test]
    fn test_parse_devcontainer_up_output_multiple_json_lines() {
        // The function iterates in reverse, so it should pick the last line with containerId
        let output = "{\"containerId\":\"first\"}\n{\"containerId\":\"second\"}";
        let id = parse_devcontainer_up_output(output).unwrap();
        assert_eq!(id, "second");
    }

    #[test]
    fn test_parse_devcontainer_up_output_whitespace_only() {
        assert!(parse_devcontainer_up_output("   \n  \n").is_err());
    }

    #[test]
    fn test_parse_devcontainer_up_output_mixed_json_and_text() {
        let output = "Step 1/5: Building...\n{\"status\":\"building\"}\nStep 5/5: Done\n{\"outcome\":\"success\",\"containerId\":\"abc789\"}";
        let id = parse_devcontainer_up_output(output).unwrap();
        assert_eq!(id, "abc789");
    }

    #[test]
    fn test_parse_devcontainer_up_output_container_id_null() {
        let output = r#"{"containerId":null}"#;
        assert!(parse_devcontainer_up_output(output).is_err());
    }

    #[test]
    fn test_parse_devcontainer_up_output_container_id_empty_string() {
        let output = r#"{"containerId":""}"#;
        let id = parse_devcontainer_up_output(output).unwrap();
        assert_eq!(id, "");
    }

    #[test]
    fn test_resolve_container_workspace_path_empty_repo_name() {
        let config = DevContainerConfig::default();
        let path = resolve_container_workspace_path(&config, "");
        assert_eq!(path, "/workspaces/");
    }

    #[test]
    fn test_detect_devcontainer_json_file_not_dir_in_devcontainer() {
        // .devcontainer dir exists with a regular file (not a subdir), should not match
        let dir = tempfile::tempdir().unwrap();
        let dc_dir = dir.path().join(".devcontainer");
        std::fs::create_dir_all(&dc_dir).unwrap();
        // Create a regular file, not a subdir
        std::fs::write(dc_dir.join("README.md"), "# devcontainer").unwrap();
        assert!(detect_devcontainer_json(dir.path()).is_none());
    }

    #[test]
    fn test_detect_devcontainer_json_multiple_subdirectories() {
        let dir = tempfile::tempdir().unwrap();
        let dc_dir = dir.path().join(".devcontainer");
        // Create two subdirectories with devcontainer.json
        let sub1 = dc_dir.join("node");
        let sub2 = dc_dir.join("python");
        std::fs::create_dir_all(&sub1).unwrap();
        std::fs::create_dir_all(&sub2).unwrap();
        std::fs::write(sub1.join("devcontainer.json"), "{}").unwrap();
        std::fs::write(sub2.join("devcontainer.json"), "{}").unwrap();
        let result = detect_devcontainer_json(dir.path());
        assert!(result.is_some());
        let r = result.unwrap();
        // Should find one of them (order depends on fs iteration)
        assert!(r.contains("devcontainer.json"));
    }

    #[test]
    fn test_detect_devcontainer_json_nested_subdir_without_json() {
        let dir = tempfile::tempdir().unwrap();
        let dc_dir = dir.path().join(".devcontainer");
        let sub = dc_dir.join("custom");
        std::fs::create_dir_all(&sub).unwrap();
        // Subdir exists but no devcontainer.json
        std::fs::write(sub.join("Dockerfile"), "FROM node").unwrap();
        assert!(detect_devcontainer_json(dir.path()).is_none());
    }

    // --- Tests for extracted pure logic ---

    #[test]
    fn test_build_container_exec_args_basic() {
        let args = build_container_exec_args(
            "abc123",
            &["ls".to_string(), "-la".to_string()],
            None,
            &std::collections::HashMap::new(),
        );
        assert_eq!(args, vec!["exec", "-i", "abc123", "ls", "-la"]);
    }

    #[test]
    fn test_build_container_exec_args_with_working_dir() {
        let args = build_container_exec_args(
            "abc123",
            &["pwd".to_string()],
            Some("/workspaces/myapp"),
            &std::collections::HashMap::new(),
        );
        assert_eq!(args, vec!["exec", "-i", "-w", "/workspaces/myapp", "abc123", "pwd"]);
    }

    #[test]
    fn test_build_container_exec_args_with_env() {
        let mut env = std::collections::HashMap::new();
        env.insert("NODE_ENV".to_string(), "test".to_string());
        let args = build_container_exec_args(
            "ctr1",
            &["npm".to_string(), "test".to_string()],
            None,
            &env,
        );
        assert!(args.contains(&"-e".to_string()));
        assert!(args.contains(&"NODE_ENV=test".to_string()));
        assert!(args.contains(&"ctr1".to_string()));
    }

    #[test]
    fn test_build_container_exec_args_with_all_options() {
        let mut env = std::collections::HashMap::new();
        env.insert("KEY".to_string(), "VAL".to_string());
        let args = build_container_exec_args(
            "ctr",
            &["bash".to_string()],
            Some("/app"),
            &env,
        );
        // Order: exec -i -w /app -e KEY=VAL ctr bash
        assert_eq!(args[0], "exec");
        assert_eq!(args[1], "-i");
        assert_eq!(args[2], "-w");
        assert_eq!(args[3], "/app");
        let ctr_idx = args.iter().position(|a| a == "ctr").unwrap();
        let env_idx = args.iter().position(|a| a == "KEY=VAL").unwrap();
        assert!(env_idx < ctr_idx);
    }

    #[test]
    fn test_build_docker_run_args_basic() {
        let args = build_docker_run_args(
            "fury-123",
            "/home/user/project:/workspaces/project",
            "node:20",
            &std::collections::HashMap::new(),
            &[],
        );
        assert_eq!(args[0], "run");
        assert_eq!(args[1], "-d");
        assert_eq!(args[2], "--name");
        assert_eq!(args[3], "fury-123");
        assert_eq!(args[4], "-v");
        assert_eq!(args[5], "/home/user/project:/workspaces/project");
        assert_eq!(args[6], "node:20");
        assert_eq!(args[7], "sleep");
        assert_eq!(args[8], "infinity");
    }

    #[test]
    fn test_build_docker_run_args_with_env() {
        let mut env = std::collections::HashMap::new();
        env.insert("PORT".to_string(), "3000".to_string());
        let args = build_docker_run_args(
            "fury-abc",
            "/src:/workspaces/src",
            "ubuntu:22.04",
            &env,
            &[],
        );
        assert!(args.contains(&"-e".to_string()));
        assert!(args.contains(&"PORT=3000".to_string()));
    }

    #[test]
    fn test_build_docker_run_args_with_extra_args() {
        let extra = vec!["--gpus=all".to_string(), "--shm-size=2g".to_string()];
        let args = build_docker_run_args(
            "fury-abc",
            "/src:/workspaces/src",
            "nvidia/cuda:latest",
            &std::collections::HashMap::new(),
            &extra,
        );
        assert!(args.contains(&"--gpus=all".to_string()));
        assert!(args.contains(&"--shm-size=2g".to_string()));
        // Extra args should come before image name
        let gpu_idx = args.iter().position(|a| a == "--gpus=all").unwrap();
        let img_idx = args.iter().position(|a| a == "nvidia/cuda:latest").unwrap();
        assert!(gpu_idx < img_idx);
    }

    #[test]
    fn test_build_workspace_mount_regular_path() {
        let path = PathBuf::from("/home/user/myproject");
        let mount = build_workspace_mount(&path);
        assert_eq!(mount, "/home/user/myproject:/workspaces/myproject");
    }

    #[test]
    fn test_build_workspace_mount_root_path() {
        let path = PathBuf::from("/");
        let mount = build_workspace_mount(&path);
        // Root path has no file_name, should use "workspace" fallback
        assert_eq!(mount, "/:/workspaces/workspace");
    }

    #[test]
    fn test_build_workspace_mount_nested_path() {
        let path = PathBuf::from("/Users/dev/code/fury");
        let mount = build_workspace_mount(&path);
        assert_eq!(mount, "/Users/dev/code/fury:/workspaces/fury");
    }

    #[test]
    fn test_build_container_name() {
        let id = Uuid::parse_str("12345678-1234-1234-1234-123456789abc").unwrap();
        let name = build_container_name(id);
        assert_eq!(name, "fury-12345678-1234-1234-1234-123456789abc");
    }

    #[test]
    fn test_build_container_log_event() {
        let id = Uuid::parse_str("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").unwrap();
        let event = build_container_log_event(id);
        assert_eq!(event, "container-log:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    }

    #[test]
    fn test_build_container_status_event() {
        let id = Uuid::parse_str("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").unwrap();
        let event = build_container_status_event(id);
        assert_eq!(event, "container-status:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    }
}
