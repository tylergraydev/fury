use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Emitter, State};
use uuid::Uuid;

use crate::commands::script as script_cmd;
use crate::error::AppError;
use crate::models::workspace::{CreateWorkspaceRequest, Workspace, WorkspaceInfo, WorkspaceStatus};
use crate::platform;
use crate::services::script_runner::ScriptKind;
use crate::services::{claude_process, script_runner, worktree};
use crate::state::AppState;

#[tauri::command]
pub fn create_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreateWorkspaceRequest,
) -> Result<WorkspaceInfo, AppError> {
    // Validate repository exists
    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&request.repo_id)
        .ok_or(AppError::RepoNotFound(request.repo_id))?
        .clone();
    drop(repos);

    // Allocate ports
    let port_base = state.port_allocator.lock().unwrap().allocate()?;

    // Create git worktree
    let app_data_dir = platform::app_data_dir();
    let worktree_path = worktree::create_worktree(
        &repo.path,
        &request.branch_name,
        &request.workspace_name,
        &app_data_dir,
        &repo.name,
    )?;

    // Apply sparse checkout if needed
    if let Some(ref dirs) = request.sparse_dirs {
        if !dirs.is_empty() {
            worktree::apply_sparse_checkout(&worktree_path, dirs)?;
        }
    }

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
        created_at: chrono::Utc::now(),
        archived_at: None,
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
        .lock()
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
pub fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>, AppError> {
    let workspaces = state.workspaces.lock().unwrap();
    Ok(workspaces.values().map(WorkspaceInfo::from).collect())
}

#[tauri::command]
pub fn archive_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Get workspace info for archive script before updating status
    let (repo_id, worktree_path) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        (ws.repo_id, ws.worktree_path.clone())
    };

    // Update status
    {
        let mut workspaces = state.workspaces.lock().unwrap();
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

    Ok(())
}

#[tauri::command]
pub fn delete_workspace(state: State<'_, AppState>, workspace_id: String) -> Result<(), AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Get workspace info for cleanup
    let ws = {
        let workspaces = state.workspaces.lock().unwrap();
        workspaces.get(&id).cloned()
    };

    if let Some(ws) = ws {
        // Get repo path
        let repos = state.repositories.lock().unwrap();
        if let Some(repo) = repos.get(&ws.repo_id) {
            let _ = worktree::remove_worktree(&repo.path, &ws.worktree_path);
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
    state.workspaces.lock().unwrap().remove(&id);

    Ok(())
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
        let workspaces = state.workspaces.lock().unwrap();
        let ws = match workspaces.get(&ws_id) {
            Some(ws) => ws.clone(),
            None => return,
        };
        let repos = state.repositories.lock().unwrap();
        let repo = match repos.get(&repo_id) {
            Some(r) => r.clone(),
            None => return,
        };
        let app_settings = state.settings.lock().unwrap().clone();
        let mut env = claude_process::build_env_vars(&ws, &repo, &app_settings);
        for (k, v) in &settings.env_vars {
            env.insert(k.clone(), v.clone());
        }
        env
    };

    let app_handle = app.clone();
    let script_processes = Arc::clone(&state.script_processes);

    tauri::async_runtime::spawn(async move {
        let child = match script_runner::spawn_script(
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
        {
            script_processes.lock().unwrap().insert(key.clone(), child);
        }

        // Wait for exit and emit event
        let mut child = { script_processes.lock().unwrap().remove(&key) };
        let exit_status = if let Some(ref mut c) = child {
            c.wait().await.ok()
        } else {
            None
        };

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
