use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent, FilePatchPreview};
use crate::platform;
use crate::services::diff as diff_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[derive(serde::Serialize, Debug, Clone, PartialEq, specta::Type)]
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

#[tauri::command]
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers;
    use tauri::Manager;

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
    async fn test_cmd_get_diff_ws_not_found() {
        let app = test_helpers::mock_app_with_state();
        let state: State<'_, crate::state::AppState> = app.state();
        let result = get_diff(state, Uuid::new_v4().to_string()).await;
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
}
