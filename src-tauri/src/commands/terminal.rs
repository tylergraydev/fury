use std::io::{Read, Write};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use portable_pty::PtySize;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::error::AppError;
use crate::services::{claude_process, terminal};
use crate::state::AppState;

#[tauri::command]
pub async fn create_terminal(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Look up workspace and repo for env vars and working dir
    let (worktree_path, env_vars) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?
            .clone();
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?
            .clone();
        let app_settings = state.settings.lock().unwrap().clone();
        let env = claude_process::build_env_vars(&ws, &repo, &app_settings);
        (ws.worktree_path.clone(), env)
    };

    // Create PTY session
    let (session, reader) =
        terminal::create_session(ws_id, &worktree_path, env_vars, cols, rows)?;

    let terminal_id = session.id;
    let terminal_id_str = terminal_id.to_string();

    // Store session
    {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        sessions.insert(terminal_id, session);
    }

    // Spawn blocking read loop for PTY output
    let app_clone = app.clone();
    let event_name = format!("terminal-output:{}", terminal_id);
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let encoded = BASE64.encode(&buf[..n]);
                    let _ = app_clone.emit(&event_name, &encoded);
                }
                Err(_) => break,
            }
        }
    });

    Ok(terminal_id_str)
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    data: String,
) -> Result<(), AppError> {
    let id: Uuid = terminal_id
        .parse()
        .map_err(|_| AppError::ScriptError("Invalid terminal ID".to_string()))?;

    let decoded = BASE64
        .decode(&data)
        .map_err(|e| AppError::ScriptError(format!("Failed to decode input: {}", e)))?;

    let mut sessions = state.terminal_sessions.lock().unwrap();
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| AppError::ScriptError("Terminal session not found".to_string()))?;

    session
        .writer
        .write_all(&decoded)
        .map_err(|e| AppError::ScriptError(format!("Failed to write to terminal: {}", e)))?;

    session
        .writer
        .flush()
        .map_err(|e| AppError::ScriptError(format!("Failed to flush terminal: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let id: Uuid = terminal_id
        .parse()
        .map_err(|_| AppError::ScriptError("Invalid terminal ID".to_string()))?;

    let sessions = state.terminal_sessions.lock().unwrap();
    let session = sessions
        .get(&id)
        .ok_or_else(|| AppError::ScriptError("Terminal session not found".to_string()))?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::ScriptError(format!("Failed to resize terminal: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn close_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
) -> Result<(), AppError> {
    let id: Uuid = terminal_id
        .parse()
        .map_err(|_| AppError::ScriptError("Invalid terminal ID".to_string()))?;

    let mut sessions = state.terminal_sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }

    Ok(())
}

#[tauri::command]
pub async fn create_repo_terminal(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let (repo_path, env_vars) = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&id)
            .ok_or(AppError::RepoNotFound(id))?
            .clone();
        let app_settings = state.settings.lock().unwrap().clone();
        let env = claude_process::build_repo_env_vars(&repo, &app_settings);
        (repo.path.clone(), env)
    };

    // Create PTY session with a fresh UUID since there's no workspace
    let session_uuid = Uuid::new_v4();
    let (session, reader) =
        terminal::create_session(session_uuid, &repo_path, env_vars, cols, rows)?;

    let terminal_id = session.id;
    let terminal_id_str = terminal_id.to_string();

    // Store session
    {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        sessions.insert(terminal_id, session);
    }

    // Spawn blocking read loop for PTY output
    let app_clone = app.clone();
    let event_name = format!("terminal-output:{}", terminal_id);
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let encoded = BASE64.encode(&buf[..n]);
                    let _ = app_clone.emit(&event_name, &encoded);
                }
                Err(_) => break,
            }
        }
    });

    Ok(terminal_id_str)
}
