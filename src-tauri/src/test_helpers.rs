use crate::db::Database;
use crate::models::bookmark::FileBookmark;
use crate::models::chat::{ChatMessage, ContentBlock, MessageRole};
use crate::models::checkpoint::Checkpoint;
use crate::models::prompt::Prompt;
use crate::models::repository::{RepoSettings, Repository};
use crate::models::settings::AppSettings;
use crate::models::snippet::Snippet;
use crate::models::todo::TodoItem;
use crate::models::workspace::{Workspace, WorkspaceStatus};
use crate::models::workspace_template::WorkspaceTemplate;
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

/// Create an in-memory database for testing with all migrations applied.
pub fn test_db() -> Database {
    Database::init_in_memory().expect("Failed to create test database")
}

/// Create a dummy Repository for testing.
pub fn test_repo() -> Repository {
    Repository {
        id: Uuid::new_v4(),
        name: "test-repo".to_string(),
        path: PathBuf::from("/tmp/test-repo"),
        default_branch: "main".to_string(),
        current_branch: None,
        provider: Default::default(),
        remote_url: None,
    }
}

/// Create a dummy Workspace for testing. Requires a repo_id.
pub fn test_workspace(repo_id: Uuid) -> Workspace {
    Workspace {
        id: Uuid::new_v4(),
        repo_id,
        name: "test-workspace".to_string(),
        branch: "feature-branch".to_string(),
        worktree_path: PathBuf::from("/tmp/test-worktree"),
        status: WorkspaceStatus::Active,
        port_base: 10000,
        sparse_dirs: None,
        notes: String::new(),
        auto_commit: true,
        pinned: false,
        created_at: Utc::now(),
        archived_at: None,
    }
}

/// Create default AppSettings for testing.
pub fn test_settings() -> AppSettings {
    AppSettings::default()
}

/// Create default RepoSettings for testing.
pub fn test_repo_settings() -> RepoSettings {
    RepoSettings::default()
}

/// Create a real temp git repo for integration tests.
/// Returns (temp_dir, repo_path). The temp_dir must be kept alive
/// for the duration of the test.
pub fn create_temp_git_repo() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("Failed to create temp dir");
    let path = dir.path().to_path_buf();

    std::process::Command::new("git")
        .args(["init", "--initial-branch=main"])
        .current_dir(&path)
        .output()
        .expect("Failed to git init");

    std::process::Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(&path)
        .output()
        .expect("Failed to set git email");

    std::process::Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(&path)
        .output()
        .expect("Failed to set git name");

    // Create initial commit
    std::fs::write(path.join("README.md"), "# Test\n").expect("Failed to write README");
    std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&path)
        .output()
        .expect("Failed to git add");
    std::process::Command::new("git")
        .args(["commit", "-m", "Initial commit"])
        .current_dir(&path)
        .output()
        .expect("Failed to git commit");

    (dir, path)
}

/// Create a dummy Checkpoint for testing.
pub fn test_checkpoint(workspace_id: Uuid) -> Checkpoint {
    Checkpoint {
        id: Uuid::new_v4(),
        workspace_id,
        session_id: "test-session".to_string(),
        turn_index: 0,
        ref_name: "refs/checkpoints/test".to_string(),
        tree_sha: "abc123".to_string(),
        commit_sha: "def456".to_string(),
        created_at: Utc::now().to_rfc3339(),
        user_message: "test message".to_string(),
    }
}

/// Create a dummy TodoItem for testing.
pub fn test_todo(workspace_id: Uuid) -> TodoItem {
    TodoItem {
        id: Uuid::new_v4(),
        workspace_id,
        text: "Test todo item".to_string(),
        completed: false,
        sort_order: 0,
    }
}

/// Create a dummy ChatMessage for testing.
pub fn test_chat_message(workspace_id: Uuid) -> ChatMessage {
    ChatMessage {
        id: Uuid::new_v4(),
        workspace_id,
        role: MessageRole::User,
        content: vec![ContentBlock::Text {
            text: "Hello".to_string(),
        }],
        timestamp: Utc::now(),
        display_text: Some("Hello".to_string()),
        metadata: None,
    }
}

/// Insert a test repo and workspace pair into the database.
/// Returns (Repository, Workspace) with matching repo_id.
pub fn insert_test_repo_and_workspace(db: &Database) -> (Repository, Workspace) {
    let repo = test_repo();
    db.insert_repository(&repo)
        .expect("Failed to insert test repo");
    let ws = test_workspace(repo.id);
    db.insert_workspace(&ws)
        .expect("Failed to insert test workspace");
    (repo, ws)
}

/// Create a dummy FileBookmark for testing.
pub fn test_bookmark(repo_id: Uuid) -> FileBookmark {
    FileBookmark {
        id: Uuid::new_v4(),
        repo_id,
        file_path: "src/main.ts".to_string(),
        line_number: 42,
        note: Some("Important function".to_string()),
        color: Some("blue".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

/// Create a dummy Prompt for testing.
pub fn test_prompt() -> Prompt {
    Prompt {
        id: Uuid::new_v4(),
        name: "test-prompt".to_string(),
        content: "Review the {{file}} for {{issue_type}} issues".to_string(),
        description: Some("A test prompt".to_string()),
        category: Some("Code Review".to_string()),
        tags: vec!["review".to_string(), "quality".to_string()],
        sort_order: 0,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

/// Create a dummy Snippet for testing.
pub fn test_snippet() -> Snippet {
    Snippet {
        id: Uuid::new_v4(),
        title: "fetch helper".to_string(),
        content: "async function fetchJSON(url: string) {\n  const res = await fetch(url);\n  return res.json();\n}".to_string(),
        language: Some("typescript".to_string()),
        description: Some("Typed fetch wrapper".to_string()),
        tags: vec!["http".to_string(), "utility".to_string()],
        source: Some("chat".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

/// Create a dummy WorkspaceTemplate for testing.
pub fn test_workspace_template(repo_id: Uuid) -> WorkspaceTemplate {
    WorkspaceTemplate {
        id: Uuid::new_v4(),
        repo_id,
        name: "test-template".to_string(),
        description: Some("A test template".to_string()),
        setup_script: Some("npm install".to_string()),
        run_script: Some("npm start".to_string()),
        archive_script: None,
        run_script_mode: "nonconcurrent".to_string(),
        env_vars: HashMap::from([("NODE_ENV".to_string(), "development".to_string())]),
        sparse_dirs: Some(vec!["src".to_string()]),
        auto_commit: true,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}
