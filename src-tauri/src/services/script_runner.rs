use std::collections::HashMap;
use std::path::Path;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::error::AppError;
use crate::platform;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScriptKind {
    Setup,
    Run,
    Archive,
}

impl ScriptKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Setup => "setup",
            Self::Run => "run",
            Self::Archive => "archive",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, AppError> {
        match s {
            "setup" => Ok(Self::Setup),
            "run" => Ok(Self::Run),
            "archive" => Ok(Self::Archive),
            _ => Err(AppError::ScriptError(format!("Unknown script kind: {}", s))),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutputEvent {
    pub line: String,
    pub stream: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptExitEvent {
    pub exit_code: Option<i32>,
    pub success: bool,
}

/// Spawn a script in the given working directory and stream output via Tauri events.
///
/// Events emitted:
/// - `script-output:{kind}:{context_id}` — each line of stdout/stderr
/// - `script-exit:{kind}:{context_id}` — when the process exits
pub async fn spawn_script(
    context_id: Uuid,
    kind: ScriptKind,
    script_body: &str,
    working_dir: &Path,
    env_vars: HashMap<String, String>,
    app_handle: AppHandle,
) -> Result<Child, AppError> {
    let shell = platform::default_shell();
    let flag = platform::shell_exec_flag();

    let mut cmd = Command::new(shell);
    cmd.arg(flag)
        .arg(script_body)
        .current_dir(working_dir)
        .envs(&env_vars)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

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
        AppError::ScriptError(format!("Failed to spawn {} script: {}", kind.as_str(), e))
    })?;

    let event_name = format!("script-output:{}:{}", kind.as_str(), context_id);

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app_out = app_handle.clone();
        let event_out = event_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit(
                    &event_out,
                    &ScriptOutputEvent {
                        line,
                        stream: "stdout".to_string(),
                    },
                );
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app_err = app_handle.clone();
        let event_err = event_name;
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit(
                    &event_err,
                    &ScriptOutputEvent {
                        line,
                        stream: "stderr".to_string(),
                    },
                );
            }
        });
    }

    Ok(child)
}

/// Spawn a script inside a Docker container and stream output via Tauri events.
#[allow(dead_code)]
pub async fn spawn_script_in_container(
    context_id: Uuid,
    kind: ScriptKind,
    script_body: &str,
    container_id: &str,
    container_working_dir: &str,
    env_vars: HashMap<String, String>,
    app_handle: AppHandle,
) -> Result<Child, AppError> {
    let docker_bin = which::which("docker")
        .map_err(|_| AppError::ContainerError("Docker not found in PATH".to_string()))?;

    let mut args = vec![
        "exec".to_string(),
        "-i".to_string(),
        "-w".to_string(),
        container_working_dir.to_string(),
    ];
    for (key, value) in &env_vars {
        args.push("-e".to_string());
        args.push(format!("{}={}", key, value));
    }
    args.push(container_id.to_string());
    args.push("/bin/sh".to_string());
    args.push("-c".to_string());
    args.push(script_body.to_string());

    let mut cmd = Command::new(&docker_bin);
    cmd.args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000200);

    let mut child = cmd.spawn().map_err(|e| {
        AppError::ScriptError(format!(
            "Failed to spawn {} script in container: {}",
            kind.as_str(),
            e
        ))
    })?;

    let event_name = format!("script-output:{}:{}", kind.as_str(), context_id);

    if let Some(stdout) = child.stdout.take() {
        let app_out = app_handle.clone();
        let event_out = event_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit(
                    &event_out,
                    &ScriptOutputEvent {
                        line,
                        stream: "stdout".to_string(),
                    },
                );
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_err = app_handle.clone();
        let event_err = event_name;
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit(
                    &event_err,
                    &ScriptOutputEvent {
                        line,
                        stream: "stderr".to_string(),
                    },
                );
            }
        });
    }

    Ok(child)
}
