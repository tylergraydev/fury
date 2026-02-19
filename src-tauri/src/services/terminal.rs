use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use uuid::Uuid;

use crate::error::AppError;
use crate::platform;

pub struct TerminalSession {
    pub id: Uuid,
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
