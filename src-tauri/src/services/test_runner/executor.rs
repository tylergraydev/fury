use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::db::Database;
use crate::error::AppError;
use crate::models::test_runner::*;
use crate::platform;

use super::parsers::parse_output;

/// Spawn a test process and stream output, then parse results on completion.
#[allow(clippy::too_many_arguments)]
pub async fn spawn_test_run(
    context_id: Uuid,
    command: &str,
    working_dir: &Path,
    framework: &TestFramework,
    env_vars: HashMap<String, String>,
    app_handle: AppHandle,
    db: Arc<Mutex<Option<Database>>>,
    repo_id: Uuid,
) -> Result<Child, AppError> {
    let shell = platform::default_shell();
    let flag = platform::shell_exec_flag();

    let mut cmd = Command::new(shell);
    cmd.arg(flag)
        .arg(command)
        .current_dir(working_dir)
        .envs(&env_vars)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000200); // CREATE_NO_WINDOW

    let mut child = cmd.kill_on_drop(true).spawn().map_err(|e| {
        AppError::ScriptError(format!("Failed to spawn test command: {}", e))
    })?;

    let event_name = format!("test-runner:{}", context_id);
    let framework_clone = framework.clone();

    // Collect stdout for parsing
    let stdout_lines = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));

    // Stream stdout
    let stdout_handle = if let Some(stdout) = child.stdout.take() {
        let app_out = app_handle.clone();
        let event_out = event_name.clone();
        let lines_ref = std::sync::Arc::clone(&stdout_lines);
        Some(tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                lines_ref.lock().await.push(line.clone());
                let _ = app_out.emit(
                    &event_out,
                    &TestRunEvent::OutputLine {
                        line,
                        stream: "stdout".to_string(),
                    },
                );
            }
        }))
    } else {
        None
    };

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app_err = app_handle.clone();
        let event_err = event_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit(
                    &event_err,
                    &TestRunEvent::OutputLine {
                        line,
                        stream: "stderr".to_string(),
                    },
                );
            }
        });
    }

    // Background task: wait for stdout reader to finish, then parse output and emit results
    let app_final = app_handle.clone();
    let event_final = event_name;
    let lines_final = stdout_lines;
    tokio::spawn(async move {
        // Wait for the stdout reader to finish (i.e., process closed its stdout)
        if let Some(handle) = stdout_handle {
            let _ = handle.await;
        }

        let collected = lines_final.lock().await;
        let full_stdout = collected.join("\n");
        drop(collected);

        let summary = parse_output(&framework_clone, &full_stdout);
        match summary {
            Ok(s) => {
                // Persist test run history
                if let Ok(db_guard) = db.lock() {
                    if let Some(ref db_ref) = *db_guard {
                        let _ = db_ref.insert_test_run(&repo_id, &s);
                    }
                }
                let _ = app_final.emit(&event_final, &TestRunEvent::RunComplete { summary: s });
            }
            Err(e) => {
                let _ = app_final.emit(
                    &event_final,
                    &TestRunEvent::Error {
                        message: format!("Failed to parse test output: {}", e),
                    },
                );
            }
        }
    });

    Ok(child)
}
