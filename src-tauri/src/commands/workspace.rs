use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{Emitter, State};
use uuid::Uuid;

use crate::commands::script as script_cmd;
use crate::error::AppError;
use crate::models::agent::AgentStatus;
use crate::models::workspace::{CreateWorkspaceRequest, Workspace, WorkspaceInfo, WorkspaceStatus};
use crate::services::script_runner::ScriptKind;
use crate::services::{claude_process, script_runner, worktree};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

/// List active (non-archived) workspaces from an in-memory map.
pub(crate) fn list_workspaces_inner(
    workspaces: &HashMap<Uuid, Workspace>,
) -> Vec<WorkspaceInfo> {
    workspaces
        .values()
        .filter(|ws| ws.status != WorkspaceStatus::Archived)
        .map(WorkspaceInfo::from)
        .collect()
}

/// Parse a workspace ID string and validate the workspace exists.
/// Returns the parsed UUID.
pub(crate) fn parse_workspace_id(id_str: &str) -> Result<Uuid, AppError> {
    id_str
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))
}

/// Update workspace status to Archived in memory.
/// Returns (repo_id, worktree_path) for the archived workspace.
pub(crate) fn archive_workspace_inner(
    workspaces: &mut HashMap<Uuid, Workspace>,
    id: Uuid,
) -> Result<(Uuid, PathBuf), AppError> {
    let (repo_id, worktree_path) = {
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        (ws.repo_id, ws.worktree_path.clone())
    };

    if let Some(ws) = workspaces.get_mut(&id) {
        ws.status = WorkspaceStatus::Archived;
        ws.archived_at = Some(chrono::Utc::now());
    }

    Ok((repo_id, worktree_path))
}

/// Update workspace notes in memory. Returns true if the workspace was found.
pub(crate) fn update_notes_inner(
    workspaces: &mut HashMap<Uuid, Workspace>,
    id: Uuid,
    notes: String,
) -> bool {
    if let Some(ws) = workspaces.get_mut(&id) {
        ws.notes = notes;
        true
    } else {
        false
    }
}

/// Rename a workspace in memory. Returns true if the workspace was found.
pub(crate) fn rename_workspace_inner(
    workspaces: &mut HashMap<Uuid, Workspace>,
    id: Uuid,
    name: String,
) -> bool {
    if let Some(ws) = workspaces.get_mut(&id) {
        ws.name = name;
        true
    } else {
        false
    }
}

/// Set workspace pinned status in memory. Returns true if the workspace was found.
pub(crate) fn set_pinned_inner(
    workspaces: &mut HashMap<Uuid, Workspace>,
    id: Uuid,
    pinned: bool,
) -> bool {
    if let Some(ws) = workspaces.get_mut(&id) {
        ws.pinned = pinned;
        true
    } else {
        false
    }
}

/// Update sparse dirs on a workspace in memory.
/// Returns the new value to persist.
pub(crate) fn update_sparse_dirs_inner(
    workspaces: &mut HashMap<Uuid, Workspace>,
    id: Uuid,
    dirs: Vec<String>,
) -> Option<Vec<String>> {
    let sparse_dirs = if dirs.is_empty() { None } else { Some(dirs) };
    if let Some(ws) = workspaces.get_mut(&id) {
        ws.sparse_dirs = sparse_dirs.clone();
    }
    sparse_dirs
}

/// Validate that both workspace IDs exist for linking.
pub(crate) fn validate_link_workspaces(
    workspaces: &HashMap<Uuid, Workspace>,
    ws_id: Uuid,
    linked_id: Uuid,
) -> Result<(), AppError> {
    workspaces
        .get(&ws_id)
        .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    workspaces
        .get(&linked_id)
        .ok_or(AppError::WorkspaceNotFound(linked_id))?;
    Ok(())
}

/// List archived workspaces from the database.
#[cfg(test)]
pub(crate) fn list_archived_workspaces_inner(
    db: &crate::db::Database,
) -> Result<Vec<WorkspaceInfo>, AppError> {
    let workspaces = db.list_archived_workspaces()?;
    Ok(workspaces.iter().map(WorkspaceInfo::from).collect())
}

