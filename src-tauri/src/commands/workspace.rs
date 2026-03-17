use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Emitter, State};
use uuid::Uuid;

use crate::commands::script as script_cmd;
use crate::error::AppError;
use crate::models::workspace::{CreateWorkspaceRequest, Workspace, WorkspaceInfo, WorkspaceStatus};
use crate::services::script_runner::ScriptKind;
use crate::services::{claude_process, script_runner, worktree};
use crate::state::AppState;

#[tauri::command]
pub async fn create_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreateWorkspaceRequest,
) -> Result<WorkspaceInfo, AppError> {
    // Validate repository exists
    let repo = {
        let repos = state.repositories.read().unwrap();
        repos
            .get(&request.repo_id)
            .ok_or(AppError::RepoNotFound(request.repo_id))?
            .clone()
    };

    // Allocate ports
    let port_base = state.port_allocator.lock().unwrap().allocate()?;

    // Resolve worktree base: user override → default (repo parent dir)
    let repo_settings = script_cmd::resolve_settings(&state, &request.repo_id)?;
    let worktree_base = match repo_settings.worktree_base_path {
        Some(ref custom) if !custom.trim().is_empty() => {
            let p = PathBuf::from(custom.trim());
            if !p.is_absolute() {
                return Err(AppError::GitError(
                    "Worktree base path must be an absolute path".to_string(),
                ));
            }
            p.join(&repo.name)
        }
        _ => repo
            .path
            .join(".worktrees"),
    };

    // Clone data needed inside spawn_blocking
    let repo_path = repo.path.clone();
    let branch_name = request.branch_name.clone();
    let workspace_name = request.workspace_name.clone();
    let fetch_remote_branch = request.fetch_remote_branch.unwrap_or(false);
    let base_branch = request.base_branch.clone();
    let sparse_dirs = request.sparse_dirs.clone();

    // Do blocking git/filesystem work inside spawn_blocking
    let worktree_path = tokio::task::spawn_blocking(move || -> Result<PathBuf, AppError> {
        // Fetch remote branch if requested (needed for PR branches that don't exist locally).
        if fetch_remote_branch {
            let refspec = format!("{}:{}", &branch_name, &branch_name);
            let fetch_output = crate::platform::command("git")
                .args(["fetch", "origin", &refspec])
                .current_dir(&repo_path)
                .output()
                .map_err(|e| {
                    AppError::GitError(format!("Failed to fetch branch '{}': {}", branch_name, e))
                })?;

            if !fetch_output.status.success() {
                let stderr = String::from_utf8_lossy(&fetch_output.stderr);
                // Allow failure if branch already exists locally
                if !stderr.contains("already exists") {
                    return Err(AppError::GitError(format!(
                        "Failed to fetch branch '{}': {}",
                        branch_name, stderr
                    )));
                }
            }
        }

        // Create git worktree
        let worktree_path = worktree::create_worktree(
            &repo_path,
            &branch_name,
            &workspace_name,
            &worktree_base,
            base_branch.as_deref(),
        )?;

        // Create .context directory for inter-agent collaboration
        let context_dir = worktree_path.join(".context");
        let _ = std::fs::create_dir_all(&context_dir);
        let _ = std::fs::write(context_dir.join(".gitignore"), "*\n!.gitignore\n");

        // Apply sparse checkout if needed
        if let Some(ref dirs) = sparse_dirs {
            if !dirs.is_empty() {
                worktree::apply_sparse_checkout(&worktree_path, dirs)?;
            }
        }

        Ok(worktree_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let workspace = Workspace {
        id: Uuid::new_v4(),
        repo_id: request.repo_id,
        name: request.workspace_name,
        branch: request.branch_name,
        worktree_path,
        status: WorkspaceStatus::Active,
        port_base,
        sparse_dirs: request.sparse_dirs,
        notes: String::new(),
        auto_commit: request.auto_commit.unwrap_or(true),
        pinned: false,
        created_at: chrono::Utc::now(),
        archived_at: None,
        devcontainer_config: request.devcontainer_config,
    };

    let info = WorkspaceInfo::from(&workspace);
    let ws_worktree_path = workspace.worktree_path.clone();

    // Persist to database
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.insert_workspace(&workspace)?;
        }
    }

    // Add to in-memory state
    state
        .workspaces
        .write()
        .unwrap()
        .insert(workspace.id, workspace);

    // Notify frontend
    let _ = app.emit("workspace-created", &info);

    // Fire-and-forget setup script if configured
    fire_and_forget_script(
        &app,
        &state,
        info.id,
        info.repo_id,
        ws_worktree_path,
        ScriptKind::Setup,
    );

    Ok(info)
}

#[tauri::command]
pub async fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>, AppError> {
    let result = {
        let workspaces = state.workspaces.read().unwrap();
        workspaces
            .values()
            .filter(|ws| ws.status != WorkspaceStatus::Archived)
            .map(WorkspaceInfo::from)
            .collect::<Vec<_>>()
    };

    tokio::task::spawn_blocking(move || Ok(result))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn archive_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Get workspace info for archive script before updating status
    let (repo_id, worktree_path) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        (ws.repo_id, ws.worktree_path.clone())
    };

    // Update status
    {
        let mut workspaces = state.workspaces.write().unwrap();
        if let Some(ws) = workspaces.get_mut(&id) {
            ws.status = WorkspaceStatus::Archived;
            ws.archived_at = Some(chrono::Utc::now());
        }
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_status(&id, &WorkspaceStatus::Archived)?;
        }
    }

    // Stop any running container
    {
        let container_id = {
            let states = state.container_states.lock().unwrap();
            states.get(&id).and_then(|cs| cs.container_id.clone())
        };
        if let Some(cid) = container_id {
            let config = {
                let workspaces = state.workspaces.read().unwrap();
                workspaces
                    .get(&id)
                    .and_then(|ws| ws.devcontainer_config.clone())
                    .unwrap_or_default()
            };
            let _ = crate::services::devcontainer::container_stop(
                &cid,
                &config,
                Some(&worktree_path),
            )
            .await;
            let mut states = state.container_states.lock().unwrap();
            if let Some(cs) = states.get_mut(&id) {
                cs.status = crate::models::devcontainer::ContainerStatus::Stopped;
            }
        }
    }

    let _ = app.emit("workspace-archived", &id);

    // Fire-and-forget archive script if configured
    fire_and_forget_script(
        &app,
        &state,
        id,
        repo_id,
        worktree_path,
        ScriptKind::Archive,
    );

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Get workspace info for cleanup
    let ws = {
        let workspaces = state.workspaces.read().unwrap();
        workspaces.get(&id).cloned()
    };

    // Stop and remove any container
    {
        let container_id = {
            let states = state.container_states.lock().unwrap();
            states.get(&id).and_then(|cs| cs.container_id.clone())
        };
        if let Some(cid) = container_id {
            let _ = crate::services::devcontainer::container_remove(&cid).await;
        }
        state.container_states.lock().unwrap().remove(&id);
    }

    if let Some(ref ws) = ws {
        // Get repo path
        let repo_path = {
            let repos = state.repositories.read().unwrap();
            repos.get(&ws.repo_id).map(|r| r.path.clone())
        };

        if let Some(repo_path) = repo_path {
            let wt_path = ws.worktree_path.clone();
            tokio::task::spawn_blocking(move || {
                let _ = worktree::remove_worktree(&repo_path, &wt_path);
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?;
        }

        // Release ports
        state.port_allocator.lock().unwrap().release(ws.port_base);
    }

    // Remove from DB and state
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.delete_workspace(&id)?;
        }
    }
    state.workspaces.write().unwrap().remove(&id);

    Ok(())
}

