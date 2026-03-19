use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::models::mcp::{IndexingState, IndexingStatus};
use crate::models::repository::Repository;
use crate::models::settings::ClaudeContextSettings;
use crate::platform;
use crate::services::claude_context as ctx_svc;
use crate::services::provider as provider_svc;
use crate::services::worktree;
use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

/// Parse a repo ID string, returning AppError::RepoNotFound on failure.
pub(crate) fn parse_repo_id(id_str: &str) -> Result<Uuid, AppError> {
    id_str
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))
}

/// Build a Repository struct from detected git information.
/// Does NOT do any I/O; all parameters are pre-resolved.
pub(crate) fn build_repository(
    path: PathBuf,
    name: String,
    default_branch: String,
    current_branch: Option<String>,
    provider: crate::models::repository::GitProvider,
    remote_url: Option<String>,
) -> Repository {
    Repository {
        id: Uuid::new_v4(),
        name,
        path,
        default_branch,
        current_branch,
        provider,
        remote_url,
    }
}

/// Persist a repository to DB and in-memory state.
#[cfg(test)]
pub(crate) fn persist_repository(
    db: &crate::db::Database,
    repos: &mut HashMap<Uuid, Repository>,
    repo: &Repository,
) -> Result<(), AppError> {
    db.insert_repository(repo)?;
    repos.insert(repo.id, repo.clone());
    Ok(())
}

/// Remove a repository from DB and in-memory state.
#[cfg(test)]
pub(crate) fn remove_repository_inner(
    db: &crate::db::Database,
    repos: &mut HashMap<Uuid, Repository>,
    id: Uuid,
) -> Result<(), AppError> {
    db.delete_repository(&id)?;
    repos.remove(&id);
    Ok(())
}

/// List all repositories from an in-memory map.
#[cfg(test)]
pub(crate) fn list_repositories_inner(
    repos: &HashMap<Uuid, Repository>,
) -> Vec<Repository> {
    repos.values().cloned().collect()
}

/// List all repositories from the database.
#[cfg(test)]
pub(crate) fn list_repositories_from_db(
    db: &crate::db::Database,
) -> Result<Vec<Repository>, AppError> {
    db.list_repositories()
}

/// Extract repo name from a path.
pub(crate) fn repo_name_from_path(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Parse git branch output into a Vec of branch names.
pub(crate) fn parse_branch_output(output: &str) -> Vec<String> {
    output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

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
    let (name, default_branch, current_branch, provider, remote_url) =
        tokio::task::spawn_blocking(move || -> Result<_, AppError> {
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
            let (provider, remote_url) = provider_svc::detect_provider(&path);

            Ok((name, default_branch, current_branch, provider, remote_url))
        })
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

    let path = PathBuf::from(&path);
    let repo = build_repository(path.clone(), name, default_branch, current_branch, provider, remote_url);

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

    // Auto-detect devcontainer.json — pre-populate repo settings if found
    if let Some(dc_path) = crate::services::devcontainer::detect_devcontainer_json(&path) {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            let mut settings = db.get_repo_settings(&repo.id).unwrap_or_default();
            if settings.devcontainer.is_none() {
                settings.devcontainer = Some(crate::models::devcontainer::DevContainerConfig {
                    enabled: false,
                    devcontainer_path: Some(dc_path),
                    ..Default::default()
                });
                let _ = db.upsert_repo_settings(&repo.id, &settings);
            }
        }
    }

    Ok(repo)
}

