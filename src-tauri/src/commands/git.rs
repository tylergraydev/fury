use std::path::PathBuf;
use std::process::Command;

use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent};
use crate::services::diff as diff_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub struct FileContent {
    pub content: String,
    pub language: String,
}

#[tauri::command]
pub fn get_diff(state: State<'_, AppState>, workspace_id: String) -> Result<DiffResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, default_branch) = {
        let workspaces = state
            .workspaces
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    diff_svc::get_workspace_diff(&worktree_path, &default_branch)
}

#[tauri::command]
pub fn get_file_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
) -> Result<FileDiffContent, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, default_branch) = {
        let workspaces = state
            .workspaces
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    diff_svc::get_file_diff_content(&worktree_path, &default_branch, &file_path)
}

#[tauri::command]
pub fn list_repo_directories(
    state: State<'_, AppState>,
    repo_id: String,
    depth: Option<u32>,
) -> Result<Vec<String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let depth = depth.unwrap_or(1);
    let mut args = vec!["ls-tree", "--name-only", "-d"];
    let depth_str;
    if depth > 1 {
        depth_str = format!("-r");
        args.push(&depth_str);
    }
    args.push("HEAD");

    let output = Command::new("git")
        .args(&args)
        .current_dir(&repo_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let dirs = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();

    Ok(dirs)
}

#[tauri::command]
pub fn list_workspace_files(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<String>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state
            .workspaces
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let output = Command::new("git")
        .args(["ls-tree", "-r", "--name-only", "HEAD"])
        .current_dir(&worktree_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let files = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn list_repo_files(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let output = Command::new("git")
        .args(["ls-tree", "-r", "--name-only", "HEAD"])
        .current_dir(&repo_path)
        .output()?;

    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let files = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn get_repo_diff(state: State<'_, AppState>, repo_id: String) -> Result<DiffResult, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let (repo_path, default_branch) = {
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        (repo.path.clone(), repo.default_branch.clone())
    };

    diff_svc::get_workspace_diff(&repo_path, &default_branch)
}

#[tauri::command]
pub fn get_repo_file_diff(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: String,
) -> Result<FileDiffContent, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let (repo_path, default_branch) = {
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        (repo.path.clone(), repo.default_branch.clone())
    };

    diff_svc::get_file_diff_content(&repo_path, &default_branch, &file_path)
}

#[tauri::command]
pub fn read_workspace_file(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
) -> Result<FileContent, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state
            .workspaces
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let base = worktree_path
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve workspace path: {}", e)))?;
    let full_path = PathBuf::from(&worktree_path).join(&file_path);
    let full_path = full_path
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve file path: {}", e)))?;
    if !full_path.starts_with(&base) {
        return Err(AppError::GitError("file path outside workspace".into()));
    }

    let content = std::fs::read_to_string(&full_path)
        .map_err(|e| AppError::GitError(format!("failed to read file: {}", e)))?;
    let language = diff_svc::detect_language(&file_path);

    Ok(FileContent { content, language })
}

#[tauri::command]
pub fn read_repo_file(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: String,
) -> Result<FileContent, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state
            .repositories
            .lock()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let base = repo_path
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve repo path: {}", e)))?;
    let full_path = PathBuf::from(&repo_path).join(&file_path);
    let full_path = full_path
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve file path: {}", e)))?;
    if !full_path.starts_with(&base) {
        return Err(AppError::GitError("file path outside repository".into()));
    }

    let content = std::fs::read_to_string(&full_path)
        .map_err(|e| AppError::GitError(format!("failed to read file: {}", e)))?;
    let language = diff_svc::detect_language(&file_path);

    Ok(FileContent { content, language })
}
