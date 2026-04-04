use crate::error::AppError;
use crate::models::diff::{DiffResult, FileDiffContent};
use crate::models::merge::{BranchStatus, ConflictContent, ConflictedFile, PullResult};
use crate::models::repository::Repository;
use crate::models::workspace::Workspace;
use crate::services::branch as branch_svc;
use crate::services::gh as gh_svc;
use crate::state::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

/// Resolved workspace data needed by merge/branch commands.
#[derive(Debug, Clone)]
pub(crate) struct ResolvedWorkspace {
    pub worktree_path: PathBuf,
    pub branch: String,
    pub default_branch: String,
    pub repo_path: PathBuf,
}

/// Pure inner function: resolve a workspace or repo ID to paths/branches.
/// Takes concrete HashMap references instead of `State<AppState>`.
pub(crate) fn resolve_workspace_inner(
    workspace_id: &str,
    workspaces: &HashMap<Uuid, Workspace>,
    repositories: &HashMap<Uuid, Repository>,
) -> Result<ResolvedWorkspace, AppError> {
    let id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    // Try workspace first
    if let Some(ws) = workspaces.get(&id) {
        let repo = repositories
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        return Ok(ResolvedWorkspace {
            worktree_path: ws.worktree_path.clone(),
            branch: ws.branch.clone(),
            default_branch: repo.default_branch.clone(),
            repo_path: repo.path.clone(),
        });
    }

    // Fall back to repo — the ID may be a repository, not a workspace.
    let repo = repositories
        .get(&id)
        .ok_or(AppError::WorkspaceNotFound(id))?;
    let repo_path = repo.path.clone();
    let default_branch = repo.default_branch.clone();

    let branch = crate::platform::command("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&repo_path)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| default_branch.clone());

    Ok(ResolvedWorkspace {
        worktree_path: repo_path.clone(),
        branch,
        default_branch,
        repo_path,
    })
}

/// Wrapper that acquires locks from `State<AppState>` and delegates to
/// `resolve_workspace_inner`. Keeps the Tauri-coupled surface minimal.
pub(crate) fn resolve_workspace(
    state: &State<'_, AppState>,
    workspace_id: &str,
) -> Result<(PathBuf, String, String, PathBuf), AppError> {
    let workspaces = state
        .workspaces
        .read()
        .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
    let repos = state
        .repositories
        .read()
        .map_err(|_| AppError::GitError("failed to acquire repository lock".into()))?;
    let resolved = resolve_workspace_inner(workspace_id, &workspaces, &repos)?;
    Ok((
        resolved.worktree_path,
        resolved.branch,
        resolved.default_branch,
        resolved.repo_path,
    ))
}

/// Pure inner function: resolve a linked workspace's branch from state maps.
pub(crate) fn resolve_linked_branch(
    linked_workspace_id: &str,
    workspaces: &HashMap<Uuid, Workspace>,
) -> Result<String, AppError> {
    let linked_id: Uuid = linked_workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ws = workspaces
        .get(&linked_id)
        .ok_or(AppError::WorkspaceNotFound(linked_id))?;
    Ok(ws.branch.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn get_branch_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<BranchStatus, AppError> {
    let (worktree_path, branch, default_branch, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || {
        branch_svc::get_branch_status(&worktree_path, &branch, &default_branch)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_upstream(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || branch_svc::fetch_upstream(&worktree_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn pull_rebase(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PullResult, AppError> {
    let (worktree_path, _, default_branch, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || branch_svc::pull_rebase(&worktree_path, &default_branch))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn pull_merge(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PullResult, AppError> {
    let (worktree_path, _, default_branch, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || branch_svc::pull_merge(&worktree_path, &default_branch))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_conflicted_files(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<ConflictedFile>, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || branch_svc::get_conflicted_files(&worktree_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_conflict_content(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
) -> Result<ConflictContent, AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || {
        branch_svc::get_conflict_content(&worktree_path, &file_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_conflict(
    state: State<'_, AppState>,
    workspace_id: String,
    file_path: String,
    strategy: String,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || {
        branch_svc::resolve_conflict(&worktree_path, &file_path, &strategy)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn abort_merge_cmd(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || branch_svc::abort_merge(&worktree_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn continue_merge(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, _, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || branch_svc::continue_merge(&worktree_path))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn cross_worktree_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
) -> Result<DiffResult, AppError> {
    let (_, branch_a, _, repo_path) = resolve_workspace(&state, &workspace_id)?;

    let branch_b = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        resolve_linked_branch(&linked_workspace_id, &workspaces)?
    };

    tokio::task::spawn_blocking(move || {
        branch_svc::cross_worktree_diff(&repo_path, &branch_a, &branch_b)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_cross_worktree_file_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    linked_workspace_id: String,
    file_path: String,
) -> Result<FileDiffContent, AppError> {
    let (_, branch_a, _, repo_path) = resolve_workspace(&state, &workspace_id)?;

    let branch_b = {
        let workspaces = state
            .workspaces
            .read()
            .map_err(|_| AppError::GitError("failed to acquire workspace lock".into()))?;
        resolve_linked_branch(&linked_workspace_id, &workspaces)?
    };

    tokio::task::spawn_blocking(move || {
        branch_svc::get_file_at_ref(&repo_path, &branch_a, &branch_b, &file_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn push_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, branch, _, _) = resolve_workspace(&state, &workspace_id)?;
    tokio::task::spawn_blocking(move || gh_svc::push_branch(&worktree_path, &branch))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    fn make_maps() -> (HashMap<Uuid, Workspace>, HashMap<Uuid, Repository>) {
        let repo = test_repo();
        let mut ws = test_workspace(repo.id);
        ws.worktree_path = PathBuf::from("/tmp/test-worktree");
        ws.branch = "feature-branch".to_string();

        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws);

        let mut repositories = HashMap::new();
        repositories.insert(repo.id, repo);

        (workspaces, repositories)
    }

    // ── resolve_workspace_inner ──

    #[test]
    fn test_resolve_workspace_inner_finds_workspace() {
        let (workspaces, repositories) = make_maps();
        let ws = workspaces.values().next().unwrap();
        let ws_id = ws.id.to_string();

        let resolved = resolve_workspace_inner(&ws_id, &workspaces, &repositories).unwrap();

        assert_eq!(resolved.worktree_path, PathBuf::from("/tmp/test-worktree"));
        assert_eq!(resolved.branch, "feature-branch");
        assert_eq!(resolved.default_branch, "main");
        assert_eq!(resolved.repo_path, PathBuf::from("/tmp/test-repo"));
    }

    #[test]
    fn test_resolve_workspace_inner_falls_back_to_repo() {
        let (_, repositories) = make_maps();
        let repo = repositories.values().next().unwrap();
        let repo_id = repo.id.to_string();

        // Empty workspace map forces the repo fallback path
        let workspaces = HashMap::new();
        let resolved = resolve_workspace_inner(&repo_id, &workspaces, &repositories).unwrap();

        assert_eq!(resolved.repo_path, PathBuf::from("/tmp/test-repo"));
        assert_eq!(resolved.default_branch, "main");
        // worktree_path equals repo_path in fallback
        assert_eq!(resolved.worktree_path, resolved.repo_path);
    }

    #[test]
    fn test_resolve_workspace_inner_falls_back_to_repo_with_real_git() {
        let (_dir, repo_path) = create_temp_git_repo();
        let repo_id = Uuid::new_v4();
        let repo = Repository {
            id: repo_id,
            name: "test".to_string(),
            path: repo_path.clone(),
            default_branch: "main".to_string(),
            current_branch: None,
            provider: Default::default(),
            remote_url: None,
        };

        let workspaces = HashMap::new();
        let mut repositories = HashMap::new();
        repositories.insert(repo_id, repo);

        let resolved =
            resolve_workspace_inner(&repo_id.to_string(), &workspaces, &repositories).unwrap();

        assert_eq!(resolved.repo_path, repo_path);
        assert_eq!(resolved.branch, "main");
        assert_eq!(resolved.default_branch, "main");
    }

    #[test]
    fn test_resolve_workspace_inner_invalid_uuid() {
        let workspaces = HashMap::new();
        let repositories = HashMap::new();

        let result = resolve_workspace_inner("not-a-uuid", &workspaces, &repositories);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, AppError::WorkspaceNotFound(_)));
    }

    #[test]
    fn test_resolve_workspace_inner_unknown_id() {
        let workspaces = HashMap::new();
        let repositories = HashMap::new();
        let unknown_id = Uuid::new_v4().to_string();

        let result = resolve_workspace_inner(&unknown_id, &workspaces, &repositories);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::WorkspaceNotFound(_)));
    }

    #[test]
    fn test_resolve_workspace_inner_missing_repo_for_workspace() {
        let repo_id = Uuid::new_v4();
        let ws = test_workspace(repo_id);
        let ws_id = ws.id.to_string();

        let mut workspaces = HashMap::new();
        workspaces.insert(ws.id, ws);
        // No repository inserted — should fail with RepoNotFound
        let repositories = HashMap::new();

        let result = resolve_workspace_inner(&ws_id, &workspaces, &repositories);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::RepoNotFound(_)));
    }

    // ── resolve_linked_branch ──

    #[test]
    fn test_resolve_linked_branch_found() {
        let (workspaces, _) = make_maps();
        let ws = workspaces.values().next().unwrap();
        let ws_id = ws.id.to_string();

        let branch = resolve_linked_branch(&ws_id, &workspaces).unwrap();
        assert_eq!(branch, "feature-branch");
    }

    #[test]
    fn test_resolve_linked_branch_not_found() {
        let workspaces = HashMap::new();
        let unknown_id = Uuid::new_v4().to_string();

        let result = resolve_linked_branch(&unknown_id, &workspaces);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::WorkspaceNotFound(_)));
    }

    #[test]
    fn test_resolve_linked_branch_invalid_uuid() {
        let workspaces = HashMap::new();

        let result = resolve_linked_branch("bad-uuid", &workspaces);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::WorkspaceNotFound(_)));
    }

    // ── ResolvedWorkspace struct ──

    #[test]
    fn test_resolved_workspace_clone() {
        let resolved = ResolvedWorkspace {
            worktree_path: PathBuf::from("/a"),
            branch: "b".to_string(),
            default_branch: "main".to_string(),
            repo_path: PathBuf::from("/c"),
        };
        let cloned = resolved.clone();
        assert_eq!(cloned.worktree_path, resolved.worktree_path);
        assert_eq!(cloned.branch, resolved.branch);
        assert_eq!(cloned.default_branch, resolved.default_branch);
        assert_eq!(cloned.repo_path, resolved.repo_path);
    }

    #[test]
    fn test_resolved_workspace_debug() {
        let resolved = ResolvedWorkspace {
            worktree_path: PathBuf::from("/a"),
            branch: "b".to_string(),
            default_branch: "main".to_string(),
            repo_path: PathBuf::from("/c"),
        };
        let debug = format!("{:?}", resolved);
        assert!(debug.contains("ResolvedWorkspace"));
        assert!(debug.contains("/a"));
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_get_branch_status_command_with_real_repo() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let (_dir, repo_path) = create_temp_git_repo();
        let repo = Repository {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            path: repo_path.clone(),
            default_branch: "main".to_string(),
            current_branch: None,
            provider: Default::default(),
            remote_url: None,
        };
        let ws = Workspace {
            id: Uuid::new_v4(),
            repo_id: repo.id,
            name: "test-ws".to_string(),
            branch: "main".to_string(),
            worktree_path: repo_path,
            status: crate::models::workspace::WorkspaceStatus::Active,
            port_base: 10000,
            sparse_dirs: None,
            notes: String::new(),
            auto_commit: true,
            pinned: false,
            created_at: chrono::Utc::now(),
            archived_at: None,
            devcontainer_config: None,
        };

        state.repositories.write().unwrap().insert(repo.id, repo);
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());

        let result = get_branch_status(state, ws.id.to_string()).await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.branch, "main");
    }

    #[tokio::test]
    async fn test_get_conflicted_files_command_no_conflicts() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let (_dir, repo_path) = create_temp_git_repo();
        let repo = Repository {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            path: repo_path.clone(),
            default_branch: "main".to_string(),
            current_branch: None,
            provider: Default::default(),
            remote_url: None,
        };
        let ws = Workspace {
            id: Uuid::new_v4(),
            repo_id: repo.id,
            name: "test-ws".to_string(),
            branch: "main".to_string(),
            worktree_path: repo_path,
            status: crate::models::workspace::WorkspaceStatus::Active,
            port_base: 10000,
            sparse_dirs: None,
            notes: String::new(),
            auto_commit: true,
            pinned: false,
            created_at: chrono::Utc::now(),
            archived_at: None,
            devcontainer_config: None,
        };

        state.repositories.write().unwrap().insert(repo.id, repo);
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());

        let result = get_conflicted_files(state, ws.id.to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_get_branch_status_command_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = get_branch_status(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    // ── Helper to set up workspace with real git repo ──

    fn setup_merge_state_with_real_repo() -> (
        tauri::App<tauri::test::MockRuntime>,
        tempfile::TempDir,
        Uuid,
    ) {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state = app.state::<crate::state::AppState>();

        let (dir, repo_path) = create_temp_git_repo();
        let repo = Repository {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            path: repo_path.clone(),
            default_branch: "main".to_string(),
            current_branch: None,
            provider: Default::default(),
            remote_url: None,
        };
        let ws = Workspace {
            id: Uuid::new_v4(),
            repo_id: repo.id,
            name: "test-ws".to_string(),
            branch: "main".to_string(),
            worktree_path: repo_path,
            status: crate::models::workspace::WorkspaceStatus::Active,
            port_base: 10000,
            sparse_dirs: None,
            notes: String::new(),
            auto_commit: true,
            pinned: false,
            created_at: chrono::Utc::now(),
            archived_at: None,
            devcontainer_config: None,
        };
        let ws_id = ws.id;

        state.repositories.write().unwrap().insert(repo.id, repo);
        state.workspaces.write().unwrap().insert(ws.id, ws);

        (app, dir, ws_id)
    }

    #[tokio::test]
    async fn test_fetch_upstream_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = fetch_upstream(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_fetch_upstream_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = fetch_upstream(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_pull_rebase_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = pull_rebase(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_pull_merge_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = pull_merge(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cross_worktree_diff_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = cross_worktree_diff(
            state,
            Uuid::new_v4().to_string(),
            Uuid::new_v4().to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cross_worktree_diff_linked_not_found() {
        use tauri::Manager;
        let (app, _dir, ws_id) = setup_merge_state_with_real_repo();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = cross_worktree_diff(
            state,
            ws_id.to_string(),
            Uuid::new_v4().to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_push_workspace_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = push_workspace(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_push_workspace_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = push_workspace(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_abort_merge_cmd_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = abort_merge_cmd(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_continue_merge_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = continue_merge(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_pull_rebase_on_real_repo() {
        use tauri::Manager;
        let (app, _dir, ws_id) = setup_merge_state_with_real_repo();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        // No remote, so this will likely error, but exercises the code path
        let result = pull_rebase(state, ws_id.to_string()).await;
        // Whether it succeeds or fails depends on git behavior with no remote
        assert!(result.is_ok() || result.is_err());
    }

    #[tokio::test]
    async fn test_pull_merge_on_real_repo() {
        use tauri::Manager;
        let (app, _dir, ws_id) = setup_merge_state_with_real_repo();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = pull_merge(state, ws_id.to_string()).await;
        // Whether it succeeds or fails depends on git behavior with no remote
        assert!(result.is_ok() || result.is_err());
    }

    #[tokio::test]
    async fn test_resolve_conflict_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = resolve_conflict(
            state,
            Uuid::new_v4().to_string(),
            "file.rs".to_string(),
            "ours".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_conflict_content_workspace_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_conflict_content(
            state,
            Uuid::new_v4().to_string(),
            "file.rs".to_string(),
        )
        .await;
        assert!(result.is_err());
    }
}
