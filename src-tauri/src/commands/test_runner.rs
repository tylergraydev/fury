use std::path::PathBuf;
use std::sync::Arc;

use crate::error::AppError;
use crate::models::test_runner::{TestRunEvent, TestRunRecord, TestRunnerConfig};
use crate::services::{claude_process, diff_watcher, test_runner};
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::services::script_runner::ScriptExitEvent;

/// Merge a DB config with auto-detected defaults: DB overrides take precedence.
pub(crate) fn merge_config_with_detected(
    db_config: &TestRunnerConfig,
    detected: &mut TestRunnerConfig,
) {
    if db_config.test_command.is_some() {
        detected.test_command = db_config.test_command.clone();
    }
    if db_config.test_file_command.is_some() {
        detected.test_file_command = db_config.test_file_command.clone();
    }
    if db_config.working_dir.is_some() {
        detected.working_dir = db_config.working_dir.clone();
    }
}

/// Get the test runner config from DB, falling back to defaults.
pub(crate) fn get_db_test_config(state: &AppState, repo_id: &Uuid) -> Result<TestRunnerConfig, AppError> {
    let db = state.db.lock().unwrap();
    match db.as_ref() {
        Some(db) => db.get_test_runner_config(repo_id),
        None => Ok(TestRunnerConfig::default()),
    }
}

/// Resolve the effective test runner config: try DB first, auto-detect as fallback,
/// merge DB overrides with detected defaults.
#[allow(dead_code)]
pub(crate) fn resolve_test_config(state: &AppState, repo_id: &Uuid) -> Result<TestRunnerConfig, AppError> {
    let db_config = get_db_test_config(state, repo_id)?;

    // If DB has a config with a framework, use it
    if db_config.framework.is_some() {
        return Ok(db_config);
    }

    // Otherwise auto-detect
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(repo_id).ok_or(AppError::RepoNotFound(*repo_id))?;
        repo.path.clone()
    };

    match test_runner::detect_framework(&repo_path) {
        Some(fw) => {
            let mut config = test_runner::default_commands(&fw);
            merge_config_with_detected(&db_config, &mut config);
            Ok(config)
        }
        None => Ok(db_config),
    }
}

/// Resolve a config suitable for running tests: needs both framework and test_command.
/// Falls back to auto-detection if DB config is incomplete.
pub(crate) fn resolve_runnable_test_config(state: &AppState, repo_id: &Uuid) -> Result<TestRunnerConfig, AppError> {
    let db_config = get_db_test_config(state, repo_id)?;

    if db_config.framework.is_some() && db_config.test_command.is_some() {
        return Ok(db_config);
    }

    // Auto-detect
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        repos
            .get(repo_id)
            .ok_or(AppError::RepoNotFound(*repo_id))?
            .path
            .clone()
    };
    match test_runner::detect_framework(&repo_path) {
        Some(fw) => {
            let mut detected = test_runner::default_commands(&fw);
            merge_config_with_detected(&db_config, &mut detected);
            Ok(detected)
        }
        None => Ok(db_config),
    }
}

/// Resolve the working directory and repo ID based on context type.
pub(crate) fn resolve_context(
    state: &AppState,
    ctx_id: &Uuid,
    context_type: &str,
) -> Result<(PathBuf, Uuid), AppError> {
    if context_type == "workspace" {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(ctx_id)
            .ok_or(AppError::WorkspaceNotFound(*ctx_id))?;
        Ok((ws.worktree_path.clone(), ws.repo_id))
    } else {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(ctx_id).ok_or(AppError::RepoNotFound(*ctx_id))?;
        Ok((repo.path.clone(), *ctx_id))
    }
}

/// Build the effective test command from config and optional file filter.
pub(crate) fn build_test_command(config: &TestRunnerConfig, file_filter: Option<&str>) -> Option<String> {
    if let Some(filter) = file_filter {
        config
            .test_file_command
            .as_ref()
            .map(|cmd| cmd.replace("{file}", filter))
            .or_else(|| config.test_command.clone())
    } else {
        config.test_command.clone()
    }
}

/// Resolve the effective working directory by joining an optional sub-path.
pub(crate) fn resolve_effective_dir(working_dir: PathBuf, sub_dir: Option<&str>) -> PathBuf {
    if let Some(wd) = sub_dir {
        working_dir.join(wd)
    } else {
        working_dir
    }
}