#[tauri::command]
pub async fn remove_repository(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<(), AppError> {
    let id = parse_repo_id(&repo_id)?;

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
    let id = parse_repo_id(&repo_id)?;

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

        let branches = parse_branch_output(&String::from_utf8_lossy(&output.stdout));

        Ok(branches)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Helper to register a local git repo path into state + DB.
fn register_repository(state: &State<'_, AppState>, path: PathBuf) -> Result<Repository, AppError> {
    let name = repo_name_from_path(&path);
    let default_branch = worktree::detect_default_branch(&path);
    let current_branch = detect_current_branch(&path);
    let (provider, remote_url) = provider_svc::detect_provider(&path);

    let repo = build_repository(path, name, default_branch, current_branch, provider, remote_url);

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::repository::GitProvider;
    use crate::test_helpers::*;

    // -----------------------------------------------------------------------
    // parse_repo_id
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_repo_id_valid() {
        let id = Uuid::new_v4();
        let result = parse_repo_id(&id.to_string()).unwrap();
        assert_eq!(result, id);
    }

    #[test]
    fn test_parse_repo_id_invalid() {
        let result = parse_repo_id("bad-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_repo_id_empty() {
        let result = parse_repo_id("");
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // repo_name_from_path
    // -----------------------------------------------------------------------

    #[test]
    fn test_repo_name_from_path_normal() {
        let p = PathBuf::from("/home/user/repos/my-project");
        assert_eq!(repo_name_from_path(&p), "my-project");
    }

    #[test]
    fn test_repo_name_from_path_root() {
        let p = PathBuf::from("/");
        assert_eq!(repo_name_from_path(&p), "unknown");
    }

    #[test]
    fn test_repo_name_from_path_nested() {
        let p = PathBuf::from("/a/b/c/d/deep-repo");
        assert_eq!(repo_name_from_path(&p), "deep-repo");
    }

    #[test]
    fn test_repo_name_from_path_with_dots() {
        let p = PathBuf::from("/home/user/my.project.name");
        assert_eq!(repo_name_from_path(&p), "my.project.name");
    }

    // -----------------------------------------------------------------------
    // parse_branch_output
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_branch_output_normal() {
        let output = "main\nfeature/foo\nbugfix/bar\n";
        let branches = parse_branch_output(output);
        assert_eq!(branches, vec!["main", "feature/foo", "bugfix/bar"]);
    }

    #[test]
    fn test_parse_branch_output_with_whitespace() {
        let output = "  main  \n  develop  \n\n";
        let branches = parse_branch_output(output);
        assert_eq!(branches, vec!["main", "develop"]);
    }

    #[test]
    fn test_parse_branch_output_empty() {
        let branches = parse_branch_output("");
        assert!(branches.is_empty());
    }

    #[test]
    fn test_parse_branch_output_single_branch() {
        let branches = parse_branch_output("main\n");
        assert_eq!(branches, vec!["main"]);
    }

    #[test]
    fn test_parse_branch_output_many_blank_lines() {
        let output = "\n\n\nmain\n\n\ndevelop\n\n\n";
        let branches = parse_branch_output(output);
        assert_eq!(branches, vec!["main", "develop"]);
    }

    // -----------------------------------------------------------------------
    // build_repository
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_repository() {
        let path = PathBuf::from("/tmp/test");
        let repo = build_repository(
            path.clone(),
            "test".to_string(),
            "main".to_string(),
            Some("develop".to_string()),
            GitProvider::GitHub,
            Some("https://github.com/test/test".to_string()),
        );
        assert_eq!(repo.name, "test");
        assert_eq!(repo.path, path);
        assert_eq!(repo.default_branch, "main");
        assert_eq!(repo.current_branch, Some("develop".to_string()));
        assert_eq!(repo.provider, GitProvider::GitHub);
        assert_eq!(
            repo.remote_url,
            Some("https://github.com/test/test".to_string())
        );
    }

    #[test]
    fn test_build_repository_no_remote() {
        let path = PathBuf::from("/tmp/local-only");
        let repo = build_repository(
            path.clone(),
            "local-only".to_string(),
            "main".to_string(),
            None,
            GitProvider::Unknown,
            None,
        );
        assert_eq!(repo.name, "local-only");
        assert!(repo.current_branch.is_none());
        assert_eq!(repo.provider, GitProvider::Unknown);
        assert!(repo.remote_url.is_none());
    }

    #[test]
    fn test_build_repository_azure_devops() {
        let path = PathBuf::from("/tmp/ado-repo");
        let repo = build_repository(
            path,
            "ado-repo".to_string(),
            "main".to_string(),
            Some("feature/work-item-123".to_string()),
            GitProvider::AzureDevOps,
            Some("https://dev.azure.com/org/project/_git/repo".to_string()),
        );
        assert_eq!(repo.provider, GitProvider::AzureDevOps);
        assert_eq!(
            repo.current_branch,
            Some("feature/work-item-123".to_string())
        );
    }

    #[test]
    fn test_build_repository_generates_unique_ids() {
        let repo1 = build_repository(
            PathBuf::from("/tmp/a"),
            "a".to_string(),
            "main".to_string(),
            None,
            GitProvider::Unknown,
            None,
        );
        let repo2 = build_repository(
            PathBuf::from("/tmp/b"),
            "b".to_string(),
            "main".to_string(),
            None,
            GitProvider::Unknown,
            None,
        );
        assert_ne!(repo1.id, repo2.id);
    }

    // -----------------------------------------------------------------------
    // persist_repository + remove_repository_inner (DB roundtrip)
    // -----------------------------------------------------------------------

    #[test]
    fn test_persist_and_remove_repository() {
        let db = test_db();
        let mut repos = HashMap::new();

        let repo = test_repo();
        let id = repo.id;

        persist_repository(&db, &mut repos, &repo).unwrap();
        assert!(repos.contains_key(&id));

        // Verify DB persistence
        let db_repos = db.list_repositories().unwrap();
        assert!(db_repos.iter().any(|r| r.id == id));

        // Remove
        remove_repository_inner(&db, &mut repos, id).unwrap();
        assert!(!repos.contains_key(&id));

        // Verify removed from DB
        let db_repos_after = db.list_repositories().unwrap();
        assert!(!db_repos_after.iter().any(|r| r.id == id));
    }

    #[test]
    fn test_persist_multiple_repositories() {
        let db = test_db();
        let mut repos = HashMap::new();

        let repo1 = test_repo();
        let repo2 = {
            let mut r = test_repo();
            r.name = "second-repo".to_string();
            r.path = PathBuf::from("/tmp/second-repo");
            r
        };
        let repo3 = {
            let mut r = test_repo();
            r.name = "third-repo".to_string();
            r.path = PathBuf::from("/tmp/third-repo");
            r
        };

        persist_repository(&db, &mut repos, &repo1).unwrap();
        persist_repository(&db, &mut repos, &repo2).unwrap();
        persist_repository(&db, &mut repos, &repo3).unwrap();

        assert_eq!(repos.len(), 3);
        let db_repos = db.list_repositories().unwrap();
        assert_eq!(db_repos.len(), 3);
    }

    #[test]
    fn test_remove_nonexistent_repository() {
        let db = test_db();
        let mut repos = HashMap::new();

        // Removing a repo that doesn't exist should not error
        let result = remove_repository_inner(&db, &mut repos, Uuid::new_v4());
        assert!(result.is_ok());
    }

    #[test]
    fn test_remove_only_target_repository() {
        let db = test_db();
        let mut repos = HashMap::new();

        let repo1 = test_repo();
        let repo2 = {
            let mut r = test_repo();
            r.name = "other".to_string();
            r.path = PathBuf::from("/tmp/other");
            r
        };

        persist_repository(&db, &mut repos, &repo1).unwrap();
        persist_repository(&db, &mut repos, &repo2).unwrap();

        remove_repository_inner(&db, &mut repos, repo1.id).unwrap();

        assert_eq!(repos.len(), 1);
        assert!(repos.contains_key(&repo2.id));

        let db_repos = db.list_repositories().unwrap();
        assert_eq!(db_repos.len(), 1);
        assert_eq!(db_repos[0].id, repo2.id);
    }

    // -----------------------------------------------------------------------
    // list_repositories_inner (in-memory)
    // -----------------------------------------------------------------------

    #[test]
    fn test_list_repositories_inner_empty() {
        let repos = HashMap::new();
        let result = list_repositories_inner(&repos);
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_repositories_inner_multiple() {
        let mut repos = HashMap::new();
        let repo1 = test_repo();
        let repo2 = {
            let mut r = test_repo();
            r.name = "second".to_string();
            r
        };
        repos.insert(repo1.id, repo1.clone());
        repos.insert(repo2.id, repo2.clone());

        let result = list_repositories_inner(&repos);
        assert_eq!(result.len(), 2);
        let ids: Vec<Uuid> = result.iter().map(|r| r.id).collect();
        assert!(ids.contains(&repo1.id));
        assert!(ids.contains(&repo2.id));
    }

    // -----------------------------------------------------------------------
    // list_repositories_from_db
    // -----------------------------------------------------------------------

    #[test]
    fn test_list_repositories_from_db_empty() {
        let db = test_db();
        let result = list_repositories_from_db(&db).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_repositories_from_db_roundtrip() {
        let db = test_db();
        let mut repos = HashMap::new();

        let repo = test_repo();
        persist_repository(&db, &mut repos, &repo).unwrap();

        let db_repos = list_repositories_from_db(&db).unwrap();
        assert_eq!(db_repos.len(), 1);
        assert_eq!(db_repos[0].id, repo.id);
        assert_eq!(db_repos[0].name, repo.name);
        assert_eq!(db_repos[0].path, repo.path);
        assert_eq!(db_repos[0].default_branch, repo.default_branch);
    }

    // -----------------------------------------------------------------------
    // detect_current_branch (integration, requires git)
    // -----------------------------------------------------------------------

    #[test]
    fn test_detect_current_branch_on_real_repo() {
        let (_dir, path) = create_temp_git_repo();
        let branch = detect_current_branch(&path);
        assert_eq!(branch, Some("main".to_string()));
    }

    #[test]
    fn test_detect_current_branch_nonexistent_path() {
        let path = PathBuf::from("/nonexistent/path/that/does/not/exist");
        let branch = detect_current_branch(&path);
        assert!(branch.is_none());
    }

    // -----------------------------------------------------------------------
    // Async command wrapper tests (using mock_app_with_state)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_list_repositories_empty() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_repositories(state).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_cmd_list_repositories_with_repos() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let app_state = app.state::<crate::state::AppState>();

        let (_dir, path) = create_temp_git_repo();
        let mut repo = test_repo();
        repo.path = path;
        let repo_id = repo.id;
        app_state.repositories.write().unwrap().insert(repo_id, repo);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_repositories(state).await;
        assert!(result.is_ok());
        let repos = result.unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].id, repo_id);
        // current_branch should be detected on the real repo
        assert_eq!(repos[0].current_branch, Some("main".to_string()));
    }

    #[tokio::test]
    async fn test_cmd_add_repository_real_git_repo() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let (_dir, path) = create_temp_git_repo();

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = add_repository(state, path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let repo = result.unwrap();
        assert_eq!(repo.default_branch, "main");
        assert!(repo.name.len() > 0);

        // Verify persisted to in-memory state
        let app_state = app.state::<crate::state::AppState>();
        let repos = app_state.repositories.read().unwrap();
        assert!(repos.contains_key(&repo.id));
    }

    #[tokio::test]
    async fn test_cmd_add_repository_not_a_git_repo() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let dir = tempfile::tempdir().unwrap();

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = add_repository(state, dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_list_branches() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let app_state = app.state::<crate::state::AppState>();

        let (_dir, path) = create_temp_git_repo();
        let mut repo = test_repo();
        repo.path = path;
        let repo_id = repo.id;
        app_state.repositories.write().unwrap().insert(repo_id, repo);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_branches(state, repo_id.to_string()).await;
        assert!(result.is_ok());
        let branches = result.unwrap();
        assert!(branches.contains(&"main".to_string()));
    }

    #[tokio::test]
    async fn test_cmd_list_branches_repo_not_found() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_branches(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Full lifecycle test
    // -----------------------------------------------------------------------

    #[test]
    fn test_repository_full_lifecycle() {
        let db = test_db();
        let mut repos = HashMap::new();

        // Add a repo
        let repo = build_repository(
            PathBuf::from("/tmp/lifecycle-test"),
            "lifecycle-test".to_string(),
            "main".to_string(),
            Some("develop".to_string()),
            GitProvider::GitHub,
            Some("https://github.com/test/lifecycle".to_string()),
        );
        let id = repo.id;

        persist_repository(&db, &mut repos, &repo).unwrap();

        // Verify in memory
        let listed = list_repositories_inner(&repos);
        assert_eq!(listed.len(), 1);

        // Verify in DB
        let db_listed = list_repositories_from_db(&db).unwrap();
        assert_eq!(db_listed.len(), 1);
        assert_eq!(db_listed[0].provider, GitProvider::GitHub);

        // Remove
        remove_repository_inner(&db, &mut repos, id).unwrap();

        assert!(list_repositories_inner(&repos).is_empty());
        assert!(list_repositories_from_db(&db).unwrap().is_empty());
    }

    // -----------------------------------------------------------------------
    // Additional async command wrapper tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_cmd_remove_repository_success() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let app_state = app.state::<crate::state::AppState>();

        let repo = test_repo();
        let repo_id = repo.id;
        {
            let db_lock = app_state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            db.insert_repository(&repo).unwrap();
        }
        app_state.repositories.write().unwrap().insert(repo_id, repo);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = remove_repository(state, repo_id.to_string()).await;
        assert!(result.is_ok());

        // Verify removed from in-memory state
        let repos = app_state.repositories.read().unwrap();
        assert!(!repos.contains_key(&repo_id));
    }

    #[tokio::test]
    async fn test_cmd_remove_repository_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = remove_repository(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_remove_repository_nonexistent() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        // Removing a repo that doesn't exist should succeed (no-op)
        let result = remove_repository(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cmd_clone_repository_invalid_url() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("cloned");
        let result = clone_repository(
            state,
            "not-a-valid-url".to_string(),
            dest.to_string_lossy().to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_init_repository_with_temp_dir() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("new-project");

        let result = init_repository(
            state,
            dest.to_string_lossy().to_string(),
            "new-project".to_string(),
        )
        .await;
        assert!(result.is_ok());
        let repo = result.unwrap();
        assert_eq!(repo.name, "new-project");
        assert!(repo.path.exists());

        // Verify git repo was created
        assert!(dest.join(".git").exists());
        // Verify README was created
        assert!(dest.join("README.md").exists());

        // Verify persisted to in-memory state
        let app_state = app.state::<crate::state::AppState>();
        let repos = app_state.repositories.read().unwrap();
        assert!(repos.contains_key(&repo.id));
    }

    #[tokio::test]
    async fn test_cmd_list_branches_invalid_id() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = list_branches(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cmd_add_repository_invalid_path() {
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = add_repository(state, "/nonexistent/path/does/not/exist".to_string()).await;
        assert!(result.is_err());
    }
}
