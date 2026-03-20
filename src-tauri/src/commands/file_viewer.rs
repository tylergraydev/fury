use std::path::Path;
use std::path::PathBuf;

use crate::error::AppError;
use crate::platform;
use crate::services::diff as diff_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct FileContent {
    pub content: String,
    pub language: String,
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

/// Build `git ls-tree` arguments for listing repo directories.
pub(crate) fn build_ls_tree_args(depth: u32) -> Vec<&'static str> {
    let mut args = vec!["ls-tree", "--name-only", "-d"];
    if depth > 1 {
        args.push("-r");
    }
    args.push("HEAD");
    args
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;
    use tauri::Manager;

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

    #[test]
    fn test_resolve_file_path_nonexistent_nested() {
        let (_dir, path) = test_helpers::create_temp_git_repo();
        let result = resolve_file_path(&path, "deeply/nested/nonexistent.txt");
        // File doesn't exist
        assert!(result.is_err());
    }
}