/// Build the test process key for PID tracking.
pub(crate) fn test_process_key(ctx_id: &Uuid) -> String {
    format!("test:{}", ctx_id)
}

/// Build the test exit event name.
pub(crate) fn test_exit_event(ctx_id: &Uuid) -> String {
    format!("test-exit:{}", ctx_id)
}

/// Build the test runner event name.
pub(crate) fn test_runner_event(ctx_id: &Uuid) -> String {
    format!("test-runner:{}", ctx_id)
}

/// Build the test watch event name.
pub(crate) fn test_watch_event(context_id: &str) -> String {
    format!("test-watch:{}", context_id)
}

/// List test history from DB, with a default limit of 20.
pub(crate) fn list_test_history_inner(
    state: &AppState,
    repo_id: &Uuid,
    limit: Option<usize>,
) -> Result<Vec<TestRunRecord>, AppError> {
    let db = state.db.lock().unwrap();
    match db.as_ref() {
        Some(db) => db.list_test_runs(repo_id, limit.unwrap_or(20)),
        None => Ok(vec![]),
    }
}

/// Save test runner config to DB after verifying repo exists.
pub(crate) fn save_test_config_inner(
    state: &AppState,
    repo_id: &Uuid,
    config: &TestRunnerConfig,
) -> Result<(), AppError> {
    {
        let repos = state.repositories.read().unwrap();
        if !repos.contains_key(repo_id) {
            return Err(AppError::RepoNotFound(*repo_id));
        }
    }

    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.save_test_runner_config(repo_id, config)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn detect_test_framework(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<TestRunnerConfig, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        match test_runner::detect_framework(&repo_path) {
            Some(fw) => Ok(test_runner::default_commands(&fw)),
            None => Ok(TestRunnerConfig::default()),
        }
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_test_runner_config(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<TestRunnerConfig, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Read DB config before spawn_blocking (db is not Arc)
    let db_config = get_db_test_config(&state, &id)?;

    // If DB has a config with a framework, use it
    if db_config.framework.is_some() {
        return Ok(db_config);
    }

    // Otherwise auto-detect
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        match test_runner::detect_framework(&repo_path) {
            Some(fw) => {
                let mut config = test_runner::default_commands(&fw);
                merge_config_with_detected(&db_config, &mut config);
                Ok(config)
            }
            None => Ok(db_config),
        }
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn save_test_runner_config(
    state: State<'_, AppState>,
    repo_id: String,
    config: TestRunnerConfig,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    save_test_config_inner(&state, &id, &config)
}

#[tauri::command]
pub async fn run_tests(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
    file_filter: Option<String>,
) -> Result<(), AppError> {
    let ctx_id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Resolve working directory and repo ID based on context type
    let (working_dir, repo_id) = resolve_context(&state, &ctx_id, &context_type)?;

    // Get test runner config
    let config = resolve_runnable_test_config(&state, &repo_id)?;

    let framework = config
        .framework
        .clone()
        .unwrap_or(crate::models::test_runner::TestFramework::Custom);

    // Determine command
    let command = build_test_command(&config, file_filter.as_deref())
        .ok_or_else(|| AppError::ScriptError("No test command configured".to_string()))?;

    // Resolve effective working directory
    let effective_dir = resolve_effective_dir(working_dir, config.working_dir.as_deref());

    // Kill existing test process if running
    let process_key = test_process_key(&ctx_id);
    {
        let mut processes = state.test_processes.lock().unwrap();
        if let Some(pid) = processes.remove(&process_key) {
            let _ = crate::platform::kill_process_group(pid);
        }
    }

    // Build env vars
    let env_vars = if context_type == "workspace" {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?
            .clone();
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?
            .clone();
        let app_settings = state.settings.read().unwrap().clone();
        let repo_settings = crate::commands::script::resolve_settings(&state, &repo_id).ok();
        let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
        claude_process::build_env_vars(&ws, &repo, &app_settings, provider_override)
    } else {
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&ctx_id)
            .ok_or(AppError::RepoNotFound(ctx_id))?
            .clone();
        let app_settings = state.settings.read().unwrap().clone();
        let repo_settings = crate::commands::script::resolve_settings(&state, &ctx_id).ok();
        let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
        claude_process::build_repo_env_vars(&repo, &app_settings, provider_override)
    };

    // Spawn test process
    let db_ref = Arc::clone(&state.db);
    let mut child = test_runner::spawn_test_run(
        ctx_id,
        &command,
        &effective_dir,
        &framework,
        env_vars,
        app.clone(),
        db_ref,
        repo_id,
    )
    .await?;

    // Store PID so stop_tests can kill the process
    let pid = child.id();
    if let Some(pid) = pid {
        let mut processes = state.test_processes.lock().unwrap();
        processes.insert(process_key.clone(), pid);
    }

    // Background task to wait for exit, then clean up and emit event
    let processes_ref = Arc::clone(&state.test_processes);
    let app_clone = app.clone();
    let exit_event = test_exit_event(&ctx_id);
    tokio::spawn(async move {
        let exit_status = child.wait().await.ok();

        // Remove PID from map now that process has exited
        {
            let mut processes = processes_ref.lock().unwrap();
            processes.remove(&process_key);
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
pub async fn stop_tests(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<(), AppError> {
    let ctx_id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let test_processes = Arc::clone(&state.test_processes);
    tokio::task::spawn_blocking(move || {
        let process_key = test_process_key(&ctx_id);
        let mut processes = test_processes.lock().unwrap();
        if let Some(pid) = processes.remove(&process_key) {
            let _ = crate::platform::kill_process_group(pid);
        }

        // Also emit an error event to signal the UI
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn start_test_watch(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
) -> Result<(), AppError> {
    let ctx_id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Resolve working directory
    let watch_path = if context_type == "workspace" {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?;
        ws.worktree_path.clone()
    } else {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&ctx_id).ok_or(AppError::RepoNotFound(ctx_id))?;
        repo.path.clone()
    };

    // Stop any existing watcher first
    {
        let mut watchers = state.test_watchers.lock().unwrap();
        if let Some(handle) = watchers.remove(&context_id) {
            handle.stop();
        }
    }

    // Start a new file watcher emitting on test-watch:{context_id}
    let handle = diff_watcher::start_diff_watcher(
        watch_path,
        app,
        test_watch_event(&context_id),
    )?;

    let mut watchers = state.test_watchers.lock().unwrap();
    watchers.insert(context_id, handle);

    Ok(())
}

#[tauri::command]
pub async fn stop_test_watch(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<(), AppError> {
    let mut watchers = state.test_watchers.lock().unwrap();
    if let Some(handle) = watchers.remove(&context_id) {
        handle.stop();
    }
    Ok(())
}

#[tauri::command]
pub async fn list_test_history(
    state: State<'_, AppState>,
    repo_id: String,
    limit: Option<usize>,
) -> Result<Vec<TestRunRecord>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    list_test_history_inner(&state, &id, limit)
}

#[tauri::command]
pub async fn run_coverage(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
) -> Result<(), AppError> {
    let ctx_id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Resolve working directory and repo ID
    let (working_dir, repo_id) = resolve_context(&state, &ctx_id, &context_type)?;

    // Get coverage command from config or use default
    let (coverage_cmd, framework) = {
        let db = state.db.lock().unwrap();
        let db_config = match db.as_ref() {
            Some(db) => db.get_test_runner_config(&repo_id)?,
            None => TestRunnerConfig::default(),
        };
        drop(db);

        let fw = db_config
            .framework
            .clone()
            .unwrap_or_else(|| {
                let repos = state.repositories.read().unwrap();
                repos
                    .get(&repo_id)
                    .and_then(|r| test_runner::detect_framework(&r.path))
                    .unwrap_or(crate::models::test_runner::TestFramework::Custom)
            });

        let cmd = db_config
            .coverage_command
            .or_else(|| test_runner::default_coverage_command(&fw));

        (cmd, fw)
    };

    let command = coverage_cmd.ok_or_else(|| {
        AppError::ScriptError("No coverage command configured for this framework".to_string())
    })?;

    // Resolve effective working directory
    let effective_dir = {
        let db = state.db.lock().unwrap();
        let wd = db
            .as_ref()
            .and_then(|d| d.get_test_runner_config(&repo_id).ok())
            .and_then(|c| c.working_dir);
        if let Some(ref wd) = wd {
            working_dir.join(wd)
        } else {
            working_dir.clone()
        }
    };

    // Build env vars
    let env_vars = if context_type == "workspace" {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?
            .clone();
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?
            .clone();
        let app_settings = state.settings.read().unwrap().clone();
        let repo_settings = crate::commands::script::resolve_settings(&state, &repo_id).ok();
        let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
        claude_process::build_env_vars(&ws, &repo, &app_settings, provider_override)
    } else {
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&ctx_id)
            .ok_or(AppError::RepoNotFound(ctx_id))?
            .clone();
        let app_settings = state.settings.read().unwrap().clone();
        let repo_settings = crate::commands::script::resolve_settings(&state, &ctx_id).ok();
        let provider_override = repo_settings.as_ref().and_then(|s| s.provider_override.as_ref());
        claude_process::build_repo_env_vars(&repo, &app_settings, provider_override)
    };

    let event_name = test_runner_event(&ctx_id);
    let framework_clone = framework.clone();

    // Spawn coverage process
    let shell = crate::platform::default_shell();
    let flag = crate::platform::shell_exec_flag();

    let output = tokio::process::Command::new(shell)
        .arg(flag)
        .arg(&command)
        .current_dir(&effective_dir)
        .envs(&env_vars)
        .output()
        .await
        .map_err(|e| AppError::ScriptError(format!("Failed to run coverage: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // Try to parse coverage output
    let report = match framework_clone {
        crate::models::test_runner::TestFramework::Vitest
        | crate::models::test_runner::TestFramework::Jest => {
            // Try reading coverage-final.json first
            let coverage_path = effective_dir.join("coverage/coverage-final.json");
            if let Ok(json) = std::fs::read_to_string(&coverage_path) {
                test_runner::parse_istanbul_coverage(&json)
            } else {
                // Fall back to parsing stdout
                test_runner::parse_istanbul_coverage(&stdout)
            }
        }
        crate::models::test_runner::TestFramework::Pytest => {
            test_runner::parse_pytest_cov(&stdout)
        }
        _ => {
            // Try Istanbul format first, then pytest-cov format
            test_runner::parse_istanbul_coverage(&stdout)
                .or_else(|_| test_runner::parse_pytest_cov(&stdout))
        }
    };

    match report {
        Ok(report) => {
            let _ = app.emit(&event_name, &TestRunEvent::CoverageResult { report });
        }
        Err(e) => {
            let _ = app.emit(
                &event_name,
                &TestRunEvent::Error {
                    message: format!("Failed to parse coverage: {}", e),
                },
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::test_runner::TestFramework;
    use crate::state::AppState;
    use crate::test_helpers::*;

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

    fn setup_state_with_workspace_and_repo() -> (AppState, Uuid, Uuid) {
        let state = AppState::new();
        let repo = test_repo();
        let repo_id = repo.id;
        state.repositories.write().unwrap().insert(repo_id, repo);
        let ws = test_workspace(repo_id);
        let ws_id = ws.id;
        state.workspaces.write().unwrap().insert(ws_id, ws);
        (state, ws_id, repo_id)
    }

    // --- merge_config_with_detected tests ---

    #[test]
    fn test_merge_config_no_overrides() {
        let db_config = TestRunnerConfig::default();
        let mut detected = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest --run".to_string()),
            test_file_command: Some("npx vitest --run {file}".to_string()),
            working_dir: None,
            coverage_command: None,
        };
        merge_config_with_detected(&db_config, &mut detected);
        assert_eq!(detected.test_command.as_deref(), Some("npx vitest --run"));
        assert_eq!(detected.test_file_command.as_deref(), Some("npx vitest --run {file}"));
    }

    #[test]
    fn test_merge_config_db_overrides_test_command() {
        let db_config = TestRunnerConfig {
            test_command: Some("npm test".to_string()),
            ..Default::default()
        };
        let mut detected = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest --run".to_string()),
            test_file_command: Some("npx vitest --run {file}".to_string()),
            working_dir: None,
            coverage_command: None,
        };
        merge_config_with_detected(&db_config, &mut detected);
        assert_eq!(detected.test_command.as_deref(), Some("npm test"));
        // file command stays as detected
        assert_eq!(detected.test_file_command.as_deref(), Some("npx vitest --run {file}"));
    }

    #[test]
    fn test_merge_config_db_overrides_all() {
        let db_config = TestRunnerConfig {
            test_command: Some("custom test".to_string()),
            test_file_command: Some("custom test {file}".to_string()),
            working_dir: Some("packages/core".to_string()),
            ..Default::default()
        };
        let mut detected = TestRunnerConfig {
            framework: Some(TestFramework::Jest),
            test_command: Some("npx jest".to_string()),
            test_file_command: Some("npx jest {file}".to_string()),
            working_dir: None,
            coverage_command: None,
        };
        merge_config_with_detected(&db_config, &mut detected);
        assert_eq!(detected.test_command.as_deref(), Some("custom test"));
        assert_eq!(detected.test_file_command.as_deref(), Some("custom test {file}"));
        assert_eq!(detected.working_dir.as_deref(), Some("packages/core"));
    }

    // --- get_db_test_config tests ---

    #[test]
    fn test_get_db_test_config_no_db() {
        let state = AppState::new();
        let config = get_db_test_config(&state, &Uuid::new_v4()).unwrap();
        assert!(config.framework.is_none());
        assert!(config.test_command.is_none());
    }

    #[test]
    fn test_get_db_test_config_with_db() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let config = TestRunnerConfig {
            framework: Some(TestFramework::Pytest),
            test_command: Some("pytest".to_string()),
            ..Default::default()
        };
        {
            let db = state.db.lock().unwrap();
            db.as_ref().unwrap().save_test_runner_config(&repo_id, &config).unwrap();
        }
        let result = get_db_test_config(&state, &repo_id).unwrap();
        assert_eq!(result.framework, Some(TestFramework::Pytest));
        assert_eq!(result.test_command.as_deref(), Some("pytest"));
    }

    // --- resolve_context tests ---

    #[test]
    fn test_resolve_context_workspace() {
        let (state, ws_id, repo_id) = setup_state_with_workspace_and_repo();
        let (path, resolved_repo_id) = resolve_context(&state, &ws_id, "workspace").unwrap();
        assert_eq!(path, PathBuf::from("/tmp/test-worktree"));
        assert_eq!(resolved_repo_id, repo_id);
    }

    #[test]
    fn test_resolve_context_repo() {
        let (state, repo_id) = setup_state_with_repo();
        let (path, resolved_id) = resolve_context(&state, &repo_id, "repo").unwrap();
        assert_eq!(path, PathBuf::from("/tmp/test-repo"));
        assert_eq!(resolved_id, repo_id);
    }

    #[test]
    fn test_resolve_context_workspace_not_found() {
        let state = AppState::new();
        let missing = Uuid::new_v4();
        let result = resolve_context(&state, &missing, "workspace");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_context_repo_not_found() {
        let state = AppState::new();
        let missing = Uuid::new_v4();
        let result = resolve_context(&state, &missing, "repo");
        assert!(result.is_err());
    }

    // --- build_test_command tests ---

    #[test]
    fn test_build_test_command_no_filter() {
        let config = TestRunnerConfig {
            test_command: Some("npm test".to_string()),
            test_file_command: Some("npm test -- {file}".to_string()),
            ..Default::default()
        };
        let cmd = build_test_command(&config, None);
        assert_eq!(cmd, Some("npm test".to_string()));
    }

    #[test]
    fn test_build_test_command_with_filter() {
        let config = TestRunnerConfig {
            test_command: Some("npm test".to_string()),
            test_file_command: Some("npm test -- {file}".to_string()),
            ..Default::default()
        };
        let cmd = build_test_command(&config, Some("src/foo.test.ts"));
        assert_eq!(cmd, Some("npm test -- src/foo.test.ts".to_string()));
    }

    #[test]
    fn test_build_test_command_with_filter_no_file_command() {
        let config = TestRunnerConfig {
            test_command: Some("npm test".to_string()),
            test_file_command: None,
            ..Default::default()
        };
        let cmd = build_test_command(&config, Some("src/foo.test.ts"));
        // Falls back to test_command
        assert_eq!(cmd, Some("npm test".to_string()));
    }

    #[test]
    fn test_build_test_command_no_commands() {
        let config = TestRunnerConfig::default();
        let cmd = build_test_command(&config, None);
        assert!(cmd.is_none());
    }

    // --- resolve_effective_dir tests ---

    #[test]
    fn test_resolve_effective_dir_no_subdir() {
        let base = PathBuf::from("/project");
        let result = resolve_effective_dir(base.clone(), None);
        assert_eq!(result, base);
    }

    #[test]
    fn test_resolve_effective_dir_with_subdir() {
        let base = PathBuf::from("/project");
        let result = resolve_effective_dir(base, Some("packages/core"));
        assert_eq!(result, PathBuf::from("/project/packages/core"));
    }

    // --- key/event format tests ---

    #[test]
    fn test_test_process_key_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(test_process_key(&id), "test:550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn test_test_exit_event_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(test_exit_event(&id), "test-exit:550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn test_test_runner_event_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(test_runner_event(&id), "test-runner:550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn test_test_watch_event_format() {
        assert_eq!(test_watch_event("abc-123"), "test-watch:abc-123");
    }

    // --- list_test_history_inner tests ---

    #[test]
    fn test_list_test_history_no_db() {
        let state = AppState::new();
        let result = list_test_history_inner(&state, &Uuid::new_v4(), None).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_test_history_with_db_empty() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let result = list_test_history_inner(&state, &repo_id, None).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_test_history_custom_limit() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let result = list_test_history_inner(&state, &repo_id, Some(5)).unwrap();
        assert!(result.is_empty()); // No records, but limit was respected
    }

    // --- save_test_config_inner tests ---

    #[test]
    fn test_save_test_config_inner_success() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let config = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest --run".to_string()),
            ..Default::default()
        };
        save_test_config_inner(&state, &repo_id, &config).unwrap();

        let db = state.db.lock().unwrap();
        let loaded = db.as_ref().unwrap().get_test_runner_config(&repo_id).unwrap();
        assert_eq!(loaded.framework, Some(TestFramework::Vitest));
        assert_eq!(loaded.test_command.as_deref(), Some("npx vitest --run"));
    }

    #[test]
    fn test_save_test_config_inner_repo_not_found() {
        let state = AppState::new();
        *state.db.lock().unwrap() = Some(test_db());
        let missing = Uuid::new_v4();
        let result = save_test_config_inner(&state, &missing, &TestRunnerConfig::default());
        assert!(result.is_err());
    }

    #[test]
    fn test_save_test_config_inner_no_db() {
        let (state, repo_id) = setup_state_with_repo();
        // No DB - should succeed as no-op
        let result = save_test_config_inner(&state, &repo_id, &TestRunnerConfig::default());
        assert!(result.is_ok());
    }

    // --- resolve_test_config tests ---

    #[test]
    fn test_resolve_test_config_no_db_no_detection() {
        let (state, repo_id) = setup_state_with_repo();
        let config = resolve_test_config(&state, &repo_id).unwrap();
        assert!(config.framework.is_none());
    }

    #[test]
    fn test_resolve_test_config_db_has_framework() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let saved = TestRunnerConfig {
            framework: Some(TestFramework::Pytest),
            test_command: Some("pytest -v".to_string()),
            ..Default::default()
        };
        {
            let db = state.db.lock().unwrap();
            db.as_ref().unwrap().save_test_runner_config(&repo_id, &saved).unwrap();
        }
        let config = resolve_test_config(&state, &repo_id).unwrap();
        assert_eq!(config.framework, Some(TestFramework::Pytest));
        assert_eq!(config.test_command.as_deref(), Some("pytest -v"));
    }

    // --- resolve_runnable_test_config tests ---

    #[test]
    fn test_resolve_runnable_config_complete_db() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        let saved = TestRunnerConfig {
            framework: Some(TestFramework::Jest),
            test_command: Some("npx jest".to_string()),
            ..Default::default()
        };
        {
            let db = state.db.lock().unwrap();
            db.as_ref().unwrap().save_test_runner_config(&repo_id, &saved).unwrap();
        }
        let config = resolve_runnable_test_config(&state, &repo_id).unwrap();
        assert_eq!(config.framework, Some(TestFramework::Jest));
        assert_eq!(config.test_command.as_deref(), Some("npx jest"));
    }

    #[test]
    fn test_resolve_runnable_config_incomplete_db() {
        let (state, repo_id) = setup_state_with_repo_and_db();
        // Framework set but no test_command
        let saved = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: None,
            ..Default::default()
        };
        {
            let db = state.db.lock().unwrap();
            db.as_ref().unwrap().save_test_runner_config(&repo_id, &saved).unwrap();
        }
        // Should fall through to auto-detection (which won't find anything in /tmp/test-repo)
        let config = resolve_runnable_test_config(&state, &repo_id).unwrap();
        // Since auto-detect won't find anything, returns the db_config as-is
        assert_eq!(config.framework, Some(TestFramework::Vitest));
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests (using mock_app_with_state)
    // -----------------------------------------------------------------------

    fn setup_test_runner_state() -> (tauri::App<tauri::test::MockRuntime>, Uuid) {
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
    async fn test_cmd_get_test_runner_config() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_test_runner_config(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        // Default config with no framework
        let config = result.unwrap();
        assert!(config.framework.is_none());
    }

    #[tokio::test]
    async fn test_cmd_get_test_runner_config_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_test_runner_config(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_save_test_runner_config() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let config = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest --run".to_string()),
            ..Default::default()
        };
        let result = save_test_runner_config(state, repo_id.to_string(), config).await;
        assert!(result.is_ok());

        // Verify persisted
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let loaded = get_test_runner_config(state2, repo_id.to_string()).await.unwrap();
        assert_eq!(loaded.framework, Some(TestFramework::Vitest));
        assert_eq!(loaded.test_command.as_deref(), Some("npx vitest --run"));
    }

    #[tokio::test]
    async fn test_cmd_save_test_runner_config_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = save_test_runner_config(
            state,
            Uuid::new_v4().to_string(),
            TestRunnerConfig::default(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_list_test_history_empty() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_test_history(state, repo_id.to_string(), None).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_cmd_list_test_history_with_limit() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_test_history(state, repo_id.to_string(), Some(5)).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // -----------------------------------------------------------------------
    // Additional command wrapper tests
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Additional command wrapper tests (State-only commands)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_detect_test_framework_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_test_framework(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_detect_test_framework_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_test_framework(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_detect_test_framework_success() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_test_framework(state, repo_id.to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_stop_tests_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_tests(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_tests_no_running_process() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_tests(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_stop_test_watch_not_running() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_test_watch(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_list_test_history_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_test_history(state, "bad-id".to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_save_test_runner_config_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = save_test_runner_config(
            state,
            "bad-id".to_string(),
            TestRunnerConfig::default(),
        )
        .await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Tests for inner functions covering run_tests/run_coverage/start_test_watch error paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_context_missing_workspace() {
        let state = AppState::new();
        let missing_id = Uuid::new_v4();
        let result = resolve_context(&state, &missing_id, "workspace");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_context_missing_repo() {
        let state = AppState::new();
        let missing_id = Uuid::new_v4();
        let result = resolve_context(&state, &missing_id, "repo");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_runnable_config_repo_not_found() {
        let state = AppState::new();
        let missing_id = Uuid::new_v4();
        let result = resolve_runnable_test_config(&state, &missing_id);
        // No DB, no repo in state — tries auto-detect which needs repo path, so errors
        assert!(result.is_err());
    }

    #[test]
    fn test_build_test_command_no_test_command_with_filter() {
        let config = TestRunnerConfig {
            test_command: None,
            test_file_command: Some("npm test -- {file}".to_string()),
            ..Default::default()
        };
        // Has file_command but no test_command, and we provide a filter
        let cmd = build_test_command(&config, Some("test.ts"));
        assert_eq!(cmd, Some("npm test -- test.ts".to_string()));
    }

    #[test]
    fn test_resolve_test_config_repo_not_found() {
        let state = AppState::new();
        let missing_id = Uuid::new_v4();
        // No repo in state — tries auto-detect which needs repo path, so errors
        let result = resolve_test_config(&state, &missing_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_effective_dir_with_empty_subdir() {
        let base = PathBuf::from("/project");
        let result = resolve_effective_dir(base.clone(), Some(""));
        assert_eq!(result, PathBuf::from("/project/"));
    }

    #[test]
    fn test_test_watch_event_with_uuid() {
        let id = Uuid::new_v4();
        let event = test_watch_event(&id.to_string());
        assert!(event.starts_with("test-watch:"));
    }

    // -----------------------------------------------------------------------
    // Additional async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_detect_test_framework_with_real_repo() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();

        // Create a real temp git repo with a vitest config file
        let (_dir, path) = create_temp_git_repo();
        std::fs::write(
            path.join("vitest.config.ts"),
            r#"export default { test: {} }"#,
        )
        .unwrap();

        let repo_id = Uuid::new_v4();
        {
            let db_lock = state_ref.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut repo = test_repo();
            repo.id = repo_id;
            repo.path = path.clone();
            db.insert_repository(&repo).unwrap();
            state_ref.repositories.write().unwrap().insert(repo_id, repo);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = detect_test_framework(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let config = result.unwrap();
        // Should detect vitest framework
        assert_eq!(config.framework, Some(TestFramework::Vitest));
        assert!(config.test_command.is_some());
    }

    #[tokio::test]
    async fn test_cmd_get_test_runner_config_with_saved_config() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();

        // Save a config with framework to DB
        {
            let state_ref = app.state::<crate::state::AppState>();
            let db_lock = state_ref.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let config = TestRunnerConfig {
                framework: Some(TestFramework::Pytest),
                test_command: Some("pytest -v".to_string()),
                test_file_command: Some("pytest {file}".to_string()),
                ..Default::default()
            };
            db.save_test_runner_config(&repo_id, &config).unwrap();
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_test_runner_config(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let config = result.unwrap();
        assert_eq!(config.framework, Some(TestFramework::Pytest));
        assert_eq!(config.test_command.as_deref(), Some("pytest -v"));
        assert_eq!(config.test_file_command.as_deref(), Some("pytest {file}"));
    }

    #[tokio::test]
    async fn test_cmd_get_test_runner_config_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_test_runner_config(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_tests_with_stored_pid() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state_ref = app.state::<crate::state::AppState>();
        let ctx_id = Uuid::new_v4();

        // Insert a fake PID in test_processes
        {
            let mut processes = state_ref.test_processes.lock().unwrap();
            processes.insert(test_process_key(&ctx_id), 999999);
        }

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = stop_tests(state, ctx_id.to_string()).await;
        assert!(result.is_ok());

        // Verify PID was removed
        let processes = state_ref.test_processes.lock().unwrap();
        assert!(!processes.contains_key(&test_process_key(&ctx_id)));
    }

    #[tokio::test]
    async fn test_cmd_list_test_history_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        // Valid UUID but repo not in DB — should still return empty (no error from DB)
        let result = list_test_history(state, Uuid::new_v4().to_string(), None).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_cmd_save_then_get_roundtrip() {
        use tauri::Manager;
        let (app, repo_id) = setup_test_runner_state();

        // Save config
        let config = TestRunnerConfig {
            framework: Some(TestFramework::Jest),
            test_command: Some("npx jest --coverage".to_string()),
            test_file_command: Some("npx jest {file}".to_string()),
            working_dir: Some("packages/core".to_string()),
            coverage_command: Some("npx jest --coverage --json".to_string()),
        };
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        save_test_runner_config(state, repo_id.to_string(), config.clone())
            .await
            .unwrap();

        // Get config back
        let state2: tauri::State<'_, crate::state::AppState> = app.state();
        let loaded = get_test_runner_config(state2, repo_id.to_string())
            .await
            .unwrap();
        assert_eq!(loaded.framework, Some(TestFramework::Jest));
        assert_eq!(loaded.test_command.as_deref(), Some("npx jest --coverage"));
        assert_eq!(loaded.working_dir.as_deref(), Some("packages/core"));
        assert_eq!(loaded.coverage_command.as_deref(), Some("npx jest --coverage --json"));
    }

    #[tokio::test]
    async fn test_cmd_stop_test_watch_nonexistent_key() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        // Using a string key that doesn't exist — should succeed (noop)
        let result = stop_test_watch(state, "some-random-string".to_string()).await;
        assert!(result.is_ok());
    }
}
