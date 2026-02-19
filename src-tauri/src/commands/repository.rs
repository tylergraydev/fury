use crate::error::AppError;
use crate::models::repository::Repository;
use crate::services::worktree;
use crate::state::AppState;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

/// Get the current checked-out branch for a repo path.
fn detect_current_branch(path: &Path) -> Option<String> {
    let output = std::process::Command::new("git")
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

#[tauri::command]
pub fn add_repository(state: State<'_, AppState>, path: String) -> Result<Repository, AppError> {
    let path = PathBuf::from(&path);

    // Validate it's a git repository
    let git_check = std::process::Command::new("git")
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
        .lock()
        .unwrap()
        .insert(repo.id, repo.clone());

    Ok(repo)
}

#[tauri::command]
pub fn remove_repository(state: State<'_, AppState>, repo_id: String) -> Result<(), AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.delete_repository(&id)?;
        }
    }

    state.repositories.lock().unwrap().remove(&id);

    Ok(())
}

#[tauri::command]
pub fn list_repositories(state: State<'_, AppState>) -> Result<Vec<Repository>, AppError> {
    let repos = state.repositories.lock().unwrap();
    Ok(repos
        .values()
        .cloned()
        .map(|mut r| {
            r.current_branch = detect_current_branch(&r.path);
            r
        })
        .collect())
}

#[tauri::command]
pub fn list_branches(state: State<'_, AppState>, repo_id: String) -> Result<Vec<String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repos = state.repositories.lock().unwrap();
    let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;

    let output = std::process::Command::new("git")
        .args(["branch", "--format=%(refname:short)"])
        .current_dir(&repo.path)
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
}
