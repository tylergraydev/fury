use std::sync::Arc;

use crate::error::AppError;
use crate::models::test_runner::{TestRunEvent, TestRunRecord, TestRunnerConfig};
use crate::services::{claude_process, diff_watcher, test_runner};
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::services::script_runner::ScriptExitEvent;

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
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
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

    // Verify repo exists
    {
        let repos = state.repositories.read().unwrap();
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
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?;
        (ws.worktree_path.clone(), ws.repo_id)
    } else {
        let repos = state.repositories.read().unwrap();
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
                let repos = state.repositories.read().unwrap();
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
    let exit_event = format!("test-exit:{}", ctx_id);
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
        let process_key = format!("test:{}", ctx_id);
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
        format!("test-watch:{}", context_id),
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

    let db = state.db.lock().unwrap();
    match db.as_ref() {
        Some(db) => db.list_test_runs(&id, limit.unwrap_or(20)),
        None => Ok(vec![]),
    }
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
    let (working_dir, repo_id) = if context_type == "workspace" {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ctx_id)
            .ok_or(AppError::WorkspaceNotFound(ctx_id))?;
        (ws.worktree_path.clone(), ws.repo_id)
    } else {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&ctx_id).ok_or(AppError::RepoNotFound(ctx_id))?;
        (repo.path.clone(), ctx_id)
    };

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

    let event_name = format!("test-runner:{}", ctx_id);
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
