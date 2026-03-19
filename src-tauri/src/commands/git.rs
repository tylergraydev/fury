use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent, FilePatchPreview};
use crate::platform;
use crate::services::diff as diff_svc;
use crate::state::AppState;
use base64::Engine;
use tauri::State;
use uuid::Uuid;

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct FileContent {
    pub content: String,
    pub language: String,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResult {
    pub content: String,
    pub language: String,
    pub formatted: bool,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub full_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

// ---------------------------------------------------------------------------
// Extracted inner functions for testability
// ---------------------------------------------------------------------------

/// Parse `\x1f`-delimited git log output into structured entries.
pub(crate) fn parse_git_log_output(raw: &str) -> Vec<GitLogEntry> {
    raw.lines()
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
        .collect()
}

/// Resolve and validate a file path within a base directory.
/// Returns the validated absolute path or an error if it escapes the base.
pub(crate) fn resolve_file_path(base_dir: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let base = base_dir
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve base path: {}", e)))?;
    let full_path = base_dir.join(relative_path);
    let full_path = full_path
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve file path: {}", e)))?;
    if !full_path.starts_with(&base) {
        return Err(AppError::GitError("file path outside allowed directory".into()));
    }
    Ok(full_path)
}

/// Resolve and validate a path for a file that may not yet exist (write case).
/// Canonicalizes the parent directory and appends the filename.
pub(crate) fn resolve_new_file_path(base_dir: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let base = base_dir
        .canonicalize()
        .map_err(|e| AppError::GitError(format!("failed to resolve base path: {}", e)))?;
    let full_path = base_dir.join(relative_path);
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
        return Err(AppError::GitError("file path outside allowed directory".into()));
    }
    Ok(full_path)
}

/// Build `git ls-tree` arguments for listing repo directories.
pub(crate) fn build_ls_tree_args(depth: u32) -> Vec<&'static str> {
    let mut args = vec!["ls-tree", "--name-only", "-d"];
    if depth > 1 {
        args.push("-r");
    }
    args.push("HEAD");
    args
}

/// Map a file extension to a MIME type for base64 data URLs.
pub(crate) fn mime_for_extension(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

/// Map a MIME type to a file extension for clipboard image saving.
pub(crate) fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        _ => "png",
    }
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

        let entries = parse_git_log_output(&String::from_utf8_lossy(&output.stdout));

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
        let args = build_ls_tree_args(depth);

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
        let full_path = resolve_file_path(&worktree_path, &file_path)?;

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
        let full_path = resolve_file_path(&repo_path, &file_path)?;

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
        let full_path = resolve_new_file_path(&worktree_path, &file_path)?;

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
        let full_path = resolve_new_file_path(&repo_path, &file_path)?;

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

        let ext_lower = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let mime = mime_for_extension(&ext_lower);

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
        let ext = extension_for_mime(&mime_type);

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