/// Persist workspace notes to the database.
#[cfg(test)]
pub(crate) fn persist_notes(
    db: &crate::db::Database,
    id: &Uuid,
    notes: &str,
) -> Result<(), AppError> {
    db.update_workspace_notes(id, notes)
}

/// Persist workspace name to the database.
#[cfg(test)]
pub(crate) fn persist_rename(
    db: &crate::db::Database,
    id: &Uuid,
    name: &str,
) -> Result<(), AppError> {
    db.update_workspace_name(id, name)
}

/// Persist workspace pinned status to the database.
#[cfg(test)]
pub(crate) fn persist_pinned(
    db: &crate::db::Database,
    id: &Uuid,
    pinned: bool,
) -> Result<(), AppError> {
    db.update_workspace_pinned(id, pinned)
}

/// Persist workspace sparse dirs to the database.
#[cfg(test)]
pub(crate) fn persist_sparse_dirs(
    db: &crate::db::Database,
    id: &Uuid,
    dirs: &Option<Vec<String>>,
) -> Result<(), AppError> {
    db.update_workspace_sparse_dirs(id, dirs)
}

/// Link two workspaces in the database.
#[cfg(test)]
pub(crate) fn link_workspaces_inner(
    db: &crate::db::Database,
    ws_id: &Uuid,
    linked_id: &Uuid,
) -> Result<(), AppError> {
    db.insert_workspace_link(ws_id, linked_id)
}

/// Unlink two workspaces in the database.
#[cfg(test)]
pub(crate) fn unlink_workspaces_inner(
    db: &crate::db::Database,
    ws_id: &Uuid,
    linked_id: &Uuid,
) -> Result<(), AppError> {
    db.delete_workspace_link(ws_id, linked_id)
}

/// Get linked workspace IDs from the database.
#[cfg(test)]
pub(crate) fn get_linked_workspaces_inner(
    db: &crate::db::Database,
    ws_id: &Uuid,
) -> Result<Vec<Uuid>, AppError> {
    db.get_workspace_links(ws_id)
}

/// Archive a workspace in the database (status update only).
#[cfg(test)]
pub(crate) fn persist_archive(
    db: &crate::db::Database,
    id: &Uuid,
) -> Result<(), AppError> {
    db.update_workspace_status(id, &WorkspaceStatus::Archived)
}

/// Restore a workspace in the database (status update only).
#[cfg(test)]
pub(crate) fn persist_restore(
    db: &crate::db::Database,
    id: &Uuid,
) -> Result<(), AppError> {
    db.update_workspace_status(id, &WorkspaceStatus::Active)
}

/// Delete a workspace from the database.
#[cfg(test)]
pub(crate) fn delete_workspace_inner(
    db: &crate::db::Database,
    id: &Uuid,
) -> Result<(), AppError> {
    db.delete_workspace(&id)
}

/// Resolve worktree base path from repo settings and repo info.
pub(crate) fn resolve_worktree_base(
    worktree_base_path: Option<&str>,
    repo_name: &str,
    repo_path: &Path,
) -> Result<PathBuf, AppError> {
    match worktree_base_path {
        Some(custom) if !custom.trim().is_empty() => {
            let p = PathBuf::from(custom.trim());
            if !p.is_absolute() {
                return Err(AppError::GitError(
                    "Worktree base path must be an absolute path".to_string(),
                ));
            }
            Ok(p.join(repo_name))
        }
        _ => Ok(repo_path.join(".claude").join("worktrees")),
    }
}

#[tauri::command]
#[specta::specta]
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
    let worktree_base = resolve_worktree_base(
        repo_settings.worktree_base_path.as_deref(),
        &repo.name,
        &repo.path,
    )?;

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
    let ws_clone = workspace.clone();
    state.with_db(move |db| { db.insert_workspace(&ws_clone)?; Ok(()) }).await?;

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