#[tauri::command]
pub async fn update_sparse_dirs(
    state: State<'_, AppState>,
    workspace_id: String,
    dirs: Vec<String>,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        ws.worktree_path.clone()
    };

    // Apply or disable sparse checkout (blocking git operations)
    let dirs_clone = dirs.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        if dirs_clone.is_empty() {
            let _ = crate::platform::command("git")
                .args(["sparse-checkout", "disable"])
                .current_dir(&worktree_path)
                .output();
        } else {
            worktree::apply_sparse_checkout(&worktree_path, &dirs_clone)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let sparse_dirs = if dirs.is_empty() { None } else { Some(dirs) };

    // Update in-memory state
    {
        let mut workspaces = state.workspaces.write().unwrap();
        if let Some(ws) = workspaces.get_mut(&id) {
            ws.sparse_dirs = sparse_dirs.clone();
        }
    }

    // Persist to database
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_sparse_dirs(&id, &sparse_dirs)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn link_workspaces(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let linked_id: Uuid = linked_workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Verify both workspaces exist
    {
        let workspaces = state.workspaces.read().unwrap();
        workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        workspaces
            .get(&linked_id)
            .ok_or(AppError::WorkspaceNotFound(linked_id))?;
    }

    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.insert_workspace_link(&ws_id, &linked_id)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn unlink_workspaces(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let linked_id: Uuid = linked_workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.delete_workspace_link(&ws_id, &linked_id)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_linked_workspaces(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<String>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let result = {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            let ids = db.get_workspace_links(&ws_id)?;
            ids.into_iter().map(|id| id.to_string()).collect()
        } else {
            vec![]
        }
    };

    tokio::task::spawn_blocking(move || Ok(result))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn start_spotlight(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, repo_path) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&ws_id).ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.path.clone())
    };

    let handle = tokio::task::spawn_blocking(move || {
        crate::services::spotlight::start_spotlight(worktree_path, repo_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    state
        .spotlight_watchers
        .lock()
        .unwrap()
        .insert(ws_id, handle);

    Ok(())
}

#[tauri::command]
pub async fn stop_spotlight(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let handle = state.spotlight_watchers.lock().unwrap().remove(&ws_id);

    if let Some(handle) = handle {
        tokio::task::spawn_blocking(move || {
            handle.stop();
        })
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_archived_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceInfo>, AppError> {
    let result = {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            let workspaces = db.list_archived_workspaces()?;
            workspaces.iter().map(WorkspaceInfo::from).collect()
        } else {
            vec![]
        }
    };

    tokio::task::spawn_blocking(move || Ok(result))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn restore_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceInfo, AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Load from DB (archived workspaces are not in memory)
    let mut ws = {
        let db = state.db.lock().unwrap();
        let db = db
            .as_ref()
            .ok_or_else(|| AppError::DbError("No database".to_string()))?;
        let archived = db.list_archived_workspaces()?;
        archived
            .into_iter()
            .find(|w| w.id == id)
            .ok_or(AppError::WorkspaceNotFound(id))?
    };

    // Validate worktree and ensure .context directory (blocking filesystem ops)
    let wt_path = ws.worktree_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        if !wt_path.exists() {
            return Err(AppError::GitError(format!(
                "Worktree path no longer exists: {}",
                wt_path.display()
            )));
        }

        // Ensure .context directory exists for inter-agent collaboration
        let context_dir = wt_path.join(".context");
        let _ = std::fs::create_dir_all(&context_dir);
        let _ = std::fs::write(context_dir.join(".gitignore"), "*\n!.gitignore\n");

        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    // Update status
    ws.status = WorkspaceStatus::Active;
    ws.archived_at = None;

    // Persist to DB
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_status(&id, &WorkspaceStatus::Active)?;
        }
    }

    let info = WorkspaceInfo::from(&ws);

    // Re-add to in-memory state
    state.workspaces.write().unwrap().insert(ws.id, ws);

    let _ = app.emit("workspace-restored", &info);
    Ok(info)
}

#[tauri::command]
pub async fn update_workspace_notes(
    state: State<'_, AppState>,
    workspace_id: String,
    notes: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Update in-memory
    {
        let mut workspaces = state.workspaces.write().unwrap();
        if let Some(ws) = workspaces.get_mut(&id) {
            ws.notes = notes.clone();
        }
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_notes(&id, &notes)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn rename_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    name: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Update in-memory
    {
        let mut workspaces = state.workspaces.write().unwrap();
        if let Some(ws) = workspaces.get_mut(&id) {
            ws.name = name.clone();
        }
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_name(&id, &name)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_workspace_pinned(
    state: State<'_, AppState>,
    workspace_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Update in-memory
    {
        let mut workspaces = state.workspaces.write().unwrap();
        if let Some(ws) = workspaces.get_mut(&id) {
            ws.pinned = pinned;
        }
    }

    // Persist
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.update_workspace_pinned(&id, pinned)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Spawn a script in the background without blocking the calling command.
/// Used for auto-running setup scripts on workspace creation and archive scripts on archival.
fn fire_and_forget_script(
    app: &tauri::AppHandle,
    state: &AppState,
    ws_id: Uuid,
    repo_id: Uuid,
    worktree_path: PathBuf,
    kind: ScriptKind,
) {
    let settings = match script_cmd::resolve_settings(state, &repo_id) {
        Ok(s) => s,
        Err(_) => return,
    };

    let script_body = match kind {
        ScriptKind::Setup => settings.setup_script,
        ScriptKind::Run => settings.run_script,
        ScriptKind::Archive => settings.archive_script,
    };

    let script_body = match script_body {
        Some(s) if !s.is_empty() => s,
        _ => return,
    };

    // Build env vars
    let env_vars = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = match workspaces.get(&ws_id) {
            Some(ws) => ws.clone(),
            None => return,
        };
        let repos = state.repositories.read().unwrap();
        let repo = match repos.get(&repo_id) {
            Some(r) => r.clone(),
            None => return,
        };
        let app_settings = state.settings.read().unwrap().clone();
        let mut env = claude_process::build_env_vars(&ws, &repo, &app_settings, settings.provider_override.as_ref());
        for (k, v) in &settings.env_vars {
            env.insert(k.clone(), v.clone());
        }
        env
    };

    let app_handle = app.clone();
    let script_pids = Arc::clone(&state.script_pids);

    tauri::async_runtime::spawn(async move {
        let mut child = match script_runner::spawn_script(
            ws_id,
            kind,
            &script_body,
            &worktree_path,
            env_vars,
            app_handle.clone(),
        )
        .await
        {
            Ok(c) => c,
            Err(_) => return,
        };

        let key = format!("{}:{}", ws_id, kind.as_str());
        if let Some(pid) = child.id() {
            script_pids.lock().unwrap().insert(key.clone(), pid);
        }

        // Wait for exit and emit event
        let exit_status = child.wait().await.ok();

        // Remove PID from map now that process has exited
        {
            script_pids.lock().unwrap().remove(&key);
        }

        let (exit_code, success) = match exit_status {
            Some(ref status) => (status.code(), status.success()),
            None => (None, false),
        };

        let exit_event = format!("script-exit:{}:{}", kind.as_str(), ws_id);
        let _ = app_handle.emit(
            &exit_event,
            &script_runner::ScriptExitEvent { exit_code, success },
        );
    });
}
