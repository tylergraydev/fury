use std::path::PathBuf;
use std::process::Stdio;

use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::devcontainer::{AgentExecMode, ContainerBackend, DevContainerConfig};
use crate::services::containerize as ctz_svc;
use crate::state::AppState;

/// Build a default DevContainerConfig with containerization enabled.
pub(crate) fn build_default_devcontainer_config(
    devcontainer_path: Option<String>,
) -> DevContainerConfig {
    DevContainerConfig {
        enabled: true,
        backend: ContainerBackend::DevcontainerCli,
        agent_exec_mode: AgentExecMode::Container,
        image: None,
        compose_file: None,
        compose_service: None,
        devcontainer_path,
        container_workspace_path: None,
        extra_docker_args: vec![],
        container_env_vars: std::collections::HashMap::new(),
    }
}

/// Resolve repo path, setup script, and repo name from a workspace ID.
/// Critical: uses scoped locks with proper ordering (workspaces → repositories → db).
pub(crate) fn resolve_workspace_repo_context(
    state: &AppState,
    workspace_id: Uuid,
) -> Result<(PathBuf, Option<String>, String), AppError> {
    // Scoped read locks — released before db lock
    let (repo_id, repo_path, repo_name) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&workspace_id)
            .ok_or(AppError::WorkspaceNotFound(workspace_id))?;
        let repo_id = ws.repo_id;
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?;
        (repo_id, repo.path.clone(), repo.name.clone())
    };

    // Separate db lock — no other locks held
    let setup_script = {
        let db_guard = state.db.lock().unwrap();
        db_guard
            .as_ref()
            .and_then(|db| db.get_repo_settings(&repo_id).ok())
            .and_then(|s| s.setup_script)
    };

    Ok((repo_path, setup_script, repo_name))
}

#[tauri::command]
pub async fn containerize_repo(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Step 1: Resolve repo context (scoped locks)
    let (repo_path, setup_script, _repo_name) = resolve_workspace_repo_context(&state, ws_id)?;

    // Step 2: Emit analyzing status
    let _ = app.emit(
        &format!("containerize-status:{}", ws_id),
        serde_json::json!({ "status": "analyzing" }),
    );

    // Step 3: Gather context and build prompt
    let context = ctz_svc::gather_repo_context(&repo_path, setup_script.as_deref());
    let prompt = ctz_svc::build_containerize_prompt(&context);

    // Step 4: Resolve provider env vars (scoped locks: settings, then workspaces, then db)
    let provider_env_vars = {
        let settings = state.settings.read().unwrap();
        let mut env = std::collections::HashMap::new();
        for (key, value) in &settings.provider.env_vars {
            env.insert(key.clone(), value.clone());
        }
        env
    };

    // Check for per-repo provider override
    let repo_provider_env_vars = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repo_id = ws.repo_id;
        drop(workspaces);

        let db_guard = state.db.lock().unwrap();
        db_guard
            .as_ref()
            .and_then(|db| db.get_repo_settings(&repo_id).ok())
            .and_then(|s| s.provider_override)
            .map(|p| p.env_vars)
    };

    let final_env_vars = repo_provider_env_vars.unwrap_or(provider_env_vars);

    // Step 5: Find claude binary
    let claude_bin = crate::services::claude_process::find_claude_binary()?;

    // Step 6: Spawn claude process
    let mut cmd = tokio::process::Command::new(claude_bin);
    cmd.arg("-p")
        .arg(&prompt)
        .arg("--output-format")
        .arg("json")
        .arg("--dangerously-skip-permissions");

    // Set provider env vars
    for (key, value) in &final_env_vars {
        cmd.env(key, value);
    }

    // Remove Fury-specific env vars to prevent nested agent detection
    cmd.env_remove("CLAUDECODE");
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDE_AGENT_SDK_VERSION");
    cmd.env_remove("CLAUDE_CODE_ENABLE_TASKS");

    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Process group setup on Unix
    // Set process group on Unix for clean teardown
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    let child = cmd.spawn().map_err(|e| {
        AppError::AgentError(format!("Failed to spawn claude for containerization: {}", e))
    })?;

    // Step 7: Wait for output
    let output = child.wait_with_output().await.map_err(|e| {
        AppError::AgentError(format!("Claude containerization process failed: {}", e))
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::AgentError(format!(
            "Claude exited with status {}. stderr: {}",
            output.status, stderr
        )));
    }

    // Step 8: Parse JSON output — format is {"result": "...assistant text...", ...}
    let result_text = match serde_json::from_str::<serde_json::Value>(&stdout) {
        Ok(val) => val
            .get("result")
            .and_then(|r| r.as_str())
            .unwrap_or(&stdout)
            .to_string(),
        Err(_) => stdout.clone(),
    };

    // Step 9: Extract JSON from the result text
    match ctz_svc::extract_json_from_response(&result_text) {
        Ok(json) => Ok(json),
        Err(_) => {
            // Return raw text for frontend error state
            Ok(result_text)
        }
    }
}