/// Move uncommitted changes from a repo's working tree into a brand-new
/// workspace (worktree) so the user can iterate, commit, and open a PR from a
/// dedicated branch. Source repo is left clean afterward.
#[tauri::command]
#[specta::specta]
pub async fn extract_changes_to_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<WorkspaceInfo, AppError> {
    let repo_uuid: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo = {
        let repos = state.repositories.read().unwrap();
        repos
            .get(&repo_uuid)
            .ok_or(AppError::RepoNotFound(repo_uuid))?
            .clone()
    };

    // Allocate ports up front; if extraction fails we drop them with the function.
    let port_base = state.port_allocator.lock().unwrap().allocate()?;

    let repo_settings = script_cmd::resolve_settings(&state, &repo_uuid)?;
    let worktree_base = resolve_worktree_base(
        repo_settings.worktree_base_path.as_deref(),
        &repo.name,
        &repo.path,
    )?;

    // Auto-generate names with a timestamp so each extraction is unique.
    let ts = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let workspace_name = format!("changes-{}", ts);
    let branch_name = format!("fury/extract-{}", ts);

    let repo_path = repo.path.clone();
    let workspace_name_clone = workspace_name.clone();
    let branch_name_clone = branch_name.clone();
    let worktree_path = tokio::task::spawn_blocking(move || -> Result<PathBuf, AppError> {
        let wt_path = worktree::extract_changes_to_new_worktree(
            &repo_path,
            &branch_name_clone,
            &workspace_name_clone,
            &worktree_base,
        )?;

        // Mirror create_workspace: ensure .context dir exists for inter-agent collab.
        let context_dir = wt_path.join(".context");
        let _ = std::fs::create_dir_all(&context_dir);
        let _ = std::fs::write(context_dir.join(".gitignore"), "*\n!.gitignore\n");

        Ok(wt_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let workspace = Workspace {
        id: Uuid::new_v4(),
        repo_id: repo_uuid,
        name: workspace_name,
        branch: branch_name,
        worktree_path,
        status: WorkspaceStatus::Active,
        port_base,
        sparse_dirs: None,
        notes: String::new(),
        auto_commit: true,
        pinned: false,
        created_at: chrono::Utc::now(),
        archived_at: None,
        devcontainer_config: None,
    };

    let info = WorkspaceInfo::from(&workspace);
    let ws_worktree_path = workspace.worktree_path.clone();

    let ws_clone = workspace.clone();
    state
        .with_db(move |db| {
            db.insert_workspace(&ws_clone)?;
            Ok(())
        })
        .await?;

    state
        .workspaces
        .write()
        .unwrap()
        .insert(workspace.id, workspace);

    let _ = app.emit("workspace-created", &info);

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
#[specta::specta]
pub async fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>, AppError> {
    let result = {
        let workspaces = state.workspaces.read().unwrap();
        list_workspaces_inner(&workspaces)
    };

    tokio::task::spawn_blocking(move || Ok(result))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Clean up all runtime resources associated with a workspace.
/// Called by both archive and delete to prevent resource leaks.
pub(crate) async fn cleanup_workspace_resources(state: &AppState, id: Uuid) {
    // 1. Stop agent (if running) — kill process, clear stdin, persistent handle
    {
        let pid = {
            let mut agents = state.agents.lock().unwrap();
            if let Some(agent) = agents.get_mut(&id) {
                agent.status = AgentStatus::Idle;
                agent.pid.take()
            } else {
                None
            }
        };
        if let Some(pid) = pid {
            let _ = crate::platform::kill_process_group(pid);
        }
        if let Some(mut child) = state.agent_processes.lock().unwrap().remove(&id) {
            let _ = child.start_kill();
        }
        state.persistent_agents.lock().unwrap().remove(&id);
        state.agent_stdins.lock().unwrap().remove(&id);
    }

    // 2. Kill running scripts (setup, run, archive keys)
    for kind in &["setup", "run", "archive"] {
        let key = format!("{}:{}", id, kind);
        script_cmd::kill_script_by_key(&state.script_pids, &key);
    }

    // 3. Close terminal sessions belonging to this workspace
    {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        let ws_terminal_ids: Vec<Uuid> = sessions
            .iter()
            .filter(|(_, s)| s.workspace_id == id)
            .map(|(tid, _)| *tid)
            .collect();
        for tid in ws_terminal_ids {
            if let Some(mut session) = sessions.remove(&tid) {
                let _ = session.child.kill();
            }
        }
    }

    // 4. Stop spotlight watcher
    {
        let handle = state.spotlight_watchers.lock().unwrap().remove(&id);
        if let Some(handle) = handle {
            let _ = tokio::task::spawn_blocking(move || handle.stop()).await;
        }
    }

    // 5. Stop diff watcher
    {
        let handle = state.diff_watchers.lock().unwrap().remove(&id);
        if let Some(handle) = handle {
            let _ = tokio::task::spawn_blocking(move || handle.stop()).await;
        }
    }

    // 6. Stop test processes and watchers for this workspace
    {
        let key = format!("test:{}", id);
        let mut processes = state.test_processes.lock().unwrap();
        if let Some(pid) = processes.remove(&key) {
            let _ = crate::platform::kill_process_group(pid);
        }
    }
    {
        let key = id.to_string();
        let handle = state.test_watchers.lock().unwrap().remove(&key);
        if let Some(handle) = handle {
            let _ = tokio::task::spawn_blocking(move || handle.stop()).await;
        }
    }

    // 7. Clear pending permissions and agent metadata
    state.pending_permissions.lock().unwrap().remove(&id);
    state.agents.lock().unwrap().remove(&id);
    state.indexing_status.lock().unwrap().remove(&id);
}

#[tauri::command]
#[specta::specta]
pub async fn archive_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    // Clean up all runtime resources (agents, scripts, terminals, watchers)
    cleanup_workspace_resources(&state, id).await;

    // Update status and get info for archive script
    let (repo_id, worktree_path) = {
        let mut workspaces = state.workspaces.write().unwrap();
        archive_workspace_inner(&mut workspaces, id)?
    };

    // Persist
    let id_clone = id;
    state.with_db(move |db| { db.update_workspace_status(&id_clone, &WorkspaceStatus::Archived)?; Ok(()) }).await?;

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
#[specta::specta]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    // Clean up all runtime resources (agents, scripts, terminals, watchers)
    cleanup_workspace_resources(&state, id).await;

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
    let id_clone = id;
    state.with_db(move |db| { db.delete_workspace(&id_clone)?; Ok(()) }).await?;
    state.workspaces.write().unwrap().remove(&id);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_archived_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceInfo>, AppError> {
    let result = state.with_db(move |db| {
        let workspaces = db.list_archived_workspaces()?;
        Ok(workspaces.iter().map(WorkspaceInfo::from).collect())
    }).await?;

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn restore_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceInfo, AppError> {
    let id = parse_workspace_id(&workspace_id)?;

    // Load from DB (archived workspaces are not in memory)
    let mut ws = state.with_db(move |db| {
        let archived = db.list_archived_workspaces()?;
        archived
            .into_iter()
            .find(|w| w.id == id)
            .ok_or(AppError::WorkspaceNotFound(id))
    }).await?;

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
    let id_clone = id;
    state.with_db(move |db| { db.update_workspace_status(&id_clone, &WorkspaceStatus::Active)?; Ok(()) }).await?;

    let info = WorkspaceInfo::from(&ws);

    // Re-add to in-memory state
    state.workspaces.write().unwrap().insert(ws.id, ws);

    let _ = app.emit("workspace-restored", &info);
    Ok(info)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    // -----------------------------------------------------------------------
    // parse_workspace_id
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_workspace_id_valid() {
        let id = Uuid::new_v4();
        let result = parse_workspace_id(&id.to_string()).unwrap();
        assert_eq!(result, id);
    }

    #[test]
    fn test_parse_workspace_id_invalid() {
        let result = parse_workspace_id("not-a-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_workspace_id_empty() {
        let result = parse_workspace_id("");
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // list_workspaces_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_list_workspaces_inner_filters_archived() {
        let mut map = HashMap::new();
        let repo_id = Uuid::new_v4();

        let ws1 = test_workspace(repo_id);
        let ws2 = {
            let mut ws = test_workspace(repo_id);
            ws.status = WorkspaceStatus::Archived;
            ws
        };
        let ws3 = test_workspace(repo_id);

        map.insert(ws1.id, ws1.clone());
        map.insert(ws2.id, ws2);
        map.insert(ws3.id, ws3.clone());

        let result = list_workspaces_inner(&map);
        assert_eq!(result.len(), 2);
        let ids: Vec<Uuid> = result.iter().map(|i| i.id).collect();
        assert!(ids.contains(&ws1.id));
        assert!(ids.contains(&ws3.id));
    }

    #[test]
    fn test_list_workspaces_inner_empty() {
        let map = HashMap::new();
        let result = list_workspaces_inner(&map);
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_workspaces_inner_all_archived() {
        let mut map = HashMap::new();
        let repo_id = Uuid::new_v4();
        for _ in 0..3 {
            let mut ws = test_workspace(repo_id);
            ws.status = WorkspaceStatus::Archived;
            map.insert(ws.id, ws);
        }
        let result = list_workspaces_inner(&map);
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_workspaces_inner_db_roundtrip() {
        let db = test_db();
        let (repo, ws) = insert_test_repo_and_workspace(&db);

        let mut map = HashMap::new();
        map.insert(ws.id, ws.clone());

        let result = list_workspaces_inner(&map);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, ws.id);
        assert_eq!(result[0].repo_id, repo.id);
    }

    // -----------------------------------------------------------------------
    // archive_workspace_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_archive_workspace_inner_success() {
        let mut map = HashMap::new();
        let repo_id = Uuid::new_v4();
        let ws = test_workspace(repo_id);
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        let (ret_repo_id, ret_path) = archive_workspace_inner(&mut map, ws_id).unwrap();
        assert_eq!(ret_repo_id, repo_id);
        assert_eq!(ret_path, PathBuf::from("/tmp/test-worktree"));
        assert_eq!(map.get(&ws_id).unwrap().status, WorkspaceStatus::Archived);
        assert!(map.get(&ws_id).unwrap().archived_at.is_some());
    }

    #[test]
    fn test_archive_workspace_inner_not_found() {
        let mut map = HashMap::new();
        let result = archive_workspace_inner(&mut map, Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_archive_workspace_inner_already_archived() {
        let mut map = HashMap::new();
        let repo_id = Uuid::new_v4();
        let mut ws = test_workspace(repo_id);
        ws.status = WorkspaceStatus::Archived;
        let ws_id = ws.id;
        map.insert(ws_id, ws);

        // Should still succeed (idempotent)
        let result = archive_workspace_inner(&mut map, ws_id);
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // resolve_worktree_base
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_worktree_base_default() {
        let repo_path = PathBuf::from("/home/user/repos/myrepo");
        let result = resolve_worktree_base(None, "myrepo", &repo_path).unwrap();
        assert_eq!(result, PathBuf::from("/home/user/repos/myrepo/.claude/worktrees"));
    }

    #[test]
    fn test_resolve_worktree_base_empty_string() {
        let repo_path = PathBuf::from("/home/user/repos/myrepo");
        let result = resolve_worktree_base(Some("  "), "myrepo", &repo_path).unwrap();
        assert_eq!(result, PathBuf::from("/home/user/repos/myrepo/.claude/worktrees"));
    }

    #[test]
    fn test_resolve_worktree_base_custom_absolute() {
        let repo_path = PathBuf::from("/home/user/repos/myrepo");
        let result =
            resolve_worktree_base(Some("/custom/worktrees"), "myrepo", &repo_path).unwrap();
        assert_eq!(result, PathBuf::from("/custom/worktrees/myrepo"));
    }

    #[test]
    fn test_resolve_worktree_base_relative_path_error() {
        let repo_path = PathBuf::from("/home/user/repos/myrepo");
        let result = resolve_worktree_base(Some("relative/path"), "myrepo", &repo_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_worktree_base_custom_with_trailing_spaces() {
        let repo_path = PathBuf::from("/home/user/repos/myrepo");
        let result =
            resolve_worktree_base(Some("  /custom/path  "), "myrepo", &repo_path).unwrap();
        assert_eq!(result, PathBuf::from("/custom/path/myrepo"));
    }

    // -----------------------------------------------------------------------
    // DB roundtrip: archive / restore / delete
    // -----------------------------------------------------------------------

    #[test]
    fn test_persist_archive_db_roundtrip() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        persist_archive(&db, &ws.id).unwrap();

        let archived = list_archived_workspaces_inner(&db).unwrap();
        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, ws.id);
    }

    #[test]
    fn test_persist_restore_db_roundtrip() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        // Archive then restore
        persist_archive(&db, &ws.id).unwrap();
        let archived = list_archived_workspaces_inner(&db).unwrap();
        assert_eq!(archived.len(), 1);

        persist_restore(&db, &ws.id).unwrap();
        let archived_after = list_archived_workspaces_inner(&db).unwrap();
        assert!(archived_after.is_empty());
    }

    #[test]
    fn test_list_archived_workspaces_inner_empty() {
        let db = test_db();
        let result = list_archived_workspaces_inner(&db).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_archived_workspaces_inner_multiple() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();

        let ws1 = test_workspace(repo.id);
        let ws2 = test_workspace(repo.id);
        let ws3 = test_workspace(repo.id);
        db.insert_workspace(&ws1).unwrap();
        db.insert_workspace(&ws2).unwrap();
        db.insert_workspace(&ws3).unwrap();

        persist_archive(&db, &ws1.id).unwrap();
        persist_archive(&db, &ws3.id).unwrap();

        let archived = list_archived_workspaces_inner(&db).unwrap();
        assert_eq!(archived.len(), 2);
        let ids: Vec<Uuid> = archived.iter().map(|w| w.id).collect();
        assert!(ids.contains(&ws1.id));
        assert!(ids.contains(&ws3.id));
    }

    #[test]
    fn test_delete_workspace_inner_db() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        delete_workspace_inner(&db, &ws.id).unwrap();

        // Should not appear in archived list either
        let archived = list_archived_workspaces_inner(&db).unwrap();
        assert!(archived.is_empty());
    }

    #[test]
    fn test_delete_workspace_inner_nonexistent() {
        let db = test_db();
        // Deleting a non-existent workspace should not error
        let result = delete_workspace_inner(&db, &Uuid::new_v4());
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Combined in-memory + DB workflow tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_full_workspace_lifecycle() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();

        // Create workspace
        let ws = test_workspace(repo.id);
        db.insert_workspace(&ws).unwrap();
        let mut map = HashMap::new();
        map.insert(ws.id, ws.clone());

        // List: should appear
        let listed = list_workspaces_inner(&map);
        assert_eq!(listed.len(), 1);

        // Rename
        rename_workspace_inner(&mut map, ws.id, "renamed".to_string());
        persist_rename(&db, &ws.id, "renamed").unwrap();
        assert_eq!(map.get(&ws.id).unwrap().name, "renamed");

        // Pin
        set_pinned_inner(&mut map, ws.id, true);
        persist_pinned(&db, &ws.id, true).unwrap();
        assert!(map.get(&ws.id).unwrap().pinned);

        // Notes
        update_notes_inner(&mut map, ws.id, "my notes".to_string());
        persist_notes(&db, &ws.id, "my notes").unwrap();
        assert_eq!(map.get(&ws.id).unwrap().notes, "my notes");

        // Sparse dirs
        let dirs = vec!["src".to_string()];
        let sparse = update_sparse_dirs_inner(&mut map, ws.id, dirs);
        persist_sparse_dirs(&db, &ws.id, &sparse).unwrap();

        // Archive
        archive_workspace_inner(&mut map, ws.id).unwrap();
        persist_archive(&db, &ws.id).unwrap();
        assert_eq!(map.get(&ws.id).unwrap().status, WorkspaceStatus::Archived);

        let archived = list_archived_workspaces_inner(&db).unwrap();
        assert_eq!(archived.len(), 1);

        // Restore
        persist_restore(&db, &ws.id).unwrap();
        if let Some(w) = map.get_mut(&ws.id) {
            w.status = WorkspaceStatus::Active;
            w.archived_at = None;
        }
        assert_eq!(map.get(&ws.id).unwrap().status, WorkspaceStatus::Active);

        // Delete
        delete_workspace_inner(&db, &ws.id).unwrap();
        map.remove(&ws.id);
        assert!(map.is_empty());
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests (using mock_app_with_state)
    // -----------------------------------------------------------------------

    use tauri::Manager;

    fn setup_ws_state() -> (tauri::App<tauri::test::MockRuntime>, Uuid, Uuid) {
        let app = mock_app_with_state();
        let state = app.state::<crate::state::AppState>();
        let repo_id = Uuid::new_v4();
        let ws_id = Uuid::new_v4();
        {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut repo = test_repo();
            repo.id = repo_id;
            db.insert_repository(&repo).unwrap();
            let mut ws = test_workspace(repo_id);
            ws.id = ws_id;
            db.insert_workspace(&ws).unwrap();
            state.repositories.write().unwrap().insert(repo_id, repo);
            state.workspaces.write().unwrap().insert(ws_id, ws);
        }
        (app, repo_id, ws_id)
    }

    #[tokio::test]
    async fn test_cmd_list_workspaces() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_workspaces(state).await;
        assert!(result.is_ok());
        let workspaces = result.unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].id, ws_id);
    }

    #[tokio::test]
    async fn test_cmd_list_workspaces_empty() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_workspaces(state).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_cmd_list_archived_workspaces_empty() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_archived_workspaces(state).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // NOTE: create_workspace takes AppHandle (Wry runtime) so it can't be
    // called directly from MockRuntime tests. The inner functions
    // (validate_create_request, create_workspace_inner, etc.) are tested above.

    // NOTE: archive_workspace takes AppHandle (Wry runtime) so it can't be
    // called directly from MockRuntime tests. The inner function
    // archive_workspace_inner is tested above.

    #[allow(dead_code)]
    fn setup_ws_state_with_real_repo() -> (
        tauri::App<tauri::test::MockRuntime>,
        tempfile::TempDir,
        Uuid,
    ) {
        let app = mock_app_with_state();
        let state = app.state::<crate::state::AppState>();
        let (_dir, path) = create_temp_git_repo();
        let repo_id = Uuid::new_v4();
        {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut repo = test_repo();
            repo.id = repo_id;
            repo.path = path.clone();
            db.insert_repository(&repo).unwrap();
            state.repositories.write().unwrap().insert(repo_id, repo);
        }
        (app, _dir, repo_id)
    }

    #[tokio::test]
    async fn test_cmd_delete_workspace() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = delete_workspace(state, ws_id.to_string()).await;
        assert!(result.is_ok());

        // Verify removed from memory
        let app_state = app.state::<crate::state::AppState>();
        let workspaces = app_state.workspaces.read().unwrap();
        assert!(!workspaces.contains_key(&ws_id));
    }

    #[tokio::test]
    async fn test_cmd_delete_workspace_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = delete_workspace(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_delete_workspace_not_in_state() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = delete_workspace(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_delete_workspace_removed_from_db() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        delete_workspace(state, ws_id.to_string()).await.unwrap();

        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let archived = list_archived_workspaces(state2).await.unwrap();
        assert!(archived.is_empty());
    }

    // NOTE: restore_workspace takes AppHandle (Wry runtime) so it can't be
    // called directly from MockRuntime tests.

    #[tokio::test]
    async fn test_cmd_delete_workspace_cleans_up_container_state() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        {
            let state = app.state::<crate::state::AppState>();
            state.container_states.lock().unwrap().insert(
                ws_id,
                crate::models::devcontainer::ContainerState {
                    workspace_id: ws_id,
                    status: crate::models::devcontainer::ContainerStatus::Running,
                    container_id: Some("fake-container-id".to_string()),
                    container_name: Some("fury-test".to_string()),
                    log_tail: vec![],
                },
            );
        }
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = delete_workspace(state, ws_id.to_string()).await;
        assert!(result.is_ok());

        let app_state = app.state::<crate::state::AppState>();
        assert!(!app_state.container_states.lock().unwrap().contains_key(&ws_id));
    }

    #[tokio::test]
    async fn test_cleanup_workspace_resources_clears_agents() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state = app.state::<crate::state::AppState>();
        state.agents.lock().unwrap().insert(
            ws_id,
            crate::models::agent::AgentInfo::new(ws_id),
        );
        state.pending_permissions.lock().unwrap().insert(
            ws_id,
            crate::models::agent::FrontendStreamEvent::System {
                session_id: None,
                message: Some("test".to_string()),
            },
        );

        cleanup_workspace_resources(&state, ws_id).await;

        assert!(!state.agents.lock().unwrap().contains_key(&ws_id));
        assert!(!state.pending_permissions.lock().unwrap().contains_key(&ws_id));
    }

    #[tokio::test]
    async fn test_cleanup_workspace_resources_clears_indexing_status() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        let state = app.state::<crate::state::AppState>();
        state.indexing_status.lock().unwrap().insert(
            ws_id,
            crate::models::mcp::IndexingStatus {
                repo_id: ws_id.to_string(),
                repo_path: "/tmp/test".to_string(),
                status: crate::models::mcp::IndexingState::Indexed,
                error: None,
                last_indexed_at: None,
            },
        );

        cleanup_workspace_resources(&state, ws_id).await;

        assert!(!state.indexing_status.lock().unwrap().contains_key(&ws_id));
    }

    #[tokio::test]
    async fn test_delete_workspace_clears_all_resources() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        {
            let state = app.state::<crate::state::AppState>();
            state.agents.lock().unwrap().insert(
                ws_id,
                crate::models::agent::AgentInfo::new(ws_id),
            );
            state.pending_permissions.lock().unwrap().insert(
                ws_id,
                crate::models::agent::FrontendStreamEvent::System {
                    session_id: None,
                    message: Some("test".to_string()),
                },
            );
            state.indexing_status.lock().unwrap().insert(
                ws_id,
                crate::models::mcp::IndexingStatus {
                    repo_id: ws_id.to_string(),
                    repo_path: "/tmp/test".to_string(),
                    status: crate::models::mcp::IndexingState::Indexed,
                    error: None,
                    last_indexed_at: None,
                },
            );
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = delete_workspace(state, ws_id.to_string()).await;
        assert!(result.is_ok());

        let s = app.state::<crate::state::AppState>();
        assert!(!s.agents.lock().unwrap().contains_key(&ws_id));
        assert!(!s.pending_permissions.lock().unwrap().contains_key(&ws_id));
        assert!(!s.indexing_status.lock().unwrap().contains_key(&ws_id));
        assert!(!s.workspaces.read().unwrap().contains_key(&ws_id));
    }

    #[tokio::test]
    async fn test_cmd_list_archived_workspaces_with_data() {
        let (app, _repo_id, ws_id) = setup_ws_state();
        {
            let state = app.state::<crate::state::AppState>();
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            db.update_workspace_status(&ws_id, &WorkspaceStatus::Archived).unwrap();
        }
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_archived_workspaces(state).await;
        assert!(result.is_ok());
        let archived = result.unwrap();
        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, ws_id);
    }
}
