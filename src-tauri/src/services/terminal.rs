use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use uuid::Uuid;

use crate::error::AppError;
use crate::platform;

pub struct TerminalSession {
    pub id: Uuid,
    #[allow(dead_code)]
    pub workspace_id: Uuid,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Create a new PTY terminal session.
///
/// Returns the session (with master/writer/child) and a reader for output.
/// The caller should spawn a blocking read loop on the reader.
pub fn create_session(
    workspace_id: Uuid,
    working_dir: &Path,
    env_vars: HashMap<String, String>,
    cols: u16,
    rows: u16,
) -> Result<(TerminalSession, Box<dyn Read + Send>), AppError> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::ScriptError(format!("Failed to open PTY: {}", e)))?;

    let shell = platform::default_shell();
    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(working_dir);
    for (k, v) in &env_vars {
        cmd.env(k, v);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::ScriptError(format!("Failed to spawn shell: {}", e)))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::ScriptError(format!("Failed to get PTY reader: {}", e)))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::ScriptError(format!("Failed to get PTY writer: {}", e)))?;

    let session = TerminalSession {
        id: Uuid::new_v4(),
        workspace_id,
        master: pair.master,
        writer,
        child,
    };

    Ok((session, reader))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_session() {
        let dir = tempfile::TempDir::new().unwrap();
        let ws_id = Uuid::new_v4();
        let result = create_session(ws_id, dir.path(), HashMap::new(), 80, 24);
        assert!(result.is_ok());
        let (session, _reader) = result.unwrap();
        assert_eq!(session.workspace_id, ws_id);
    }

    #[test]
    fn test_create_session_with_env_vars() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut env = HashMap::new();
        env.insert("TEST_VAR".to_string(), "test_value".to_string());
        let result = create_session(Uuid::new_v4(), dir.path(), env, 120, 40);
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_session_custom_size() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = create_session(Uuid::new_v4(), dir.path(), HashMap::new(), 200, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_terminal_session_fields() {
        let dir = tempfile::TempDir::new().unwrap();
        let ws_id = Uuid::new_v4();
        let (session, _reader) = create_session(ws_id, dir.path(), HashMap::new(), 80, 24).unwrap();
        assert_eq!(session.workspace_id, ws_id);
        // ID should be a valid UUID
        assert!(!session.id.is_nil());
    }
}

/// Create a new PTY terminal session that executes inside a Docker container.
/// Uses `docker exec -it` to attach a shell inside the container.
pub fn create_session_in_container(
    workspace_id: Uuid,
    container_id: &str,
    container_working_dir: &str,
    env_vars: HashMap<String, String>,
    cols: u16,
    rows: u16,
) -> Result<(TerminalSession, Box<dyn Read + Send>), AppError> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::ScriptError(format!("Failed to open PTY: {}", e)))?;

    let docker_bin = which::which("docker")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "docker".to_string());

    let mut cmd = CommandBuilder::new(&docker_bin);
    cmd.arg("exec");
    cmd.arg("-it");
    cmd.arg("-w");
    cmd.arg(container_working_dir);
    for (k, v) in &env_vars {
        cmd.arg("-e");
        cmd.arg(format!("{}={}", k, v));
    }
    cmd.arg(container_id);
    cmd.arg("/bin/bash");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::ScriptError(format!("Failed to spawn container shell: {}", e)))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::ScriptError(format!("Failed to get PTY reader: {}", e)))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::ScriptError(format!("Failed to get PTY writer: {}", e)))?;

    let session = TerminalSession {
        id: Uuid::new_v4(),
        workspace_id,
        master: pair.master,
        writer,
        child,
    };

    Ok((session, reader))
}