#[tauri::command]
pub async fn start_diff_watcher(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
) -> Result<(), AppError> {
    let ctx_uuid: Uuid = context_id
        .parse()
        .map_err(|_| AppError::GitError("invalid context id".into()))?;

    if state.diff_watchers.lock().unwrap().contains_key(&ctx_uuid) {
        return Ok(());
    }

    let watch_path = if context_type == "workspace" {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        let ws = workspaces
            .get(&ctx_uuid)
            .ok_or(AppError::WorkspaceNotFound(ctx_uuid))?;
        ws.worktree_path.clone()
    } else {
        let repos = state
            .repositories
            .read()
            .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
        let repo = repos
            .get(&ctx_uuid)
            .ok_or(AppError::RepoNotFound(ctx_uuid))?;
        repo.path.clone()
    };

    let cid = context_id.clone();
    let handle = tokio::task::spawn_blocking(move || {
        crate::services::diff_watcher::start_diff_watcher(watch_path, app, cid)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    state.diff_watchers.lock().unwrap().insert(ctx_uuid, handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_diff_watcher(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<(), AppError> {
    let ctx_uuid: Uuid = context_id
        .parse()
        .map_err(|_| AppError::GitError("invalid context id".into()))?;

    let handle = state.diff_watchers.lock().unwrap().remove(&ctx_uuid);
    if let Some(handle) = handle {
        tokio::task::spawn_blocking(move || {
            handle.stop();
        })
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;

    // -----------------------------------------------------------------------
    // parse_git_log_output
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_git_log_output_single_entry() {
        let raw = "abc1234\x1fabcdef1234567890\x1fInitial commit\x1fAlice\x1f2025-01-15T10:00:00+00:00\n";
        let entries = parse_git_log_output(raw);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].hash, "abc1234");
        assert_eq!(entries[0].full_hash, "abcdef1234567890");
        assert_eq!(entries[0].message, "Initial commit");
        assert_eq!(entries[0].author, "Alice");
        assert_eq!(entries[0].timestamp, "2025-01-15T10:00:00+00:00");
    }

    #[test]
    fn test_parse_git_log_output_multiple_entries() {
        let raw = "aaa\x1f111\x1fFirst\x1fAlice\x1f2025-01-01\naaa\x1f222\x1fSecond\x1fBob\x1f2025-01-02\n";
        let entries = parse_git_log_output(raw);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].message, "First");
        assert_eq!(entries[1].message, "Second");
    }

    #[test]
    fn test_parse_git_log_output_empty_input() {
        assert!(parse_git_log_output("").is_empty());
        assert!(parse_git_log_output("\n\n").is_empty());
    }

    #[test]
    fn test_parse_git_log_output_malformed_lines_skipped() {
        let raw = "only\x1ftwo\x1ffields\naaa\x1f111\x1fGood\x1fAlice\x1f2025-01-01\n";
        let entries = parse_git_log_output(raw);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].message, "Good");
    }

    #[test]
    fn test_parse_git_log_output_message_with_separator() {
        // splitn(5, ...) means the 5th field captures everything remaining
        let raw = "abc\x1f123\x1fMessage with \x1f inside\x1fAlice\x1f2025-01-01\n";
        let entries = parse_git_log_output(raw);
        assert_eq!(entries.len(), 1);
        // The message is "Message with " and author is " inside", timestamp captures the rest
        // This tests the actual splitn(5) behavior
        assert_eq!(entries[0].hash, "abc");
    }

    // -----------------------------------------------------------------------
    // resolve_file_path
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_file_path_valid() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        // README.md exists from create_temp_git_repo
        let result = resolve_file_path(&path, "README.md");
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert!(resolved.ends_with("README.md"));
    }

    #[test]
    fn test_resolve_file_path_nonexistent() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        let result = resolve_file_path(&path, "does-not-exist.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_file_path_traversal_blocked() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        // Create a file outside the repo
        let outside = path.parent().unwrap().join("outside.txt");
        std::fs::write(&outside, "secret").unwrap();
        let result = resolve_file_path(&path, "../outside.txt");
        assert!(result.is_err());
        let _ = std::fs::remove_file(&outside);
    }

    // -----------------------------------------------------------------------
    // resolve_new_file_path
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_new_file_path_valid() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        // File doesn't need to exist, but parent must
        let result = resolve_new_file_path(&path, "new-file.txt");
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert!(resolved.ends_with("new-file.txt"));
    }

    #[test]
    fn test_resolve_new_file_path_traversal_blocked() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        let result = resolve_new_file_path(&path, "../escape.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_new_file_path_parent_must_exist() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        let result = resolve_new_file_path(&path, "nonexistent-dir/file.txt");
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // build_ls_tree_args
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_ls_tree_args_depth_1() {
        let args = build_ls_tree_args(1);
        assert_eq!(args, vec!["ls-tree", "--name-only", "-d", "HEAD"]);
        assert!(!args.contains(&"-r"));
    }

    #[test]
    fn test_build_ls_tree_args_depth_gt_1() {
        let args = build_ls_tree_args(3);
        assert_eq!(args, vec!["ls-tree", "--name-only", "-d", "-r", "HEAD"]);
    }

    // -----------------------------------------------------------------------
    // mime_for_extension
    // -----------------------------------------------------------------------

    #[test]
    fn test_mime_for_extension_known_types() {
        assert_eq!(mime_for_extension("png"), "image/png");
        assert_eq!(mime_for_extension("jpg"), "image/jpeg");
        assert_eq!(mime_for_extension("jpeg"), "image/jpeg");
        assert_eq!(mime_for_extension("gif"), "image/gif");
        assert_eq!(mime_for_extension("webp"), "image/webp");
        assert_eq!(mime_for_extension("svg"), "image/svg+xml");
        assert_eq!(mime_for_extension("bmp"), "image/bmp");
        assert_eq!(mime_for_extension("ico"), "image/x-icon");
        assert_eq!(mime_for_extension("tiff"), "image/tiff");
        assert_eq!(mime_for_extension("tif"), "image/tiff");
        assert_eq!(mime_for_extension("avif"), "image/avif");
    }

    #[test]
    fn test_mime_for_extension_unknown() {
        assert_eq!(mime_for_extension("xyz"), "application/octet-stream");
        assert_eq!(mime_for_extension(""), "application/octet-stream");
    }

    // -----------------------------------------------------------------------
    // extension_for_mime
    // -----------------------------------------------------------------------

    #[test]
    fn test_extension_for_mime_known_types() {
        assert_eq!(extension_for_mime("image/png"), "png");
        assert_eq!(extension_for_mime("image/jpeg"), "jpg");
        assert_eq!(extension_for_mime("image/gif"), "gif");
        assert_eq!(extension_for_mime("image/webp"), "webp");
        assert_eq!(extension_for_mime("image/bmp"), "bmp");
        assert_eq!(extension_for_mime("image/svg+xml"), "svg");
    }

    #[test]
    fn test_extension_for_mime_unknown_defaults_to_png() {
        assert_eq!(extension_for_mime("application/octet-stream"), "png");
        assert_eq!(extension_for_mime("image/heic"), "png");
    }

    // -----------------------------------------------------------------------
    // collect_dts_files
    // -----------------------------------------------------------------------

    #[test]
    fn test_collect_dts_files_basic() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create a .d.ts file
        std::fs::write(root.join("index.d.ts"), "declare const x: number;").unwrap();
        // Create a non-.d.ts file (should be ignored)
        std::fs::write(root.join("index.ts"), "const x = 1;").unwrap();

        let mut libs = Vec::new();
        let mut total_size = 0usize;
        collect_dts_files(root, root, &mut libs, &mut total_size, 0);

        assert_eq!(libs.len(), 1);
        assert_eq!(libs[0].file_path, "index.d.ts");
        assert_eq!(libs[0].content, "declare const x: number;");
        assert_eq!(total_size, "declare const x: number;".len());
    }

    #[test]
    fn test_collect_dts_files_respects_depth_limit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create nested dirs 5 deep (beyond depth limit of 4)
        let mut current = root.to_path_buf();
        for i in 0..6 {
            current = current.join(format!("d{}", i));
            std::fs::create_dir_all(&current).unwrap();
            std::fs::write(current.join("types.d.ts"), "type T = any;").unwrap();
        }

        let mut libs = Vec::new();
        let mut total_size = 0usize;
        collect_dts_files(root, root, &mut libs, &mut total_size, 0);

        // Depth limit is 4, so we should get files at depths 0-4 but not 5
        // (depth 0 = root, the function checks depth > 4)
        assert!(libs.len() <= 5);
    }

    #[test]
    fn test_collect_dts_files_respects_size_limit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // Create a file larger than MAX_DTS_FILE_SIZE (500KB)
        let large_content = "x".repeat(600_000);
        std::fs::write(root.join("big.d.ts"), &large_content).unwrap();
        std::fs::write(root.join("small.d.ts"), "type T = any;").unwrap();

        let mut libs = Vec::new();
        let mut total_size = 0usize;
        collect_dts_files(root, root, &mut libs, &mut total_size, 0);

        // Only the small file should be collected
        assert_eq!(libs.len(), 1);
        assert_eq!(libs[0].file_path, "small.d.ts");
    }

    // -----------------------------------------------------------------------
    // save_clipboard_image (async, existing tests preserved)
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Async command wrapper tests (using mock_app_with_state)
    // -----------------------------------------------------------------------

    use tauri::Manager;

    fn setup_git_state() -> (
        tauri::App<tauri::test::MockRuntime>,
        tempfile::TempDir,
        Uuid,
        Uuid,
    ) {
        let app = test_helpers::mock_app_with_state();
        let state = app.state::<crate::state::AppState>();
        let (_dir, path) = test_helpers::create_temp_git_repo();
        let repo_id = Uuid::new_v4();
        let ws_id = Uuid::new_v4();
        {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let mut repo = test_helpers::test_repo();
            repo.id = repo_id;
            repo.path = path.clone();
            db.insert_repository(&repo).unwrap();
            let mut ws = test_helpers::test_workspace(repo_id);
            ws.id = ws_id;
            ws.worktree_path = path.clone();
            db.insert_workspace(&ws).unwrap();
            state.repositories.write().unwrap().insert(repo_id, repo);
            state.workspaces.write().unwrap().insert(ws_id, ws);
        }
        (app, _dir, repo_id, ws_id)
    }

    #[tokio::test]
    async fn test_cmd_list_repo_directories() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_directories(state, repo_id.to_string(), None).await;
        // Should succeed (may return empty if no subdirs)
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_list_repo_directories_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_directories(state, "bad-id".to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_list_workspace_files() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_workspace_files(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        let files = result.unwrap();
        assert!(files.iter().any(|f| f == "README.md"));
    }

    #[tokio::test]
    async fn test_cmd_list_workspace_files_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_workspace_files(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_list_repo_files() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_files(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let files = result.unwrap();
        assert!(files.iter().any(|f| f == "README.md"));
    }

    #[tokio::test]
    async fn test_cmd_get_git_log() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_git_log(state, ws_id.to_string(), Some(10)).await;
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert!(!entries.is_empty());
        assert_eq!(entries[0].message, "Initial commit");
    }

    #[tokio::test]
    async fn test_cmd_get_git_log_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_git_log(state, Uuid::new_v4().to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_read_workspace_file() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_workspace_file(state, ws_id.to_string(), "README.md".to_string()).await;
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.content.contains("# Test"));
        assert_eq!(content.language, "markdown");
    }

    #[tokio::test]
    async fn test_cmd_read_repo_file() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_repo_file(state, repo_id.to_string(), "README.md".to_string()).await;
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.content.contains("# Test"));
    }

    #[tokio::test]
    async fn test_cmd_read_workspace_file_not_found() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_workspace_file(state, ws_id.to_string(), "nonexistent.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_diff() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_diff(state, ws_id.to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_file_diff() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_diff(state, ws_id.to_string(), "README.md".to_string()).await;
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // get_repo_diff / get_repo_file_diff
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_get_repo_diff() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_diff(state, repo_id.to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_diff_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_diff(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_diff_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_diff(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_diff() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_diff(state, repo_id.to_string(), "README.md".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_diff_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_diff(state, "not-uuid".to_string(), "README.md".to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // get_file_patch / get_repo_file_patch
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_get_file_patch() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_patch(state, ws_id.to_string(), "README.md".to_string(), None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_file_patch_untracked() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        // Create an untracked file
        {
            let app_state = app.state::<crate::state::AppState>();
            let workspaces = app_state.workspaces.read().unwrap();
            let ws = workspaces.get(&ws_id).unwrap();
            std::fs::write(ws.worktree_path.join("untracked.txt"), "hello").unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_patch(state, ws_id.to_string(), "untracked.txt".to_string(), Some(true)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_file_patch_invalid_ws() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_patch(state, "bad".to_string(), "README.md".to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_file_patch_ws_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_patch(state, Uuid::new_v4().to_string(), "README.md".to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_patch() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_patch(state, repo_id.to_string(), "README.md".to_string(), None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_patch_untracked() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        {
            let app_state = app.state::<crate::state::AppState>();
            let repos = app_state.repositories.read().unwrap();
            let repo = repos.get(&repo_id).unwrap();
            std::fs::write(repo.path.join("new-file.txt"), "new content").unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_patch(state, repo_id.to_string(), "new-file.txt".to_string(), Some(true)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_patch_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_patch(state, "nope".to_string(), "file.txt".to_string(), None).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // write_workspace_file / write_repo_file
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_write_workspace_file() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_workspace_file(
            state,
            ws_id.to_string(),
            "new-file.txt".to_string(),
            "hello world".to_string(),
            false,
        )
        .await;
        assert!(result.is_ok());
        let write_result = result.unwrap();
        assert_eq!(write_result.content, "hello world");
        assert!(!write_result.formatted);

        // Read it back
        let state2: State<'_, crate::state::AppState> = app.state();
        let read_result = read_workspace_file(state2, ws_id.to_string(), "new-file.txt".to_string()).await;
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap().content, "hello world");
    }

    #[tokio::test]
    async fn test_cmd_write_workspace_file_invalid_ws() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_workspace_file(
            state,
            "bad".to_string(),
            "file.txt".to_string(),
            "content".to_string(),
            false,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_write_workspace_file_traversal_blocked() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_workspace_file(
            state,
            ws_id.to_string(),
            "../escape.txt".to_string(),
            "content".to_string(),
            false,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_write_repo_file() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_repo_file(
            state,
            repo_id.to_string(),
            "new-repo-file.txt".to_string(),
            "repo content".to_string(),
            false,
        )
        .await;
        assert!(result.is_ok());
        let write_result = result.unwrap();
        assert_eq!(write_result.content, "repo content");
        assert!(!write_result.formatted);

        // Read it back
        let state2: State<'_, crate::state::AppState> = app.state();
        let read_result = read_repo_file(state2, repo_id.to_string(), "new-repo-file.txt".to_string()).await;
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap().content, "repo content");
    }

    #[tokio::test]
    async fn test_cmd_write_repo_file_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_repo_file(
            state,
            "bad".to_string(),
            "file.txt".to_string(),
            "content".to_string(),
            false,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_write_repo_file_traversal_blocked() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_repo_file(
            state,
            repo_id.to_string(),
            "../escape.txt".to_string(),
            "content".to_string(),
            false,
        )
        .await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // get_git_log — various parameters
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_get_git_log_default_count() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        // None for max_count should default to 100
        let result = get_git_log(state, ws_id.to_string(), None).await;
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert!(!entries.is_empty());
    }

    #[tokio::test]
    async fn test_cmd_get_git_log_small_count() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_git_log(state, ws_id.to_string(), Some(1)).await;
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].message, "Initial commit");
    }

    #[tokio::test]
    async fn test_cmd_get_git_log_zero_count() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_git_log(state, ws_id.to_string(), Some(0)).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_cmd_get_git_log_invalid_ws() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_git_log(state, "bad-uuid".to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_git_log_multiple_commits() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        // Add a second commit
        {
            let app_state = app.state::<crate::state::AppState>();
            let workspaces = app_state.workspaces.read().unwrap();
            let ws = workspaces.get(&ws_id).unwrap();
            std::fs::write(ws.worktree_path.join("second.txt"), "second").unwrap();
            std::process::Command::new("git")
                .args(["add", "."])
                .current_dir(&ws.worktree_path)
                .output()
                .unwrap();
            std::process::Command::new("git")
                .args(["commit", "-m", "Second commit"])
                .current_dir(&ws.worktree_path)
                .output()
                .unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_git_log(state, ws_id.to_string(), Some(10)).await;
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].message, "Second commit");
        assert_eq!(entries[1].message, "Initial commit");
    }

    // -----------------------------------------------------------------------
    // read_file_base64
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_read_file_base64_text() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("hello.txt");
        std::fs::write(&file_path, "hello").unwrap();
        let result = read_file_base64(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let data_url = result.unwrap();
        assert!(data_url.starts_with("data:application/octet-stream;base64,"));
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_png() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("image.png");
        std::fs::write(&file_path, &[0x89, 0x50, 0x4E, 0x47]).unwrap();
        let result = read_file_base64(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let data_url = result.unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_nonexistent() {
        let result = read_file_base64("/tmp/nonexistent-file-9999.png".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jpg");
        let original = vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4];
        std::fs::write(&file_path, &original).unwrap();
        let result = read_file_base64(file_path.to_string_lossy().to_string()).await.unwrap();
        assert!(result.starts_with("data:image/jpeg;base64,"));
        // Decode the base64 back and verify
        let b64_data = result.strip_prefix("data:image/jpeg;base64,").unwrap();
        let decoded = base64::engine::general_purpose::STANDARD.decode(b64_data).unwrap();
        assert_eq!(decoded, original);
    }

    // -----------------------------------------------------------------------
    // save_clipboard_image — additional tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_save_clipboard_image_webp_extension() {
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let result = save_clipboard_image(png_b64.to_string(), "image/webp".to_string()).await;
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.ends_with(".webp"));
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn test_save_clipboard_image_unknown_mime_defaults_to_png() {
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let result = save_clipboard_image(png_b64.to_string(), "image/heic".to_string()).await;
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.ends_with(".png"));
        let _ = std::fs::remove_file(&path);
    }

    // -----------------------------------------------------------------------
    // load_type_definitions
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_load_type_definitions_with_workspace() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, Some(ws_id.to_string()), None).await;
        assert!(result.is_ok());
        let td = result.unwrap();
        // No tsconfig.json or node_modules in temp git repo
        assert!(td.tsconfig.is_none());
        assert!(td.libs.is_empty());
    }

    #[tokio::test]
    async fn test_cmd_load_type_definitions_with_repo() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, None, Some(repo_id.to_string())).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_load_type_definitions_neither() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, None, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_load_type_definitions_invalid_ws() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, Some("bad".to_string()), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_load_type_definitions_ws_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, Some(Uuid::new_v4().to_string()), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_load_type_definitions_with_tsconfig() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        // Create tsconfig.json in the worktree
        {
            let app_state = app.state::<crate::state::AppState>();
            let workspaces = app_state.workspaces.read().unwrap();
            let ws = workspaces.get(&ws_id).unwrap();
            std::fs::write(
                ws.worktree_path.join("tsconfig.json"),
                r#"{"compilerOptions":{"strict":true}}"#,
            )
            .unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, Some(ws_id.to_string()), None).await;
        assert!(result.is_ok());
        let td = result.unwrap();
        assert!(td.tsconfig.is_some());
        assert!(td.tsconfig.unwrap().contains("strict"));
    }

    #[tokio::test]
    async fn test_cmd_load_type_definitions_with_dts_files() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        // Create node_modules/@types dir with a .d.ts file
        {
            let app_state = app.state::<crate::state::AppState>();
            let repos = app_state.repositories.read().unwrap();
            let repo = repos.get(&repo_id).unwrap();
            let types_dir = repo.path.join("node_modules/@types/node");
            std::fs::create_dir_all(&types_dir).unwrap();
            std::fs::write(types_dir.join("index.d.ts"), "declare module 'node';").unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = load_type_definitions(state, None, Some(repo_id.to_string())).await;
        assert!(result.is_ok());
        let td = result.unwrap();
        assert!(!td.libs.is_empty());
        assert!(td.libs[0].content.contains("declare module"));
    }

    // -----------------------------------------------------------------------
    // start_diff_watcher / stop_diff_watcher — error paths
    // (These need AppHandle which mock_app_with_state doesn't provide
    // directly to the command, so we test error paths for invalid IDs)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_stop_diff_watcher_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = stop_diff_watcher(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_stop_diff_watcher_no_watcher() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        // Valid UUID but no watcher registered — should succeed (noop)
        let result = stop_diff_watcher(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // list_repo_directories — depth variants
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_list_repo_directories_with_depth() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_directories(state, repo_id.to_string(), Some(3)).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_list_repo_directories_repo_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_directories(state, Uuid::new_v4().to_string(), None).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // list_repo_files — error paths
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_list_repo_files_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_files(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_list_repo_files_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_repo_files(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // read_repo_file — error paths
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_read_repo_file_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_repo_file(state, "bad".to_string(), "file.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_read_repo_file_not_found() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_repo_file(state, repo_id.to_string(), "nonexistent.txt".to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // write then overwrite roundtrip
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_write_workspace_file_overwrite() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();

        // Write initial content
        let state: State<'_, crate::state::AppState> = app.state();
        write_workspace_file(
            state,
            ws_id.to_string(),
            "overwrite.txt".to_string(),
            "first".to_string(),
            false,
        )
        .await
        .unwrap();

        // Overwrite
        let state2: State<'_, crate::state::AppState> = app.state();
        let result = write_workspace_file(
            state2,
            ws_id.to_string(),
            "overwrite.txt".to_string(),
            "second".to_string(),
            false,
        )
        .await
        .unwrap();
        assert_eq!(result.content, "second");

        // Read back
        let state3: State<'_, crate::state::AppState> = app.state();
        let read = read_workspace_file(state3, ws_id.to_string(), "overwrite.txt".to_string()).await.unwrap();
        assert_eq!(read.content, "second");
    }

    // -----------------------------------------------------------------------
    // get_diff with modifications
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_get_diff_with_changes() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        // Modify a tracked file
        {
            let app_state = app.state::<crate::state::AppState>();
            let workspaces = app_state.workspaces.read().unwrap();
            let ws = workspaces.get(&ws_id).unwrap();
            std::fs::write(ws.worktree_path.join("README.md"), "# Modified\n").unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_diff(state, ws_id.to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_diff_invalid_ws() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_diff(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Additional coverage tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_get_file_diff_invalid_ws() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_diff(state, "bad".to_string(), "file.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_file_diff_ws_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_diff(state, Uuid::new_v4().to_string(), "file.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_list_workspace_files_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = list_workspace_files(state, "bad".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_read_workspace_file_invalid_id() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_workspace_file(state, "bad".to_string(), "file.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_diff_ws_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_diff(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_write_workspace_file_ws_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_workspace_file(
            state,
            Uuid::new_v4().to_string(),
            "file.txt".to_string(),
            "content".to_string(),
            false,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_write_repo_file_repo_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = write_repo_file(
            state,
            Uuid::new_v4().to_string(),
            "file.txt".to_string(),
            "content".to_string(),
            false,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_diff_repo_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_diff(state, Uuid::new_v4().to_string(), "README.md".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_patch_repo_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_patch(state, Uuid::new_v4().to_string(), "file.txt".to_string(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_get_file_diff_with_modified_file() {
        let (app, _dir, _repo_id, ws_id) = setup_git_state();
        // Modify a tracked file
        {
            let app_state = app.state::<crate::state::AppState>();
            let workspaces = app_state.workspaces.read().unwrap();
            let ws = workspaces.get(&ws_id).unwrap();
            std::fs::write(ws.worktree_path.join("README.md"), "# Changed content\n").unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_file_diff(state, ws_id.to_string(), "README.md".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_get_repo_file_diff_with_modified_file() {
        let (app, _dir, repo_id, _ws_id) = setup_git_state();
        {
            let app_state = app.state::<crate::state::AppState>();
            let repos = app_state.repositories.read().unwrap();
            let repo = repos.get(&repo_id).unwrap();
            std::fs::write(repo.path.join("README.md"), "# Changed\n").unwrap();
        }
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_repo_file_diff(state, repo_id.to_string(), "README.md".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_stop_diff_watcher_valid_uuid_no_watcher() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = stop_diff_watcher(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_resolve_file_path_nonexistent_nested() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        let result = resolve_file_path(&path, "deeply/nested/nonexistent.txt");
        // File doesn't exist
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_new_file_path_nested_dirs() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        // Create a subdirectory first
        std::fs::create_dir_all(path.join("subdir")).unwrap();
        let result = resolve_new_file_path(&path, "subdir/new-file.txt");
        assert!(result.is_ok());
    }
}