#[tauri::command]
pub async fn apply_devcontainer_config(
    state: State<'_, AppState>,
    workspace_id: String,
    config_json: String,
    commit_to_repo: bool,
    devcontainer_path: Option<String>,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // If config_json is non-empty, validate and optionally write to disk
    if !config_json.is_empty() {
        // Validate JSON
        let _parsed: serde_json::Value =
            serde_json::from_str(&config_json).map_err(|e| {
                AppError::ContainerError(format!("Invalid devcontainer JSON: {}", e))
            })?;

        if commit_to_repo {
            // Resolve workspace worktree path
            let worktree_path = {
                let workspaces = state.workspaces.read().unwrap();
                let ws = workspaces
                    .get(&ws_id)
                    .ok_or(AppError::WorkspaceNotFound(ws_id))?;
                ws.worktree_path.clone()
            };

            // Write devcontainer.json to disk
            let dc_dir = worktree_path.join(".devcontainer");
            std::fs::create_dir_all(&dc_dir).map_err(|e| {
                AppError::ContainerError(format!(
                    "Failed to create .devcontainer directory: {}",
                    e
                ))
            })?;
            let dc_file = dc_dir.join("devcontainer.json");
            std::fs::write(&dc_file, &config_json).map_err(|e| {
                AppError::ContainerError(format!(
                    "Failed to write devcontainer.json: {}",
                    e
                ))
            })?;

            // git add + git commit
            let git_add = std::process::Command::new("git")
                .args(["add", ".devcontainer/devcontainer.json"])
                .current_dir(&worktree_path)
                .output();

            if let Ok(add_output) = git_add {
                if add_output.status.success() {
                    let _ = std::process::Command::new("git")
                        .args([
                            "commit",
                            "-m",
                            "chore: add devcontainer configuration",
                        ])
                        .current_dir(&worktree_path)
                        .output();
                }
            }
        }
    }

    // Build the devcontainer config for the workspace
    let config = build_default_devcontainer_config(devcontainer_path);

    // Update workspace devcontainer_config in memory (write lock, scoped)
    {
        let mut workspaces = state.workspaces.write().unwrap();
        let ws = workspaces
            .get_mut(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.devcontainer_config = Some(config.clone());
    }

    // Persist to DB (db lock, scoped)
    {
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            let _ = db.update_workspace_devcontainer_config(&ws_id, Some(&config));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_default_config_with_path() {
        let config = build_default_devcontainer_config(Some(
            ".devcontainer/devcontainer.json".to_string(),
        ));
        assert!(config.enabled);
        assert_eq!(config.backend, ContainerBackend::DevcontainerCli);
        assert_eq!(config.agent_exec_mode, AgentExecMode::Container);
        assert_eq!(
            config.devcontainer_path.as_deref(),
            Some(".devcontainer/devcontainer.json")
        );
    }

    #[test]
    fn test_build_default_config_without_path() {
        let config = build_default_devcontainer_config(None);
        assert!(config.enabled);
        assert!(config.devcontainer_path.is_none());
    }

    #[test]
    fn test_resolve_workspace_repo_context_workspace_not_found() {
        let state = AppState::new();
        let result = resolve_workspace_repo_context(&state, Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_workspace_repo_context_repo_not_found() {
        let state = AppState::new();
        let ws_id = Uuid::new_v4();
        let ws = crate::test_helpers::test_workspace(Uuid::new_v4());
        let mut workspaces = state.workspaces.write().unwrap();
        workspaces.insert(ws_id, crate::models::workspace::Workspace { id: ws_id, ..ws });
        drop(workspaces);

        let result = resolve_workspace_repo_context(&state, ws_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_workspace_repo_context_success() {
        let state = AppState::new();
        let repo = crate::test_helpers::test_repo();
        let repo_id = repo.id;
        let expected_path = repo.path.clone();
        let expected_name = repo.name.clone();

        state.repositories.write().unwrap().insert(repo_id, repo);

        let ws_id = Uuid::new_v4();
        let mut ws = crate::test_helpers::test_workspace(repo_id);
        ws.id = ws_id;
        state.workspaces.write().unwrap().insert(ws_id, ws);

        let (path, setup_script, name) = resolve_workspace_repo_context(&state, ws_id).unwrap();
        assert_eq!(path, expected_path);
        assert!(setup_script.is_none()); // no DB set up
        assert_eq!(name, expected_name);
    }
}
