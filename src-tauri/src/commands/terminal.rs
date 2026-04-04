use std::io::{Read, Write};
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use portable_pty::PtySize;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::error::AppError;
use crate::services::{claude_process, terminal};
use crate::state::AppState;

type TerminalResolveResult = (std::path::PathBuf, std::collections::HashMap<String, String>, Option<(String, String)>);

/// Parse a terminal ID string into a UUID.
pub(crate) fn parse_terminal_id(terminal_id: &str) -> Result<Uuid, AppError> {
    terminal_id
        .parse()
        .map_err(|_| AppError::ScriptError("Invalid terminal ID".to_string()))
}

/// Decode base64-encoded terminal input data.
pub(crate) fn decode_terminal_input(data: &str) -> Result<Vec<u8>, AppError> {
    BASE64
        .decode(data)
        .map_err(|e| AppError::ScriptError(format!("Failed to decode input: {}", e)))
}

/// Encode raw bytes as base64 for terminal output events.
pub(crate) fn encode_terminal_output(data: &[u8]) -> String {
    BASE64.encode(data)
}

/// Build the terminal output event name for a given terminal ID.
pub(crate) fn terminal_output_event(terminal_id: &Uuid) -> String {
    format!("terminal-output:{}", terminal_id)
}

/// Resolve workspace info for creating a terminal: worktree path, env vars, and optional container info.
pub(crate) fn resolve_workspace_terminal_info(
    state: &AppState,
    ws_id: &Uuid,
) -> Result<TerminalResolveResult, AppError> {
    let workspaces = state.workspaces.read().unwrap();
    let ws = workspaces
        .get(ws_id)
        .ok_or(AppError::WorkspaceNotFound(*ws_id))?
        .clone();
    let repos = state.repositories.read().unwrap();
    let repo = repos
        .get(&ws.repo_id)
        .ok_or(AppError::RepoNotFound(ws.repo_id))?
        .clone();
    let app_settings = state.settings.read().unwrap().clone();
    let repo_settings = crate::commands::script::resolve_settings(state, &ws.repo_id).ok();
    let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
    let env = claude_process::build_env_vars(&ws, &repo, &app_settings, provider_override);

    // Check if workspace has container config enabled
    let container_info = if let Some(ref config) = ws.devcontainer_config {
        if config.enabled {
            let container_working_dir =
                crate::services::devcontainer::resolve_container_workspace_path(
                    config,
                    &repo.name,
                );
            let container_id = {
                let states = state.container_states.lock().unwrap();
                states
                    .get(ws_id)
                    .and_then(|cs| cs.container_id.clone())
            };
            container_id.map(|cid| (cid, container_working_dir))
        } else {
            None
        }
    } else {
        None
    };

    Ok((ws.worktree_path.clone(), env, container_info))
}

/// Resolve repo info for creating a repo-level terminal: path and env vars.
pub(crate) fn resolve_repo_terminal_info(
    state: &AppState,
    repo_id: &Uuid,
) -> Result<(std::path::PathBuf, std::collections::HashMap<String, String>), AppError> {
    let repos = state.repositories.read().unwrap();
    let repo = repos
        .get(repo_id)
        .ok_or(AppError::RepoNotFound(*repo_id))?
        .clone();
    let app_settings = state.settings.read().unwrap().clone();
    let repo_settings = crate::commands::script::resolve_settings(state, repo_id).ok();
    let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
    let env = claude_process::build_repo_env_vars(&repo, &app_settings, provider_override);
    Ok((repo.path.clone(), env))
}

