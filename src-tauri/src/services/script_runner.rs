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

// --- Extracted pure logic for testability ---

/// Build the event name for script output events.
#[allow(dead_code)]
pub fn build_script_output_event_name(kind: ScriptKind, context_id: Uuid) -> String {
    format!("script-output:{}:{}", kind.as_str(), context_id)
}

/// Build the event name for script exit events.
#[allow(dead_code)]
pub fn build_script_exit_event_name(kind: ScriptKind, context_id: Uuid) -> String {
    format!("script-exit:{}:{}", kind.as_str(), context_id)
}

/// Build docker exec arguments for running a script inside a container.
/// Returns the full argument list for `docker exec`.
#[allow(dead_code)]
pub fn build_docker_exec_script_args(
    container_id: &str,
    container_working_dir: &str,
    script_body: &str,
    env_vars: &HashMap<String, String>,
) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "-i".to_string(),
        "-w".to_string(),
        container_working_dir.to_string(),
    ];
    for (key, value) in env_vars {
        args.push("-e".to_string());
        args.push(format!("{}={}", key, value));
    }
    args.push(container_id.to_string());
    args.push("/bin/sh".to_string());
    args.push("-c".to_string());
    args.push(script_body.to_string());
    args
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

    let mut child = cmd.kill_on_drop(true).spawn().map_err(|e| {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_script_kind_as_str() {
        assert_eq!(ScriptKind::Setup.as_str(), "setup");
        assert_eq!(ScriptKind::Run.as_str(), "run");
        assert_eq!(ScriptKind::Archive.as_str(), "archive");
    }

    #[test]
    fn test_script_kind_from_str_valid() {
        assert_eq!(ScriptKind::from_str("setup").unwrap(), ScriptKind::Setup);
        assert_eq!(ScriptKind::from_str("run").unwrap(), ScriptKind::Run);
        assert_eq!(ScriptKind::from_str("archive").unwrap(), ScriptKind::Archive);
    }

    #[test]
    fn test_script_kind_from_str_invalid() {
        let result = ScriptKind::from_str("invalid");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unknown script kind"));
    }

    #[test]
    fn test_script_kind_roundtrip() {
        for kind in [ScriptKind::Setup, ScriptKind::Run, ScriptKind::Archive] {
            assert_eq!(ScriptKind::from_str(kind.as_str()).unwrap(), kind);
        }
    }

    #[test]
    fn test_script_kind_serde() {
        let json = serde_json::to_string(&ScriptKind::Setup).unwrap();
        assert_eq!(json, "\"setup\"");
        let parsed: ScriptKind = serde_json::from_str("\"run\"").unwrap();
        assert_eq!(parsed, ScriptKind::Run);
    }

    #[test]
    fn test_script_output_event_serialize() {
        let event = ScriptOutputEvent {
            line: "Hello world".to_string(),
            stream: "stdout".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["line"], "Hello world");
        assert_eq!(json["stream"], "stdout");
    }

    #[test]
    fn test_script_exit_event_serialize() {
        let event = ScriptExitEvent {
            exit_code: Some(0),
            success: true,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["exitCode"], 0);
        assert_eq!(json["success"], true);
    }

    #[test]
    fn test_script_exit_event_no_code() {
        let event = ScriptExitEvent {
            exit_code: None,
            success: false,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert!(json["exitCode"].is_null());
        assert_eq!(json["success"], false);
    }

    // --- Tests for extracted pure logic ---

    #[test]
    fn test_build_script_output_event_name() {
        let id = Uuid::parse_str("12345678-1234-1234-1234-123456789abc").unwrap();
        let name = build_script_output_event_name(ScriptKind::Setup, id);
        assert_eq!(name, "script-output:setup:12345678-1234-1234-1234-123456789abc");
    }

    #[test]
    fn test_build_script_output_event_name_run() {
        let id = Uuid::parse_str("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").unwrap();
        let name = build_script_output_event_name(ScriptKind::Run, id);
        assert_eq!(name, "script-output:run:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    }

    #[test]
    fn test_build_script_output_event_name_archive() {
        let id = Uuid::new_v4();
        let name = build_script_output_event_name(ScriptKind::Archive, id);
        assert!(name.starts_with("script-output:archive:"));
    }

    #[test]
    fn test_build_script_exit_event_name() {
        let id = Uuid::parse_str("12345678-1234-1234-1234-123456789abc").unwrap();
        let name = build_script_exit_event_name(ScriptKind::Run, id);
        assert_eq!(name, "script-exit:run:12345678-1234-1234-1234-123456789abc");
    }

    #[test]
    fn test_build_script_exit_event_name_setup() {
        let id = Uuid::new_v4();
        let name = build_script_exit_event_name(ScriptKind::Setup, id);
        assert!(name.starts_with("script-exit:setup:"));
    }

    #[test]
    fn test_build_docker_exec_script_args_basic() {
        let args = build_docker_exec_script_args(
            "container123",
            "/workspaces/myapp",
            "echo hello",
            &HashMap::new(),
        );
        assert_eq!(args, vec![
            "exec", "-i", "-w", "/workspaces/myapp",
            "container123", "/bin/sh", "-c", "echo hello"
        ]);
    }

    #[test]
    fn test_build_docker_exec_script_args_with_env() {
        let mut env = HashMap::new();
        env.insert("NODE_ENV".to_string(), "production".to_string());
        let args = build_docker_exec_script_args(
            "abc123",
            "/app",
            "npm start",
            &env,
        );
        assert!(args.contains(&"-e".to_string()));
        assert!(args.contains(&"NODE_ENV=production".to_string()));
        assert!(args.contains(&"abc123".to_string()));
        assert!(args.contains(&"/bin/sh".to_string()));
        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"npm start".to_string()));
    }

    #[test]
    fn test_build_docker_exec_script_args_multiline_script() {
        let script = "cd /app\nnpm install\nnpm run build";
        let args = build_docker_exec_script_args(
            "ctr",
            "/workspaces/proj",
            script,
            &HashMap::new(),
        );
        assert_eq!(args.last().unwrap(), script);
    }

    #[test]
    fn test_build_docker_exec_script_args_preserves_working_dir() {
        let args = build_docker_exec_script_args(
            "ctr",
            "/custom/path/to/workspace",
            "ls",
            &HashMap::new(),
        );
        assert_eq!(args[3], "/custom/path/to/workspace");
    }

    #[test]
    fn test_build_docker_exec_script_args_env_before_container_id() {
        let mut env = HashMap::new();
        env.insert("KEY".to_string(), "VAL".to_string());
        let args = build_docker_exec_script_args("ctr", "/app", "cmd", &env);
        let env_idx = args.iter().position(|a| a == "KEY=VAL").unwrap();
        let ctr_idx = args.iter().position(|a| a == "ctr").unwrap();
        assert!(env_idx < ctr_idx, "env vars should come before container id");
    }
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

    let mut child = cmd.kill_on_drop(true).spawn().map_err(|e| {
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
