use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent, FilePatchPreview};
use crate::platform;
use crate::services::diff as diff_svc;
use crate::state::AppState;
use base64::Engine;
use tauri::State;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub struct FileContent {
    pub content: String,
    pub language: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResult {
    pub content: String,
    pub language: String,
    pub formatted: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub full_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

#[tauri::command]
pub async fn get_git_log(
    state: State<'_, AppState>,
    workspace_id: String,
    max_count: Option<u32>,
) -> Result<Vec<GitLogEntry>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let count = max_count.unwrap_or(100);
    tokio::task::spawn_blocking(move || {
        let count_str = count.to_string();
        let format_arg = "--format=%h\x1f%H\x1f%s\x1f%an\x1f%aI";

        let output = platform::command("git")
            .args(["log", &format!("--max-count={}", count_str), format_arg])
            .current_dir(&worktree_path)
            .output()?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let entries = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .filter_map(|line| {
                let parts: Vec<&str> = line.splitn(5, '\x1f').collect();
                if parts.len() == 5 {
                    Some(GitLogEntry {
                        hash: parts[0].to_string(),
                        full_hash: parts[1].to_string(),
                        message: parts[2].to_string(),
                        author: parts[3].to_string(),
                        timestamp: parts[4].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(entries)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_diff(state: State<'_, AppState>, workspace_id: String) -> Result<DiffResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, default_branch) = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    tokio::task::spawn_blocking(move || diff_svc::get_workspace_diff(&worktree_path, &default_branch))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_file_diff(
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
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    tokio::task::spawn_blocking(move || diff_svc::get_file_diff_content(&worktree_path, &default_branch, &file_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_repo_directories(
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
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    let depth = depth.unwrap_or(1);
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["ls-tree", "--name-only", "-d"];
        let depth_str;
        if depth > 1 {
            depth_str = "-r".to_string();
            args.push(&depth_str);
        }
        args.push("HEAD");

        let output = platform::command("git")
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_workspace_files(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<String>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let output = platform::command("git")
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_repo_files(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<String>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let output = platform::command("git")
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_repo_diff(state: State<'_, AppState>, repo_id: String) -> Result<DiffResult, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let (repo_path, default_branch) = {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        (repo.path.clone(), repo.default_branch.clone())
    };

    tokio::task::spawn_blocking(move || diff_svc::get_workspace_diff(&repo_path, &default_branch))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_repo_file_diff(
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
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        (repo.path.clone(), repo.default_branch.clone())
    };

    tokio::task::spawn_blocking(move || diff_svc::get_file_diff_content(&repo_path, &default_branch, &file_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_file_patch(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
    is_untracked: Option<bool>,
) -> Result<FilePatchPreview, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, default_branch) = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (ws.worktree_path.clone(), repo.default_branch.clone())
    };

    let untracked = is_untracked.unwrap_or(false);
    tokio::task::spawn_blocking(move || diff_svc::get_file_patch_preview(&worktree_path, &default_branch, &file_path, untracked))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_repo_file_patch(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: String,
    is_untracked: Option<bool>,
) -> Result<FilePatchPreview, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let (repo_path, default_branch) = {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        (repo.path.clone(), repo.default_branch.clone())
    };

    let untracked = is_untracked.unwrap_or(false);
    tokio::task::spawn_blocking(move || diff_svc::get_file_patch_preview(&repo_path, &default_branch, &file_path, untracked))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn read_workspace_file(
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
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn read_repo_file(
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
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Attempt to format a file using available CLI formatters.
/// Returns true if formatting was applied, false otherwise.
fn try_format_file(file_path: &std::path::Path, working_dir: &std::path::Path) -> bool {
    let file_str = match file_path.to_str() {
        Some(s) => s,
        None => return false,
    };
    let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let formatter: Option<(std::ffi::OsString, Vec<&str>)> = match ext {
        "ts" | "tsx" | "js" | "jsx" | "json" | "css" | "scss" | "html" | "md" | "yaml" | "yml" => {
            let local = working_dir.join("node_modules/.bin/prettier");
            if local.exists() {
                Some((local.into_os_string(), vec!["--write", file_str]))
            } else if which::which("prettier").is_ok() {
                Some(("prettier".into(), vec!["--write", file_str]))
            } else {
                None
            }
        }
        "rs" => {
            if which::which("rustfmt").is_ok() {
                Some(("rustfmt".into(), vec![file_str]))
            } else {
                None
            }
        }
        "go" => {
            if which::which("gofmt").is_ok() {
                Some(("gofmt".into(), vec!["-w", file_str]))
            } else {
                None
            }
        }
        "py" => {
            if which::which("black").is_ok() {
                Some(("black".into(), vec!["--quiet", file_str]))
            } else if which::which("ruff").is_ok() {
                Some(("ruff".into(), vec!["format", file_str]))
            } else {
                None
            }
        }
        _ => None,
    };

    if let Some((cmd, args)) = formatter {
        let result = platform::command(&cmd)
            .args(&args)
            .current_dir(working_dir)
            .output();
        matches!(result, Ok(output) if output.status.success())
    } else {
        false
    }
}

#[tauri::command]
pub async fn write_workspace_file(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
    content: String,
    format_on_save: bool,
) -> Result<WriteFileResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let base = worktree_path
            .canonicalize()
            .map_err(|e| AppError::GitError(format!("failed to resolve workspace path: {}", e)))?;
        let full_path = PathBuf::from(&worktree_path).join(&file_path);
        // Canonicalize the parent directory (which must exist) and append the filename,
        // so that new files that don't yet exist can still be validated.
        let parent = full_path
            .parent()
            .ok_or_else(|| AppError::GitError("file path has no parent directory".into()))?;
        let parent = parent
            .canonicalize()
            .map_err(|e| AppError::GitError(format!("failed to resolve parent directory: {}", e)))?;
        let file_name = full_path
            .file_name()
            .ok_or_else(|| AppError::GitError("file path has no filename".into()))?;
        let full_path = parent.join(file_name);
        if !full_path.starts_with(&base) {
            return Err(AppError::GitError("file path outside workspace".into()));
        }

        std::fs::write(&full_path, &content)
            .map_err(|e| AppError::GitError(format!("failed to write file: {}", e)))?;

        let formatted = if format_on_save {
            try_format_file(&full_path, &worktree_path)
        } else {
            false
        };

        let final_content = std::fs::read_to_string(&full_path)
            .map_err(|e| AppError::GitError(format!("failed to read back file: {}", e)))?;
        let language = diff_svc::detect_language(&file_path);

        Ok(WriteFileResult {
            content: final_content,
            language,
            formatted,
        })
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn write_repo_file(
    state: State<'_, AppState>,
    repo_id: String,
    file_path: String,
    content: String,
    format_on_save: bool,
) -> Result<WriteFileResult, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let base = repo_path
            .canonicalize()
            .map_err(|e| AppError::GitError(format!("failed to resolve repo path: {}", e)))?;
        let full_path = PathBuf::from(&repo_path).join(&file_path);
        // Canonicalize the parent directory (which must exist) and append the filename,
        // so that new files that don't yet exist can still be validated.
        let parent = full_path
            .parent()
            .ok_or_else(|| AppError::GitError("file path has no parent directory".into()))?;
        let parent = parent
            .canonicalize()
            .map_err(|e| AppError::GitError(format!("failed to resolve parent directory: {}", e)))?;
        let file_name = full_path
            .file_name()
            .ok_or_else(|| AppError::GitError("file path has no filename".into()))?;
        let full_path = parent.join(file_name);
        if !full_path.starts_with(&base) {
            return Err(AppError::GitError("file path outside repository".into()));
        }

        std::fs::write(&full_path, &content)
            .map_err(|e| AppError::GitError(format!("failed to write file: {}", e)))?;

        let formatted = if format_on_save {
            try_format_file(&full_path, &repo_path)
        } else {
            false
        };

        let final_content = std::fs::read_to_string(&full_path)
            .map_err(|e| AppError::GitError(format!("failed to read back file: {}", e)))?;
        let language = diff_svc::detect_language(&file_path);

        Ok(WriteFileResult {
            content: final_content,
            language,
            formatted,
        })
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

// --- Type definition loading for Monaco language services ---

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeDefFile {
    pub file_path: String,
    pub content: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeDefinitions {
    pub tsconfig: Option<String>,
    pub libs: Vec<TypeDefFile>,
}

const MAX_DTS_FILE_SIZE: u64 = 500_000; // 500KB per file
const MAX_DTS_TOTAL_SIZE: usize = 10_000_000; // 10MB total

fn collect_dts_files(
    dir: &Path,
    root: &Path,
    libs: &mut Vec<TypeDefFile>,
    total_size: &mut usize,
    depth: u8,
) {
    if depth > 4 || *total_size >= MAX_DTS_TOTAL_SIZE {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if *total_size >= MAX_DTS_TOTAL_SIZE {
            return;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_dts_files(&path, root, libs, total_size, depth + 1);
        } else if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with(".d.ts"))
            .unwrap_or(false)
        {
            if let Ok(meta) = path.metadata() {
                if meta.len() > MAX_DTS_FILE_SIZE {
                    continue;
                }
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                *total_size += content.len();
                let rel = path.strip_prefix(root).unwrap_or(&path);
                libs.push(TypeDefFile {
                    file_path: rel.to_string_lossy().into_owned(),
                    content,
                });
            }
        }
    }
}

#[tauri::command]
pub async fn load_type_definitions(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
    repo_id: Option<String>,
) -> Result<TypeDefinitions, AppError> {
    let root_path = if let Some(ws_id_str) = workspace_id {
        let ws_id: Uuid = ws_id_str
            .parse()
            .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    } else if let Some(repo_id_str) = repo_id {
        let id: Uuid = repo_id_str
            .parse()
            .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    } else {
        return Err(AppError::GitError("no workspace or repo specified".into()));
    };

    tokio::task::spawn_blocking(move || {
        let mut result = TypeDefinitions {
            tsconfig: None,
            libs: Vec::new(),
        };

        // Read tsconfig.json if present
        let tsconfig_path = root_path.join("tsconfig.json");
        if tsconfig_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&tsconfig_path) {
                result.tsconfig = Some(content);
            }
        }

        // Scan node_modules/@types/ for type definition packages
        let types_dir = root_path.join("node_modules/@types");
        if types_dir.exists() {
            let mut total_size: usize = 0;
            collect_dts_files(&types_dir, &root_path, &mut result.libs, &mut total_size, 0);
        }

        Ok(result)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Read an arbitrary file and return its contents as a base64 data URL.
/// Used for displaying dropped image previews in the chat UI.
#[tauri::command]
pub async fn read_file_base64(file_path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&file_path);

        const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50 MB
        let metadata = std::fs::metadata(&path)
            .map_err(|e| AppError::GitError(format!("failed to read file {}: {}", file_path, e)))?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(AppError::GitError(format!(
                "file too large for preview ({} bytes, max {})",
                metadata.len(),
                MAX_FILE_SIZE
            )));
        }

        let bytes = std::fs::read(&path)
            .map_err(|e| AppError::GitError(format!("failed to read file {}: {}", file_path, e)))?;

        let mime = match path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref()
        {
            Some("png") => "image/png",
            Some("jpg" | "jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            Some("svg") => "image/svg+xml",
            Some("bmp") => "image/bmp",
            Some("ico") => "image/x-icon",
            Some("tiff" | "tif") => "image/tiff",
            Some("avif") => "image/avif",
            _ => "application/octet-stream",
        };

        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(format!("data:{};base64,{}", mime, b64))
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Save base64-encoded image data to a temporary file and return the absolute path.
/// Used for clipboard paste support in the chat composer.
#[tauri::command]
pub async fn save_clipboard_image(data: String, mime_type: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let ext = match mime_type.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/bmp" => "bmp",
            "image/svg+xml" => "svg",
            _ => "png",
        };

        let tmp_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.fury.app")
            .join("tmp")
            .join("clipboard-images");
        std::fs::create_dir_all(&tmp_dir)?;

        let filename = format!("paste-{}.{}", Uuid::new_v4(), ext);
        let file_path = tmp_dir.join(&filename);

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&data)
            .map_err(|e| AppError::GitError(format!("failed to decode base64 image: {}", e)))?;

        const MAX_SIZE: usize = 50 * 1024 * 1024;
        if bytes.len() > MAX_SIZE {
            return Err(AppError::GitError(format!(
                "pasted image too large ({} bytes, max {})",
                bytes.len(),
                MAX_SIZE
            )));
        }

        std::fs::write(&file_path, &bytes)?;

        Ok(file_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_save_clipboard_image_creates_file() {
        // Minimal valid 1x1 PNG
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let result = save_clipboard_image(png_b64.to_string(), "image/png".to_string()).await;
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.ends_with(".png"));
        assert!(std::path::Path::new(&path).exists());
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn test_save_clipboard_image_jpeg_extension() {
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let result = save_clipboard_image(png_b64.to_string(), "image/jpeg".to_string()).await;
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.ends_with(".jpg"));
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn test_save_clipboard_image_invalid_base64() {
        let result = save_clipboard_image("not-valid!!!".to_string(), "image/png".to_string()).await;
        assert!(result.is_err());
    }
}
