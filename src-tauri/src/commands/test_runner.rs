use std::sync::Arc;

use crate::error::AppError;
use crate::models::test_runner::TestRunnerConfig;
use crate::services::{claude_process, test_runner};
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::services::script_runner::ScriptExitEvent;

#[tauri::command]
pub fn detect_test_framework(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<TestRunnerConfig, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    match test_runner::detect_framework(&repo_path) {
        Some(fw) => Ok(test_runner::default_commands(&fw)),
        None => Ok(TestRunnerConfig::default()),
    }
}

#[tauri::command]
pub fn get_test_runner_config(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<TestRunnerConfig, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Try to read from DB first
    let db_config = {
        let db = state.db.lock().unwrap();
        match db.as_ref() {
            Some(db) => db.get_test_runner_config(&id)?,
            None => TestRunnerConfig::default(),
        }
    };

    // If DB has a config with a framework, use it
    if db_config.framework.is_some() {
        return Ok(db_config);
    }

    // Otherwise auto-detect
    let repo_path = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    match test_runner::detect_framework(&repo_path) {
        Some(fw) => {
            let mut config = test_runner::default_commands(&fw);
            // Merge: DB overrides take precedence over auto-detected defaults
            if db_config.test_command.is_some() {
                config.test_command = db_config.test_command;
            }
            if db_config.test_file_command.is_some() {
                config.test_file_command = db_config.test_file_command;
            }
            if db_config.working_dir.is_some() {
                config.working_dir = db_config.working_dir;
            }
            Ok(config)
        }
        None => Ok(db_config),
    }
}

#[tauri::command]
pub fn save_test_runner_config(
    state: State<'_, AppState>,
    repo_id: String,
    config: TestRunnerConfig,
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
        db.save_test_runner_config(&id, &config)?;
    }

    Ok(())
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
    let (working_dir, repo_id) = if context_type == "workspace" {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?;
        (ws.worktree_path.clone(), ws.repo_id)
    } else {
        let repos = state.repositories.lock().unwrap();
        let repo = repos.get(&ctx_id).ok_or(AppError::RepoNotFound(ctx_id))?;
        (repo.path.clone(), ctx_id)
    };

    // Get test runner config
    let config = {
        let db = state.db.lock().unwrap();
        let db_config = match db.as_ref() {
            Some(db) => db.get_test_runner_config(&repo_id)?,
            None => TestRunnerConfig::default(),
        };
        drop(db);

        if db_config.framework.is_some() && db_config.test_command.is_some() {
            db_config
        } else {
            // Auto-detect
            let repo_path = {
                let repos = state.repositories.lock().unwrap();
                repos
                    .get(&repo_id)
                    .ok_or(AppError::RepoNotFound(repo_id))?
                    .path
                    .clone()
            };
            match test_runner::detect_framework(&repo_path) {
                Some(fw) => {
                    let mut detected = test_runner::default_commands(&fw);
                    if db_config.test_command.is_some() {
                        detected.test_command = db_config.test_command;
                    }
                    if db_config.test_file_command.is_some() {
                        detected.test_file_command = db_config.test_file_command;
                    }
                    if db_config.working_dir.is_some() {
                        detected.working_dir = db_config.working_dir;
                    }
                    detected
                }
                None => db_config,
            }
        }
    };

    let framework = config
        .framework
        .clone()
        .unwrap_or(crate::models::test_runner::TestFramework::Custom);

    // Determine command
    let command = if let Some(ref filter) = file_filter {
        config
            .test_file_command
            .as_ref()
            .map(|cmd| cmd.replace("{file}", filter))
            .or_else(|| config.test_command.clone())
    } else {
        config.test_command.clone()
    };

    let command = command.ok_or_else(|| {
        AppError::ScriptError("No test command configured".to_string())
    })?;

    // Resolve effective working directory
    let effective_dir = if let Some(ref wd) = config.working_dir {
        working_dir.join(wd)
    } else {
        working_dir
    };

    // Kill existing test process if running
    let process_key = format!("test:{}", ctx_id);
    {
        let mut processes = state.test_processes.lock().unwrap();
        if let Some(child) = processes.remove(&process_key) {
            if let Some(pid) = child.id() {
                let _ = crate::platform::kill_process_group(pid);
            }
        }
    }

    // Build env vars
    let env_vars = if context_type == "workspace" {
        let workspaces = state.workspaces.lock().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?
            .clone();
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&repo_id)
            .ok_or(AppError::RepoNotFound(repo_id))?
            .clone();
        let app_settings = state.settings.lock().unwrap().clone();
        claude_process::build_env_vars(&ws, &repo, &app_settings)
    } else {
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(&ctx_id)
            .ok_or(AppError::RepoNotFound(ctx_id))?
            .clone();
        let app_settings = state.settings.lock().unwrap().clone();
        claude_process::build_repo_env_vars(&repo, &app_settings)
    };

    // Spawn test process
    let child = test_runner::spawn_test_run(
        ctx_id,
        &command,
        &effective_dir,
        &framework,
        env_vars,
        app.clone(),
    )
    .await?;

    // Store process handle
    {
        let mut processes = state.test_processes.lock().unwrap();
        processes.insert(process_key.clone(), child);
    }

    // Background task to wait for exit
    let processes_ref = Arc::clone(&state.test_processes);
    let app_clone = app.clone();
    let exit_event = format!("test-exit:{}", ctx_id);
    tokio::spawn(async move {
        let mut child = {
            let mut processes = processes_ref.lock().unwrap();
            processes.remove(&process_key)
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
pub fn stop_tests(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<(), AppError> {
    let ctx_id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let process_key = format!("test:{}", ctx_id);
    let mut processes = state.test_processes.lock().unwrap();
    if let Some(child) = processes.remove(&process_key) {
        if let Some(pid) = child.id() {
            let _ = crate::platform::kill_process_group(pid);
        }
    }

    // Also emit an error event to signal the UI
    Ok(())
}
