use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::platform;
use crate::services::diff as diff_svc;
use crate::state::AppState;
use base64::Engine;
use tauri::State;
use uuid::Uuid;

#[derive(serde::Serialize, Debug, Clone, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResult {
    pub content: String,
    pub language: String,
    pub formatted: bool,
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
#[specta::specta]
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
#[specta::specta]
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

/// Read an arbitrary file and return its contents as a base64 data URL.
/// Used for displaying dropped image previews in the chat UI.
#[tauri::command]
#[specta::specta]
pub async fn read_file_base64(
    state: State<'_, AppState>,
    file_path: String,
) -> Result<String, AppError> {
    // Build set of allowed root paths from repositories and workspaces
    use crate::services::path_validation::{reject_sensitive_paths, validate_path_within_root};

    let path = PathBuf::from(&file_path);

    // Reject sensitive directories unconditionally
    reject_sensitive_paths(&path)?;

    // Collect allowed roots: repo paths, workspace worktree paths, and temp dir
    let mut allowed_roots: Vec<PathBuf> = Vec::new();

    {
        let repos = state.repositories.read().map_err(|_| {
            AppError::GitError("Repository state corrupted (lock poisoned)".to_string())
        })?;
        for repo in repos.values() {
            allowed_roots.push(repo.path.clone());
        }
    }
    {
        let workspaces = state.workspaces.read().map_err(|_| {
            AppError::GitError("Workspace state corrupted (lock poisoned)".to_string())
        })?;
        for ws in workspaces.values() {
            allowed_roots.push(ws.worktree_path.clone());
        }
    }
    allowed_roots.push(std::env::temp_dir());

    // Validate the path is within at least one allowed root
    let mut allowed = false;
    for root in &allowed_roots {
        if validate_path_within_root(&path, root).is_ok() {
            allowed = true;
            break;
        }
    }
    if !allowed {
        return Err(AppError::PathTraversal(format!(
            "path '{}' is not within any known repository, workspace, or temp directory",
            file_path
        )));
    }

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
#[specta::specta]
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::file_viewer::read_workspace_file;
    use crate::commands::file_viewer::read_repo_file;
    use crate::test_helpers;
    use tauri::Manager;

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
    // save_clipboard_image
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
    // read_file_base64
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_read_file_base64_text() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("hello.txt");
        std::fs::write(&file_path, "hello").unwrap();
        let result = read_file_base64(state, file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let data_url = result.unwrap();
        assert!(data_url.starts_with("data:application/octet-stream;base64,"));
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_png() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("image.png");
        std::fs::write(&file_path, &[0x89, 0x50, 0x4E, 0x47]).unwrap();
        let result = read_file_base64(state, file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let data_url = result.unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_nonexistent() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_file_base64(state, "/tmp/nonexistent-file-9999.png".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_roundtrip() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jpg");
        let original = vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4];
        std::fs::write(&file_path, &original).unwrap();
        let result = read_file_base64(state, file_path.to_string_lossy().to_string()).await.unwrap();
        assert!(result.starts_with("data:image/jpeg;base64,"));
        // Decode the base64 back and verify
        let b64_data = result.strip_prefix("data:image/jpeg;base64,").unwrap();
        let decoded = base64::engine::general_purpose::STANDARD.decode(b64_data).unwrap();
        assert_eq!(decoded, original);
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_path_traversal_rejected() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = read_file_base64(state, "/etc/passwd".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not within any known"));
    }

    #[tokio::test]
    async fn test_cmd_read_file_base64_sensitive_dir_rejected() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        if let Some(home) = dirs::home_dir() {
            let ssh_path = home.join(".ssh/id_rsa");
            let result = read_file_base64(state, ssh_path.to_string_lossy().to_string()).await;
            assert!(result.is_err());
        }
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

    #[test]
    fn test_resolve_new_file_path_nested_dirs() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        // Create a subdirectory first
        std::fs::create_dir_all(path.join("subdir")).unwrap();
        let result = resolve_new_file_path(&path, "subdir/new-file.txt");
        assert!(result.is_ok());
    }
}
