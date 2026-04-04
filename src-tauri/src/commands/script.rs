use std::collections::HashMap;
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
    let db_settings = get_db_settings(state, repo_id)?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(repo_id).ok_or(AppError::RepoNotFound(*repo_id))?;
        repo.path.clone()
    };

    let cj = fury_json::load_fury_json(&repo_path).unwrap_or(None);
    Ok(fury_json::merge_settings(&db_settings, cj.as_ref()))
}

/// Read repo settings from DB, returning defaults if DB is unavailable.
pub(crate) fn get_db_settings(state: &AppState, repo_id: &Uuid) -> Result<RepoSettings, AppError> {
    let db = state.db.lock().unwrap();
    match db.as_ref() {
        Some(db) => db.get_repo_settings(repo_id),
        None => Ok(RepoSettings::default()),
    }
}

/// Extract the script body for a given ScriptKind from RepoSettings.
pub(crate) fn get_script_body(settings: &RepoSettings, kind: &ScriptKind) -> Option<String> {
    match kind {
        ScriptKind::Setup => settings.setup_script.clone(),
        ScriptKind::Run => settings.run_script.clone(),
        ScriptKind::Archive => settings.archive_script.clone(),
    }
}

/// Build the PID map key for a workspace-scoped script.
pub(crate) fn workspace_script_key(ws_id: &Uuid, kind: &ScriptKind) -> String {
    format!("{}:{}", ws_id, kind.as_str())
}

/// Build the PID map key for a repo-scoped script.
pub(crate) fn repo_script_key(repo_id: &Uuid, kind: &ScriptKind) -> String {
    format!("repo:{}:{}", repo_id, kind.as_str())
}

/// Kill a running script by removing its PID from the map and sending SIGTERM.
/// Returns true if a process was found and killed.
pub(crate) fn kill_script_by_key(pids: &Arc<std::sync::Mutex<HashMap<String, u32>>>, key: &str) -> bool {
    let mut pids = pids.lock().unwrap();
    if let Some(pid) = pids.remove(key) {
        let _ = crate::platform::kill_process_group(pid);
        true
    } else {
        false
    }
}

/// Check if nonconcurrent mode requires killing a previous script, and do so.
pub(crate) fn kill_previous_if_nonconcurrent(
    settings: &RepoSettings,
    kind: &ScriptKind,
    key: &str,
    pids: &Arc<std::sync::Mutex<HashMap<String, u32>>>,
) {
    if *kind == ScriptKind::Run && matches!(settings.run_script_mode, RunScriptMode::Nonconcurrent) {
        kill_script_by_key(pids, key);
    }
}

/// Store a PID in the map (if the child has one).
pub(crate) fn store_pid(pids: &Arc<std::sync::Mutex<HashMap<String, u32>>>, key: String, pid: Option<u32>) {
    if let Some(pid) = pid {
        let mut map = pids.lock().unwrap();
        map.insert(key, pid);
    }
}

/// Build the script exit event name.
pub(crate) fn script_exit_event(kind: &ScriptKind, id: &Uuid) -> String {
    format!("script-exit:{}:{}", kind.as_str(), id)
}