#[tauri::command]
#[specta::specta]
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

    let (worktree_path, env_vars, container_info) = resolve_workspace_terminal_info(&state, &ws_id)?;

    // Create PTY session — inside container or on host
    let (session, reader) = if let Some((container_id, container_working_dir)) = container_info {
        terminal::create_session_in_container(
            ws_id,
            &container_id,
            &container_working_dir,
            env_vars,
            cols,
            rows,
        )?
    } else {
        terminal::create_session(ws_id, &worktree_path, env_vars, cols, rows)?
    };

    let terminal_id = session.id;
    let terminal_id_str = terminal_id.to_string();

    // Store session
    {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        sessions.insert(terminal_id, session);
    }

    // Spawn blocking read loop for PTY output
    let app_clone = app.clone();
    let event_name = terminal_output_event(&terminal_id);
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let encoded = encode_terminal_output(&buf[..n]);
                    let _ = app_clone.emit(&event_name, &encoded);
                }
                Err(_) => break,
            }
        }
    });

    Ok(terminal_id_str)
}

#[tauri::command]
#[specta::specta]
pub async fn write_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    data: String,
) -> Result<(), AppError> {
    let id = parse_terminal_id(&terminal_id)?;
    let decoded = decode_terminal_input(&data)?;

    let terminal_sessions = Arc::clone(&state.terminal_sessions);
    tokio::task::spawn_blocking(move || {
        let mut sessions = terminal_sessions.lock().unwrap();
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn resize_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let id = parse_terminal_id(&terminal_id)?;

    let terminal_sessions = Arc::clone(&state.terminal_sessions);
    tokio::task::spawn_blocking(move || {
        let sessions = terminal_sessions.lock().unwrap();
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn close_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
) -> Result<(), AppError> {
    let id = parse_terminal_id(&terminal_id)?;

    let terminal_sessions = Arc::clone(&state.terminal_sessions);
    tokio::task::spawn_blocking(move || {
        let mut sessions = terminal_sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(&id) {
            let _ = session.child.kill();
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
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

    let (repo_path, env_vars) = resolve_repo_terminal_info(&state, &id)?;

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
    let event_name = terminal_output_event(&terminal_id);
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let encoded = encode_terminal_output(&buf[..n]);
                    let _ = app_clone.emit(&event_name, &encoded);
                }
                Err(_) => break,
            }
        }
    });

    Ok(terminal_id_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;
    use crate::test_helpers::*;

    // --- parse_terminal_id tests ---

    #[test]
    fn test_parse_terminal_id_valid() {
        let id = Uuid::new_v4();
        let result = parse_terminal_id(&id.to_string()).unwrap();
        assert_eq!(result, id);
    }

    #[test]
    fn test_parse_terminal_id_invalid() {
        let result = parse_terminal_id("not-a-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_terminal_id_empty() {
        let result = parse_terminal_id("");
        assert!(result.is_err());
    }

    // --- decode_terminal_input tests ---

    #[test]
    fn test_decode_terminal_input_valid() {
        let encoded = BASE64.encode(b"hello");
        let decoded = decode_terminal_input(&encoded).unwrap();
        assert_eq!(decoded, b"hello");
    }

    #[test]
    fn test_decode_terminal_input_invalid() {
        let result = decode_terminal_input("not valid base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_terminal_input_empty() {
        let decoded = decode_terminal_input("").unwrap();
        assert!(decoded.is_empty());
    }

    // --- encode_terminal_output tests ---

    #[test]
    fn test_encode_terminal_output_basic() {
        let encoded = encode_terminal_output(b"hello");
        let decoded = BASE64.decode(&encoded).unwrap();
        assert_eq!(decoded, b"hello");
    }

    #[test]
    fn test_encode_terminal_output_empty() {
        let encoded = encode_terminal_output(b"");
        assert_eq!(encoded, "");
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let original = b"\x1b[31mRed text\x1b[0m\r\nNewline";
        let encoded = encode_terminal_output(original);
        let decoded = decode_terminal_input(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    // --- terminal_output_event tests ---

    #[test]
    fn test_terminal_output_event_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            terminal_output_event(&id),
            "terminal-output:550e8400-e29b-41d4-a716-446655440000"
        );
    }

    // --- resolve_workspace_terminal_info tests ---

    #[test]
    fn test_resolve_workspace_terminal_info_not_found() {
        let state = AppState::new();
        let missing = Uuid::new_v4();
        let result = resolve_workspace_terminal_info(&state, &missing);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_workspace_terminal_info_repo_not_found() {
        let state = AppState::new();
        let ws = test_workspace(Uuid::new_v4()); // repo_id won't exist
        let ws_id = ws.id;
        state.workspaces.write().unwrap().insert(ws_id, ws);
        let result = resolve_workspace_terminal_info(&state, &ws_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_workspace_terminal_info_success() {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);
        let ws = test_workspace(repo_id);
        let ws_id = ws.id;
        state.workspaces.write().unwrap().insert(ws_id, ws);

        let (path, env, container_info) = resolve_workspace_terminal_info(&state, &ws_id).unwrap();
        assert_eq!(path, std::path::PathBuf::from("/tmp/test-worktree"));
        assert!(!env.is_empty()); // Should have at least FURY_* vars
        assert!(container_info.is_none()); // No devcontainer configured
    }

    // --- resolve_repo_terminal_info tests ---

    #[test]
    fn test_resolve_repo_terminal_info_not_found() {
        let state = AppState::new();
        let missing = Uuid::new_v4();
        let result = resolve_repo_terminal_info(&state, &missing);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_repo_terminal_info_success() {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);

        let (path, env) = resolve_repo_terminal_info(&state, &repo_id).unwrap();
        assert_eq!(path, std::path::PathBuf::from("/tmp/test-repo"));
        assert!(!env.is_empty());
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests (using mock_app_with_state)
    // -----------------------------------------------------------------------

    use tauri::Manager;

    #[tokio::test]
    async fn test_cmd_close_terminal_nonexistent_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let term_id = Uuid::new_v4();
        // Closing a terminal that doesn't exist should succeed gracefully
        let result = close_terminal(state, term_id.to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_close_terminal_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = close_terminal(state, "not-a-uuid".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_write_terminal_nonexistent_session() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let term_id = Uuid::new_v4();
        let encoded_data = encode_terminal_output(b"hello");
        let result = write_terminal(state, term_id.to_string(), encoded_data).await;
        assert!(result.is_err());
        let err_msg = format!("{}", result.unwrap_err());
        assert!(err_msg.contains("not found"));
    }

    #[tokio::test]
    async fn test_cmd_write_terminal_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = write_terminal(state, "not-a-uuid".to_string(), "aGVsbG8=".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_resize_terminal_nonexistent_session() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let term_id = Uuid::new_v4();
        let result = resize_terminal(state, term_id.to_string(), 120, 40).await;
        assert!(result.is_err());
        let err_msg = format!("{}", result.unwrap_err());
        assert!(err_msg.contains("not found"));
    }

    #[tokio::test]
    async fn test_cmd_resize_terminal_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = resize_terminal(state, "not-a-uuid".to_string(), 120, 40).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Inner function tests for create_terminal/create_repo_terminal error paths
    // Note: create_terminal and create_repo_terminal take AppHandle (Wry runtime)
    // so they can't be called directly from MockRuntime tests. Test the inner
    // resolve functions instead.
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_workspace_terminal_info_with_container_config_disabled() {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);

        let mut ws = test_workspace(repo_id);
        ws.devcontainer_config = Some(crate::models::devcontainer::DevContainerConfig {
            enabled: false,
            ..Default::default()
        });
        let ws_id = ws.id;
        state.workspaces.write().unwrap().insert(ws_id, ws);

        let (path, env, container_info) = resolve_workspace_terminal_info(&state, &ws_id).unwrap();
        assert_eq!(path, std::path::PathBuf::from("/tmp/test-worktree"));
        assert!(!env.is_empty());
        assert!(container_info.is_none()); // disabled
    }

    #[test]
    fn test_parse_terminal_id_nil_uuid() {
        let id = Uuid::nil();
        let result = parse_terminal_id(&id.to_string()).unwrap();
        assert_eq!(result, id);
    }

    #[test]
    fn test_decode_terminal_input_binary_data() {
        let binary_data = vec![0x00, 0x01, 0xFF, 0xFE];
        let encoded = BASE64.encode(&binary_data);
        let decoded = decode_terminal_input(&encoded).unwrap();
        assert_eq!(decoded, binary_data);
    }

    #[test]
    fn test_encode_terminal_output_binary() {
        let data = vec![0x00, 0x01, 0x02, 0xFF];
        let encoded = encode_terminal_output(&data);
        let decoded = BASE64.decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_resolve_repo_terminal_info_with_settings() {
        // Test that env vars are populated when repo has settings
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);

        let (path, env) = resolve_repo_terminal_info(&state, &repo_id).unwrap();
        assert_eq!(path, std::path::PathBuf::from("/tmp/test-repo"));
        // Should have at least FURY_* environment variables
        assert!(!env.is_empty());
    }

    // -----------------------------------------------------------------------
    // Additional async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_write_terminal_invalid_base64() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let term_id = Uuid::new_v4();
        // Invalid base64 data
        let result = write_terminal(state, term_id.to_string(), "not-valid-base64!!!".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_close_terminal_twice() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let term_id = Uuid::new_v4();
        // Close twice — second should be a no-op
        let result1 = close_terminal(state, term_id.to_string()).await;
        assert!(result1.is_ok());
        let state2: tauri::State<'_, AppState> = app.state();
        let result2 = close_terminal(state2, term_id.to_string()).await;
        assert!(result2.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_resize_terminal_invalid_base64_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, AppState> = app.state();
        let result = resize_terminal(state, "".to_string(), 80, 24).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_create_terminal_invalid_workspace_id() {
        // create_terminal takes AppHandle which MockRuntime doesn't provide directly,
        // but we can test resolve_workspace_terminal_info for the missing workspace case
        let state = AppState::new();
        let ws_id = Uuid::new_v4();
        let result = resolve_workspace_terminal_info(&state, &ws_id);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_create_repo_terminal_missing_repo() {
        // Test resolve_repo_terminal_info for missing repo
        let state = AppState::new();
        let repo_id = Uuid::new_v4();
        let result = resolve_repo_terminal_info(&state, &repo_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_workspace_terminal_info_with_container_enabled_but_no_container_id() {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);

        let mut ws = test_workspace(repo_id);
        ws.devcontainer_config = Some(crate::models::devcontainer::DevContainerConfig {
            enabled: true,
            ..Default::default()
        });
        let ws_id = ws.id;
        state.workspaces.write().unwrap().insert(ws_id, ws);

        let (path, env, container_info) = resolve_workspace_terminal_info(&state, &ws_id).unwrap();
        assert_eq!(path, std::path::PathBuf::from("/tmp/test-worktree"));
        assert!(!env.is_empty());
        // Container is enabled but no container_id in container_states => None
        assert!(container_info.is_none());
    }

    #[test]
    fn test_resolve_workspace_terminal_info_with_running_container() {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);

        let mut ws = test_workspace(repo_id);
        ws.devcontainer_config = Some(crate::models::devcontainer::DevContainerConfig {
            enabled: true,
            ..Default::default()
        });
        let ws_id = ws.id;
        state.workspaces.write().unwrap().insert(ws_id, ws);

        // Set up a running container in container_states
        state.container_states.lock().unwrap().insert(
            ws_id,
            crate::models::devcontainer::ContainerState {
                workspace_id: ws_id,
                status: crate::models::devcontainer::ContainerStatus::Running,
                container_id: Some("container-abc123".to_string()),
                container_name: Some("fury-test".to_string()),
                log_tail: vec![],
            },
        );

        let (_, _, container_info) = resolve_workspace_terminal_info(&state, &ws_id).unwrap();
        assert!(container_info.is_some());
        let (cid, _working_dir) = container_info.unwrap();
        assert_eq!(cid, "container-abc123");
    }
}
