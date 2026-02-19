use std::sync::Arc;

use crate::error::AppError;
use crate::models::repository::{RepoSettings, RunScriptMode};
use crate::services::{claude_process, conductor_json, script_runner};
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

use script_runner::{ScriptExitEvent, ScriptKind};

/// Resolve the effective repo settings by merging DB + conductor.json.
pub(crate) fn resolve_settings(state: &AppState, repo_id: &Uuid) -> Result<RepoSettings, AppError> {
    let db_settings = {
        let db = state.db.lock().unwrap();
        match db.as_ref() {
            Some(db) => db.get_repo_settings(repo_id)?,
            None => RepoSettings::default(),
        }
    };

    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(repo_id).ok_or(AppError::RepoNotFound(*repo_id))?;
        repo.path.clone()
    };

    let cj = conductor_json::load_conductor_json(&repo_path).unwrap_or(None);
    Ok(conductor_json::merge_settings(&db_settings, cj.as_ref()))
}

#[tauri::command]
pub async fn run_script(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    script_kind: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let kind = ScriptKind::from_str(&script_kind)?;

    // Look up workspace and repo
    let (worktree_path, repo_id) = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        (ws.worktree_path.clone(), ws.repo_id)
    };

    // Resolve settings
    let settings = resolve_settings(&state, &repo_id)?;

    // Get the script body for the requested kind
    let script_body = match kind {
        ScriptKind::Setup => settings.setup_script,
        ScriptKind::Run => settings.run_script,
        ScriptKind::Archive => settings.archive_script,
    };

    let script_body = script_body.ok_or_else(|| {
        AppError::ScriptError(format!("No {} script configured", kind.as_str()))
    })?;

    // Nonconcurrent mode: kill previous run script before starting new one
    if kind == ScriptKind::Run && matches!(settings.run_script_mode, RunScriptMode::Nonconcurrent) {
        let key = format!("{}:{}", ws_id, kind.as_str());
        let mut processes = state.script_processes.lock().unwrap();
        if let Some(child) = processes.remove(&key) {
            if let Some(pid) = child.id() {
                let _ = crate::platform::kill_process_group(pid);
            }
        }
    }

    // Build env vars: CONDUCTOR_* + provider vars + repo-specific env vars
    let env_vars = {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?
            .clone();
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?
            .clone();
        let app_settings = state.settings.lock().unwrap().clone();
        let mut env = claude_process::build_env_vars(&ws, &repo, &app_settings);
        // Add repo-specific env vars
        for (k, v) in &settings.env_vars {
            env.insert(k.clone(), v.clone());
        }
        env
    };

    // Spawn the script
    let child = script_runner::spawn_script(
        ws_id,
        kind,
        &script_body,
        &worktree_path,
        env_vars,
        app.clone(),
    )
    .await?;

    // Store process handle
    let key = format!("{}:{}", ws_id, kind.as_str());
    {
        let mut processes = state.script_processes.lock().unwrap();
        processes.insert(key.clone(), child);
    }

    // Background task to wait for exit
    let processes_ref = Arc::clone(&state.script_processes);
    let app_clone = app.clone();
    let exit_event = format!("script-exit:{}:{}", kind.as_str(), ws_id);
    tokio::spawn(async move {
        let mut child = {
            let mut processes = processes_ref.lock().unwrap();
            processes.remove(&key)
        };

        let exit_status = if let Some(ref mut c) = child {
            c.wait().await.ok()
        } else {
            None
        };

        let (exit_code, success) = match exit_status {
            Some(ref status) => (status.code(), status.success()),
            None => (None, false),
        };

        let _ = app_clone.emit(&exit_event, &ScriptExitEvent { exit_code, success });
    });

    Ok(())
}

#[tauri::command]
pub fn stop_script(
    state: State<'_, AppState>,
    workspace_id: String,
    script_kind: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let kind = ScriptKind::from_str(&script_kind)?;

    let key = format!("{}:{}", ws_id, kind.as_str());
    let mut processes = state.script_processes.lock().unwrap();
    if let Some(child) = processes.remove(&key) {
        if let Some(pid) = child.id() {
            let _ = crate::platform::kill_process_group(pid);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_repo_settings(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<RepoSettings, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    resolve_settings(&state, &id)
}

#[tauri::command]
pub fn update_repo_settings(
    state: State<'_, AppState>,
    repo_id: String,
    settings: RepoSettings,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Verify repo exists
    {
        let repos = state.repositories.lock().unwrap();
        if !repos.contains_key(&id) {
            return Err(AppError::RepoNotFound(id));
        }
    }

    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.upsert_repo_settings(&id, &settings)?;
    }

    Ok(())
}