/// Persist repo settings to DB, verifying the repo exists first.
#[cfg(test)]
pub(crate) fn update_repo_settings_inner(
    state: &AppState,
    repo_id: &Uuid,
    settings: &RepoSettings,
) -> Result<(), AppError> {
    {
        let repos = state.repositories.read().unwrap();
        if !repos.contains_key(repo_id) {
            return Err(AppError::RepoNotFound(*repo_id));
        }
    }

    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.upsert_repo_settings(repo_id, settings)?;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
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

    // Resolve settings (DB portion via with_db)
    let repo_id_clone = repo_id;
    let db_settings = state.with_db(move |db| db.get_repo_settings(&repo_id_clone)).await
        .unwrap_or_else(|_| RepoSettings::default());

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&repo_id).ok_or(AppError::RepoNotFound(repo_id))?;
        repo.path.clone()
    };

    let cj = fury_json::load_fury_json(&repo_path).unwrap_or(None);
    let settings = fury_json::merge_settings(&db_settings, cj.as_ref());

    // Get the script body for the requested kind
    let script_body = get_script_body(&settings, &kind).ok_or_else(|| {
        AppError::ScriptError(format!("No {} script configured", kind.as_str()))
    })?;

    // Nonconcurrent mode: kill previous run script before starting new one
    let key = workspace_script_key(&ws_id, &kind);
    kill_previous_if_nonconcurrent(&settings, &kind, &key, &state.script_pids);

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
        let mut env = claude_process::build_env_vars(&ws, &repo, &app_settings, settings.provider_override.as_ref());
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
    let key = workspace_script_key(&ws_id, &kind);
    store_pid(&state.script_pids, key.clone(), child.id());

    // Background task to wait for exit, then clean up and emit event
    let pids_ref = Arc::clone(&state.script_pids);
    let app_clone = app.clone();
    let exit_event = script_exit_event(&kind, &ws_id);
    tokio::spawn(async move {
        let exit_status = child.wait().await.ok();

        // Remove PID from map now that process has exited
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
#[specta::specta]
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
        let key = workspace_script_key(&ws_id, &kind);
        kill_script_by_key(&script_pids, &key);
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
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

    // Resolve settings (DB portion via with_db) and repo path
    let id_clone = id;
    let db_settings = state.with_db(move |db| db.get_repo_settings(&id_clone)).await
        .unwrap_or_else(|_| RepoSettings::default());

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let cj = fury_json::load_fury_json(&repo_path).unwrap_or(None);
    let settings = fury_json::merge_settings(&db_settings, cj.as_ref());

    let script_body = get_script_body(&settings, &kind).ok_or_else(|| {
        AppError::ScriptError(format!("No {} script configured", kind.as_str()))
    })?;

    // Nonconcurrent mode: kill previous run script before starting new one
    let key = repo_script_key(&id, &kind);
    kill_previous_if_nonconcurrent(&settings, &kind, &key, &state.script_pids);

    // Build env vars using repo-direct mode
    let env_vars = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?.clone();
        let app_settings = state.settings.read().unwrap().clone();
        let mut env = claude_process::build_repo_env_vars(&repo, &app_settings, settings.provider_override.as_ref());
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
    let key = repo_script_key(&id, &kind);
    store_pid(&state.script_pids, key.clone(), child.id());

    // Background task to wait for exit, then clean up and emit event
    let pids_ref = Arc::clone(&state.script_pids);
    let app_clone = app.clone();
    let exit_event = script_exit_event(&kind, &id);
    tokio::spawn(async move {
        let exit_status = child.wait().await.ok();

        // Remove PID from map now that process has exited
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
#[specta::specta]
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
        let key = repo_script_key(&id, &kind);
        kill_script_by_key(&script_pids, &key);
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_repo_settings(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<RepoSettings, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Resolve settings: DB portion via with_db
    let id_clone = id;
    let db_settings = state.with_db(move |db| db.get_repo_settings(&id_clone)).await
        .unwrap_or_else(|_| RepoSettings::default());

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let cj = fury_json::load_fury_json(&repo_path).unwrap_or(None);
    Ok(fury_json::merge_settings(&db_settings, cj.as_ref()))
}

#[tauri::command]
#[specta::specta]
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

    // Persist to DB via with_db (if DB not available, silently skip)
    let _ = state.with_db(move |db| {
        db.upsert_repo_settings(&id, &settings)?;
        Ok(())
    }).await;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;
    use crate::test_helpers::*;
    use std::sync::Arc;

    fn setup_state_with_repo() -> (AppState, Uuid) {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);
        (state, repo_id)
    }

    fn setup_state_with_repo_and_db() -> (AppState, Uuid) {
        let state = AppState::new();
        let db = test_db();
        let repo = test_repo();
        let repo_id = repo.id;
        db.insert_repository(&repo).unwrap();
        state.repositories.write().unwrap().insert(repo_id, repo);
        *state.db.lock().unwrap() = Some(db);
        (state, repo_id)
    }

    // --- get_script_body tests ---

    #[test]
    fn test_get_script_body_setup() {
        let settings = RepoSettings {
            setup_script: Some("npm install".to_string()),
            ..Default::default()
        };
        assert_eq!(
            get_script_body(&settings, &ScriptKind::Setup),
            Some("npm install".to_string())
        );
    }

    #[test]
    fn test_get_script_body_run() {
        let settings = RepoSettings {
            run_script: Some("npm start".to_string()),
            ..Default::default()
        };
        assert_eq!(
            get_script_body(&settings, &ScriptKind::Run),
            Some("npm start".to_string())
        );
    }

    #[test]
    fn test_get_script_body_archive() {
        let settings = RepoSettings {
            archive_script: Some("npm run build".to_string()),
            ..Default::default()
        };
        assert_eq!(
            get_script_body(&settings, &ScriptKind::Archive),
            Some("npm run build".to_string())
        );
    }

    #[test]
    fn test_get_script_body_none() {
        let settings = RepoSettings::default();
        assert!(get_script_body(&settings, &ScriptKind::Setup).is_none());
        assert!(get_script_body(&settings, &ScriptKind::Run).is_none());
        assert!(get_script_body(&settings, &ScriptKind::Archive).is_none());
    }

    // --- key generation tests ---

    #[test]
    fn test_workspace_script_key() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            workspace_script_key(&id, &ScriptKind::Run),
            "550e8400-e29b-41d4-a716-446655440000:run"
        );
        assert_eq!(
            workspace_script_key(&id, &ScriptKind::Setup),
            "550e8400-e29b-41d4-a716-446655440000:setup"
        );
        assert_eq!(
            workspace_script_key(&id, &ScriptKind::Archive),
            "550e8400-e29b-41d4-a716-446655440000:archive"
        );
    }

    #[test]
    fn test_repo_script_key() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            repo_script_key(&id, &ScriptKind::Run),
            "repo:550e8400-e29b-41d4-a716-446655440000:run"
        );
    }

    // --- script_exit_event tests ---

    #[test]
    fn test_script_exit_event_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            script_exit_event(&ScriptKind::Run, &id),
            "script-exit:run:550e8400-e29b-41d4-a716-446655440000"
        );
        assert_eq!(
            script_exit_event(&ScriptKind::Setup, &id),
            "script-exit:setup:550e8400-e29b-41d4-a716-446655440000"
        );
    }

    // --- kill_script_by_key tests ---

    #[test]
    fn test_kill_script_by_key_found() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        // Use PID 999999 which almost certainly doesn't exist, but that's fine
        // since kill_process_group swallows errors
        pids.lock().unwrap().insert("ws:run".to_string(), 999999);
        let killed = kill_script_by_key(&pids, "ws:run");
        assert!(killed);
        assert!(pids.lock().unwrap().is_empty());
    }

    #[test]
    fn test_kill_script_by_key_not_found() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        let killed = kill_script_by_key(&pids, "ws:run");
        assert!(!killed);
    }

    // --- store_pid tests ---

    #[test]
    fn test_store_pid_some() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        store_pid(&pids, "key".to_string(), Some(42));
        assert_eq!(pids.lock().unwrap().get("key"), Some(&42));
    }

    #[test]
    fn test_store_pid_none() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        store_pid(&pids, "key".to_string(), None);
        assert!(pids.lock().unwrap().is_empty());
    }

    // --- kill_previous_if_nonconcurrent tests ---

    #[test]
    fn test_kill_previous_nonconcurrent_run() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        pids.lock().unwrap().insert("ws:run".to_string(), 999999);
        let settings = RepoSettings {
            run_script_mode: RunScriptMode::Nonconcurrent,
            ..Default::default()
        };
        kill_previous_if_nonconcurrent(&settings, &ScriptKind::Run, "ws:run", &pids);
        assert!(pids.lock().unwrap().is_empty());
    }

    #[test]
    fn test_kill_previous_concurrent_no_kill() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        pids.lock().unwrap().insert("ws:run".to_string(), 999999);
        let settings = RepoSettings {
            run_script_mode: RunScriptMode::Concurrent,
            ..Default::default()
        };
        kill_previous_if_nonconcurrent(&settings, &ScriptKind::Run, "ws:run", &pids);
        // Should NOT have killed it
        assert_eq!(pids.lock().unwrap().len(), 1);
    }

    #[test]
    fn test_kill_previous_setup_kind_no_kill() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        pids.lock().unwrap().insert("ws:setup".to_string(), 999999);
        let settings = RepoSettings {
            run_script_mode: RunScriptMode::Nonconcurrent,
            ..Default::default()
        };
        // Only Run kind triggers nonconcurrent kill
        kill_previous_if_nonconcurrent(&settings, &ScriptKind::Setup, "ws:setup", &pids);
        assert_eq!(pids.lock().unwrap().len(), 1);
    }

    // --- resolve_settings tests ---

    #[test]
    fn test_resolve_settings_default_when_no_db() {
        let (state, repo_id) = setup_state_with_repo();
        let settings = resolve_settings(&state, &repo_id).unwrap();
        assert!(settings.setup_script.is_none());
        assert!(settings.run_script.is_none());
    }

    #[test]
    fn test_resolve_settings_with_db() {
        let (state, repo_id) = setup_state_with_repo_and_db();

        // Save some settings to DB
        {
            let db = state.db.lock().unwrap();
            let settings = RepoSettings {
                setup_script: Some("npm install".to_string()),
                run_script: Some("npm start".to_string()),
                ..Default::default()
            };
            db.as_ref().unwrap().upsert_repo_settings(&repo_id, &settings).unwrap();
        }

        let result = resolve_settings(&state, &repo_id).unwrap();
        assert_eq!(result.setup_script.as_deref(), Some("npm install"));
        assert_eq!(result.run_script.as_deref(), Some("npm start"));
    }

    #[test]
    fn test_resolve_settings_repo_not_found() {
        let state = AppState::new();
        let missing_id = Uuid::new_v4();
        let result = resolve_settings(&state, &missing_id);
        assert!(result.is_err());
    }

    // --- get_db_settings tests ---

    #[test]
    fn test_get_db_settings_no_db() {
        let state = AppState::new();
        let settings = get_db_settings(&state, &Uuid::new_v4()).unwrap();
        assert!(settings.setup_script.is_none());
    }

    #[test]
    fn test_get_db_settings_with_db() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let saved = RepoSettings {
            setup_script: Some("make build".to_string()),
            ..Default::default()
        };
        {
            let db = state.db.lock().unwrap();
            db.as_ref().unwrap().upsert_repo_settings(&repo_id, &saved).unwrap();
        }
        let result = get_db_settings(&state, &repo_id).unwrap();
        assert_eq!(result.setup_script.as_deref(), Some("make build"));
    }

    // --- update_repo_settings_inner tests ---

    #[test]
    fn test_update_repo_settings_inner_success() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let settings = RepoSettings {
            run_script: Some("cargo run".to_string()),
            ..Default::default()
        };
        update_repo_settings_inner(&state, &repo_id, &settings).unwrap();

        let db = state.db.lock().unwrap();
        let loaded = db.as_ref().unwrap().get_repo_settings(&repo_id).unwrap();
        assert_eq!(loaded.run_script.as_deref(), Some("cargo run"));
    }

    #[test]
    fn test_update_repo_settings_inner_repo_not_found() {
        let state = AppState::new();
        *state.db.lock().unwrap() = Some(test_db());
        let missing = Uuid::new_v4();
        let result = update_repo_settings_inner(&state, &missing, &RepoSettings::default());
        assert!(result.is_err());
    }

    #[test]
    fn test_update_repo_settings_inner_no_db() {
        let (state, repo_id) = setup_state_with_repo();
        // No DB set - should succeed without error (no-op)
        let result = update_repo_settings_inner(&state, &repo_id, &RepoSettings::default());
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests (using mock_app_with_state)
    // -----------------------------------------------------------------------

    fn setup_script_state() -> (tauri::App<tauri::test::MockRuntime>, Uuid) {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state = app.state::<crate::state::AppState>();
        let repo_id = Uuid::new_v4();
        {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut repo = test_repo();
            repo.id = repo_id;
            db.insert_repository(&repo).unwrap();
            state.repositories.write().unwrap().insert(repo_id, repo);
        }
        (app, repo_id)
    }

    #[tokio::test]
    async fn test_cmd_get_repo_settings() {
        use tauri::Manager;
        let (app, repo_id) = setup_script_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_repo_settings(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        // Default settings
        let settings = result.unwrap();
        assert!(settings.setup_script.is_none());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_settings_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_repo_settings(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_update_repo_settings() {
        use tauri::Manager;
        let (app, repo_id) = setup_script_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let settings = RepoSettings {
            setup_script: Some("echo hello".to_string()),
            ..Default::default()
        };
        let result = update_repo_settings(state, repo_id.to_string(), settings).await;
        assert!(result.is_ok());

        // Verify persisted
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let loaded = get_repo_settings(state2, repo_id.to_string()).await.unwrap();
        assert_eq!(loaded.setup_script.as_deref(), Some("echo hello"));
    }

    #[tokio::test]
    async fn test_cmd_update_repo_settings_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_repo_settings(
            state,
            Uuid::new_v4().to_string(),
            RepoSettings::default(),
        )
        .await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Additional command wrapper tests
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Additional command wrapper tests (State-only commands)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_stop_script_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_script(
            state,
            "bad-id".to_string(),
            "run".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_script_invalid_kind() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_script(
            state,
            Uuid::new_v4().to_string(),
            "invalid_kind".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_script_no_running_process() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_script(
            state,
            Uuid::new_v4().to_string(),
            "run".to_string(),
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_stop_repo_script_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_repo_script(
            state,
            "bad-id".to_string(),
            "run".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_repo_script_invalid_kind() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_repo_script(
            state,
            Uuid::new_v4().to_string(),
            "invalid_kind".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_repo_script_no_running_process() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_repo_script(
            state,
            Uuid::new_v4().to_string(),
            "run".to_string(),
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_update_repo_settings_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = update_repo_settings(
            state,
            "bad-id".to_string(),
            RepoSettings::default(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_settings_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_repo_settings(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Inner function tests covering run_script/run_repo_script error paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_get_script_body_missing_setup() {
        let settings = RepoSettings {
            run_script: Some("npm start".to_string()),
            ..Default::default()
        };
        assert!(get_script_body(&settings, &ScriptKind::Setup).is_none());
    }

    #[test]
    fn test_get_script_body_missing_archive() {
        let settings = RepoSettings {
            setup_script: Some("npm install".to_string()),
            run_script: Some("npm start".to_string()),
            ..Default::default()
        };
        assert!(get_script_body(&settings, &ScriptKind::Archive).is_none());
    }

    #[test]
    fn test_resolve_settings_missing_workspace_for_run_script() {
        // run_script needs workspace -> repo, test that resolve_settings fails
        // when repo doesn't exist
        let state = AppState::new();
        let result = resolve_settings(&state, &Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_kill_previous_nonconcurrent_archive_no_kill() {
        // Archive kind should NOT trigger nonconcurrent kill
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        pids.lock().unwrap().insert("ws:archive".to_string(), 999999);
        let settings = RepoSettings {
            run_script_mode: RunScriptMode::Nonconcurrent,
            ..Default::default()
        };
        kill_previous_if_nonconcurrent(&settings, &ScriptKind::Archive, "ws:archive", &pids);
        assert_eq!(pids.lock().unwrap().len(), 1);
    }

    #[test]
    fn test_store_pid_overwrites_existing() {
        let pids = Arc::new(std::sync::Mutex::new(HashMap::new()));
        store_pid(&pids, "key".to_string(), Some(42));
        store_pid(&pids, "key".to_string(), Some(99));
        assert_eq!(pids.lock().unwrap().get("key"), Some(&99));
    }

    #[test]
    fn test_update_repo_settings_inner_no_db_success() {
        let (state, repo_id) = setup_state_with_repo();
        let settings = RepoSettings {
            run_script: Some("npm start".to_string()),
            ..Default::default()
        };
        // No DB — should succeed (no-op)
        let result = update_repo_settings_inner(&state, &repo_id, &settings);
        assert!(result.is_ok());
    }

    #[test]
    fn test_script_exit_event_archive() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            script_exit_event(&ScriptKind::Archive, &id),
            "script-exit:archive:550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn test_repo_script_key_setup() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            repo_script_key(&id, &ScriptKind::Setup),
            "repo:550e8400-e29b-41d4-a716-446655440000:setup"
        );
    }

    #[test]
    fn test_repo_script_key_archive() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            repo_script_key(&id, &ScriptKind::Archive),
            "repo:550e8400-e29b-41d4-a716-446655440000:archive"
        );
    }

    // -----------------------------------------------------------------------
    // Additional async command wrapper tests — run_script / run_repo_script error paths
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_stop_script_with_stored_pid() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();
        let ws_id = Uuid::new_v4();

        // Insert a fake PID
        {
            let key = workspace_script_key(&ws_id, &ScriptKind::Run);
            let mut pids = state_ref.script_pids.lock().unwrap();
            pids.insert(key, 999999);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_script(state, ws_id.to_string(), "run".to_string()).await;
        assert!(result.is_ok());

        // Verify PID was removed
        let key = workspace_script_key(&ws_id, &ScriptKind::Run);
        let pids = state_ref.script_pids.lock().unwrap();
        assert!(!pids.contains_key(&key));
    }

    #[tokio::test]
    async fn test_cmd_stop_repo_script_with_stored_pid() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();
        let repo_id = Uuid::new_v4();

        // Insert a fake PID
        {
            let key = repo_script_key(&repo_id, &ScriptKind::Run);
            let mut pids = state_ref.script_pids.lock().unwrap();
            pids.insert(key, 999999);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_repo_script(state, repo_id.to_string(), "run".to_string()).await;
        assert!(result.is_ok());

        // Verify PID was removed
        let key = repo_script_key(&repo_id, &ScriptKind::Run);
        let pids = state_ref.script_pids.lock().unwrap();
        assert!(!pids.contains_key(&key));
    }

    #[tokio::test]
    async fn test_cmd_update_repo_settings_roundtrip_all_fields() {
        use tauri::Manager;
        let (app, repo_id) = setup_script_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let settings = RepoSettings {
            setup_script: Some("npm install".to_string()),
            run_script: Some("npm start".to_string()),
            archive_script: Some("npm run clean".to_string()),
            run_script_mode: RunScriptMode::Nonconcurrent,
            ..Default::default()
        };
        let result = update_repo_settings(state, repo_id.to_string(), settings).await;
        assert!(result.is_ok());

        // Read back and verify all fields
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let loaded = get_repo_settings(state2, repo_id.to_string()).await.unwrap();
        assert_eq!(loaded.setup_script.as_deref(), Some("npm install"));
        assert_eq!(loaded.run_script.as_deref(), Some("npm start"));
        assert_eq!(loaded.archive_script.as_deref(), Some("npm run clean"));
    }

    #[tokio::test]
    async fn test_cmd_stop_script_all_kinds() {
        use tauri::Manager;
        let app = mock_app_with_state();

        // Test all valid script kinds
        for kind_str in &["run", "setup", "archive"] {
            let state: tauri::State<'_, crate::state::AppState> = app.state();
            let result = stop_script(
                state,
                Uuid::new_v4().to_string(),
                kind_str.to_string(),
            )
            .await;
            assert!(result.is_ok());
        }
    }

    #[tokio::test]
    async fn test_cmd_stop_repo_script_all_kinds() {
        use tauri::Manager;
        let app = mock_app_with_state();

        for kind_str in &["run", "setup", "archive"] {
            let state: tauri::State<'_, crate::state::AppState> = app.state();
            let result = stop_repo_script(
                state,
                Uuid::new_v4().to_string(),
                kind_str.to_string(),
            )
            .await;
            assert!(result.is_ok());
        }
    }
}
