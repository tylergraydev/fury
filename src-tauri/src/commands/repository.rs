use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::models::mcp::{IndexingState, IndexingStatus};
use crate::models::repository::Repository;
use crate::models::settings::ClaudeContextSettings;
use crate::platform;
use crate::services::claude_context as ctx_svc;
use crate::services::worktree;
use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

/// Get the current checked-out branch for a repo path.
fn detect_current_branch(path: &Path) -> Option<String> {
    let output = platform::command("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

/// Fire-and-forget background indexing if Claude Context is enabled.
fn maybe_auto_index(
    repo_id: Uuid,
    repo_path: String,
    ctx_settings: ClaudeContextSettings,
    indexing_status: Arc<Mutex<HashMap<Uuid, IndexingStatus>>>,
) {
    if !ctx_settings.enabled {
        return;
    }
    if ctx_svc::validate_settings(&ctx_settings).is_err() {
        return;
    }

    std::thread::spawn(move || {
        {
            let mut statuses = indexing_status.lock().unwrap();
            statuses.insert(
                repo_id,
                IndexingStatus {
                    repo_id: repo_id.to_string(),
                    repo_path: repo_path.clone(),
                    status: IndexingState::Indexing,
                    error: None,
                    last_indexed_at: None,
                },
            );
        }

        match ctx_svc::index_codebase(&ctx_settings, &repo_path) {
            Ok(_) => {
                let mut statuses = indexing_status.lock().unwrap();
                statuses.insert(
                    repo_id,
                    IndexingStatus {
                        repo_id: repo_id.to_string(),
                        repo_path,
                        status: IndexingState::Indexed,
                        error: None,
                        last_indexed_at: Some(chrono::Utc::now().to_rfc3339()),
                    },
                );
            }
            Err(e) => {
                eprintln!("[claude-context] Indexing failed for {}: {}", repo_path, e);
                let mut statuses = indexing_status.lock().unwrap();
                statuses.insert(
                    repo_id,
                    IndexingStatus {
                        repo_id: repo_id.to_string(),
                        repo_path,
                        status: IndexingState::Error,
                        error: Some(e.to_string()),
                        last_indexed_at: None,
                    },
                );
            }
        }
    });
}

#[tauri::command]
pub async fn add_repository(
    state: State<'_, AppState>,
    path: String,
) -> Result<Repository, AppError> {
    let path_clone = path.clone();

    // Run all git I/O off the main thread
    let (name, default_branch, current_branch) =
        tokio::task::spawn_blocking(move || -> Result<(String, String, Option<String>), AppError> {
            let path = PathBuf::from(&path_clone);

            // Validate it's a git repository
            let git_check = platform::command("git")
                .args(["rev-parse", "--git-dir"])
                .current_dir(&path)
                .output()?;

            if !git_check.status.success() {
                return Err(AppError::GitError(format!(
                    "{} is not a git repository",
                    path.display()
                )));
            }

            // Detect name from directory
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            // Detect default branch
            let default_branch = worktree::detect_default_branch(&path);
            let current_branch = detect_current_branch(&path);

            Ok((name, default_branch, current_branch))
        })
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let path = PathBuf::from(&path);
    let repo = Repository {
        id: Uuid::new_v4(),
        name,
        path: path.clone(),
        default_branch,
        current_branch,
    };

    // Persist to database
    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.insert_repository(&repo)?;
        }
    }

    // Add to in-memory state
    state
        .repositories
        .write()
        .unwrap()
        .insert(repo.id, repo.clone());

    // Auto-index with Claude Context if enabled
    let ctx_settings = state.settings.read().unwrap().claude_context.clone();
    maybe_auto_index(
        repo.id,
        repo.path.to_string_lossy().to_string(),
        ctx_settings,
        state.indexing_status.clone(),
    );

    Ok(repo)
}

#[tauri::command]
pub async fn remove_repository(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.delete_repository(&id)?;
        }
    }

    state.repositories.write().unwrap().remove(&id);

    Ok(())
}

#[tauri::command]
pub async fn list_repositories(state: State<'_, AppState>) -> Result<Vec<Repository>, AppError> {
    // Clone repos out of the lock FIRST, then release before git I/O.
    let mut repos: Vec<Repository> = {
        let guard = state.repositories.read().unwrap();
        guard.values().cloned().collect()
    };

    // Detect current branch for each repo in parallel using spawn_blocking.
    let handles: Vec<_> = repos
        .iter()
        .map(|r| {
            let path = r.path.clone();
            tokio::task::spawn_blocking(move || detect_current_branch(&path))
        })
        .collect();

    for (repo, handle) in repos.iter_mut().zip(handles) {
        repo.current_branch = handle.await.unwrap_or_default();
    }

    Ok(repos)
}

#[tauri::command]
pub async fn list_branches(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    // Extract the path while holding the lock, then release before git I/O.
    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let output = platform::command("git")
            .args(["branch", "--format=%(refname:short)"])
            .current_dir(&repo_path)
            .output()?;

        if !output.status.success() {
            return Err(AppError::GitError(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        Ok(branches)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Helper to register a local git repo path into state + DB.
fn register_repository(state: &State<'_, AppState>, path: PathBuf) -> Result<Repository, AppError> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let default_branch = worktree::detect_default_branch(&path);
    let current_branch = detect_current_branch(&path);

    let repo = Repository {
        id: Uuid::new_v4(),
        name,
        path: path.clone(),
        default_branch,
        current_branch,
    };

    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.insert_repository(&repo)?;
        }
    }

    state
        .repositories
        .write()
        .unwrap()
        .insert(repo.id, repo.clone());

    // Auto-index with Claude Context if enabled
    let ctx_settings = state.settings.read().unwrap().claude_context.clone();
    maybe_auto_index(
        repo.id,
        repo.path.to_string_lossy().to_string(),
        ctx_settings,
        state.indexing_status.clone(),
    );

    Ok(repo)
}

#[tauri::command]
pub async fn clone_repository(
    state: State<'_, AppState>,
    url: String,
    path: String,
) -> Result<Repository, AppError> {
    let path_clone = path.clone();

    // Run git clone off the main thread
    tokio::task::spawn_blocking(move || {
        let output = platform::command("git")
            .args(["clone", &url, &path_clone])
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::GitError(format!("Clone failed: {}", stderr)));
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let dest = PathBuf::from(&path);

    // register_repository does git I/O (detect_default_branch, detect_current_branch)
    // plus state writes — run it inline since it needs state access.
    register_repository(&state, dest)
}

#[tauri::command]
pub async fn init_repository(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<Repository, AppError> {
    let path_clone = path.clone();
    let name_clone = name.clone();

    // Run git init + initial commit off the main thread
    tokio::task::spawn_blocking(move || {
        let dest = PathBuf::from(&path_clone);

        if !dest.exists() {
            fs::create_dir_all(&dest)?;
        }

        let output = platform::command("git")
            .args(["init"])
            .current_dir(&dest)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::GitError(format!("Init failed: {}", stderr)));
        }

        // Create initial commit so the repo has a branch
        let readme = dest.join("README.md");
        fs::write(&readme, format!("# {}\n", name_clone))?;

        let _ = platform::command("git")
            .args(["add", "."])
            .current_dir(&dest)
            .output();

        let _ = platform::command("git")
            .args(["commit", "-m", "Initial commit"])
            .current_dir(&dest)
            .output();

        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let dest = PathBuf::from(&path);

    // register_repository does git I/O (detect_default_branch, detect_current_branch)
    // plus state writes — run it inline since it needs state access.
    register_repository(&state, dest)
}
