use std::sync::Arc;

use crate::error::AppError;
use crate::models::repository::{RepoSettings, RunScriptMode};
use crate::services::{claude_process, fury_json, script_runner};
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

use script_runner::{ScriptExitEvent, ScriptKind};

/// Resolve the effective repo settings by merging DB + fury.json.
pub(crate) fn resolve_settings(state: &AppState, repo_id: &Uuid) -> Result<RepoSettings, AppError> {
    let db_settings = {
        let db = state.db.lock().unwrap();
        match db.as_ref() {
            Some(db) => db.get_repo_settings(repo_id)?,
            None => RepoSettings::default(),
        }
    };

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(repo_id).ok_or(AppError::RepoNotFound(*repo_id))?;
        repo.path.clone()
    };

    let cj = fury_json::load_fury_json(&repo_path).unwrap_or(None);
    Ok(fury_json::merge_settings(&db_settings, cj.as_ref()))
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
        let workspaces = state.workspaces.read().unwrap();
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
        let mut pids = state.script_pids.lock().unwrap();
        if let Some(pid) = pids.remove(&key) {
            let _ = crate::platform::kill_process_group(pid);
        }
    }

    // Build env vars: FURY_* + provider vars + repo-specific env vars
    let env_vars = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?
            .clone();
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?
            .clone();
        let app_settings = state.settings.read().unwrap().clone();
        let mut env = claude_process::build_env_vars(&ws, &repo, &app_settings);
        // Add repo-specific env vars
        for (k, v) in &settings.env_vars {
            env.insert(k.clone(), v.clone());
        }
        env
    };

    // Spawn the script
    let mut child = script_runner::spawn_script(
        ws_id,
        kind,
        &script_body,
        &worktree_path,
        env_vars,
        app.clone(),
    )
    .await?;

    // Store PID so stop_script can kill the process
    let key = format!("{}:{}", ws_id, kind.as_str());
    if let Some(pid) = child.id() {
        let mut pids = state.script_pids.lock().unwrap();
        pids.insert(key.clone(), pid);
    }

    // Background task to wait for exit, then clean up and emit event
    let pids_ref = Arc::clone(&state.script_pids);
    let app_clone = app.clone();
    let exit_event = format!("script-exit:{}:{}", kind.as_str(), ws_id);
    tokio::spawn(async move {
        let exit_status = child.wait().await.ok();

        // Remove PID from map now that process has exited
        {
            let mut pids = pids_ref.lock().unwrap();
            pids.remove(&key);
        }

        // Clean up PID entry after process exits
        {
            let mut pids = pids_ref.lock().unwrap();
            pids.remove(&key);
        }

        let (exit_code, success) = match exit_status {
            Some(ref status) => (status.code(), status.success()),
            None => (None, false),
        };

        let _ = app_clone.emit(&exit_event, &ScriptExitEvent { exit_code, success });
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_script(
    state: State<'_, AppState>,
    workspace_id: String,
    script_kind: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let kind = ScriptKind::from_str(&script_kind)?;

    let script_pids = Arc::clone(&state.script_pids);
    tokio::task::spawn_blocking(move || {
        let key = format!("{}:{}", ws_id, kind.as_str());
        let mut pids = script_pids.lock().unwrap();
        if let Some(pid) = pids.remove(&key) {
            let _ = crate::platform::kill_process_group(pid);
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn run_repo_script(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    script_kind: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let kind = ScriptKind::from_str(&script_kind)?;

    // Resolve settings and repo path
    let settings = resolve_settings(&state, &id)?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

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
        let key = format!("repo:{}:{}", id, kind.as_str());
        let mut pids = state.script_pids.lock().unwrap();
        if let Some(pid) = pids.remove(&key) {
            let _ = crate::platform::kill_process_group(pid);
        }
    }

    // Build env vars using repo-direct mode
    let env_vars = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?.clone();
        let app_settings = state.settings.read().unwrap().clone();
        let mut env = claude_process::build_repo_env_vars(&repo, &app_settings);
        for (k, v) in &settings.env_vars {
            env.insert(k.clone(), v.clone());
        }
        env
    };

    // Spawn the script
    let mut child = script_runner::spawn_script(
        id,
        kind,
        &script_body,
        &repo_path,
        env_vars,
        app.clone(),
    )
    .await?;

    // Store PID so stop_repo_script can kill the process
    let key = format!("repo:{}:{}", id, kind.as_str());
    if let Some(pid) = child.id() {
        let mut pids = state.script_pids.lock().unwrap();
        pids.insert(key.clone(), pid);
    }

    // Background task to wait for exit, then clean up and emit event
    let pids_ref = Arc::clone(&state.script_pids);
    let app_clone = app.clone();
    let exit_event = format!("script-exit:{}:{}", kind.as_str(), id);
    tokio::spawn(async move {
        let exit_status = child.wait().await.ok();

        // Remove PID from map now that process has exited
        {
            let mut pids = pids_ref.lock().unwrap();
            pids.remove(&key);
        }

        // Clean up PID entry after process exits
        {
            let mut pids = pids_ref.lock().unwrap();
            pids.remove(&key);
        }

        let (exit_code, success) = match exit_status {
            Some(ref status) => (status.code(), status.success()),
            None => (None, false),
        };

        let _ = app_clone.emit(&exit_event, &ScriptExitEvent { exit_code, success });
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_repo_script(
    state: State<'_, AppState>,
    repo_id: String,
    script_kind: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let kind = ScriptKind::from_str(&script_kind)?;

    let script_pids = Arc::clone(&state.script_pids);
    tokio::task::spawn_blocking(move || {
        let key = format!("repo:{}:{}", id, kind.as_str());
        let mut pids = script_pids.lock().unwrap();
        if let Some(pid) = pids.remove(&key) {
            let _ = crate::platform::kill_process_group(pid);
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_repo_settings(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<RepoSettings, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    resolve_settings(&state, &id)
}

#[tauri::command]
pub async fn update_repo_settings(
    state: State<'_, AppState>,
    repo_id: String,
    settings: RepoSettings,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Verify repo exists
    {
        let repos = state.repositories.read().unwrap();
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
