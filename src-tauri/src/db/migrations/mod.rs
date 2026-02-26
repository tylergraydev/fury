use crate::error::AppError;
use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            default_branch TEXT NOT NULL DEFAULT 'main',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS repository_settings (
            repo_id TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
            setup_script TEXT,
            run_script TEXT,
            archive_script TEXT,
            run_script_mode TEXT NOT NULL DEFAULT 'nonconcurrent',
            env_vars TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL REFERENCES repositories(id),
            name TEXT NOT NULL,
            branch TEXT NOT NULL,
            worktree_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            port_base INTEGER NOT NULL,
            sparse_dirs TEXT,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            archived_at TEXT,
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS workspace_links (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            linked_workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            PRIMARY KEY (workspace_id, linked_workspace_id)
        );

        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS checkpoints (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            session_id TEXT NOT NULL,
            turn_index INTEGER NOT NULL,
            ref_name TEXT NOT NULL,
            tree_sha TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            user_message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_workspaces_repo ON workspaces(repo_id);
        CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
        CREATE INDEX IF NOT EXISTS idx_todos_workspace ON todos(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_checkpoints_workspace ON checkpoints(workspace_id);
        ",
    )
    .map_err(|e| AppError::DbError(e.to_string()))?;

    // Add auto_commit column (idempotent — ignore error if column already exists)
    let _ = conn
        .execute_batch("ALTER TABLE workspaces ADD COLUMN auto_commit INTEGER NOT NULL DEFAULT 1;");

    // Add worktree_base_path column (idempotent)
    let _ =
        conn.execute_batch("ALTER TABLE repository_settings ADD COLUMN worktree_base_path TEXT;");

    // Chat messages table (idempotent)
    // Uses id TEXT UNIQUE (not PRIMARY KEY) so SQLite keeps an implicit integer
    // rowid, giving us a stable insertion-order tiebreaker for same-timestamp msgs.
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT UNIQUE,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace ON chat_messages(workspace_id);
        ",
    )
    .map_err(|e| AppError::DbError(e.to_string()))?;

    // Add display_text column to chat_messages (idempotent)
    let _ = conn.execute_batch("ALTER TABLE chat_messages ADD COLUMN display_text TEXT;");

    // Add metadata column to chat_messages (idempotent) — stores JSON for response stats
    let _ = conn.execute_batch("ALTER TABLE chat_messages ADD COLUMN metadata TEXT;");

    // Add pinned column to workspaces (idempotent)
    let _ =
        conn.execute_batch("ALTER TABLE workspaces ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;");

    // Workspace-issue links table (idempotent)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workspace_issues (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            issue_id TEXT NOT NULL,
            identifier TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            linked_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (workspace_id, issue_id)
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_issues_workspace ON workspace_issues(workspace_id);
        ",
    )
    .map_err(|e| AppError::DbError(e.to_string()))?;

    // Workspace templates table (idempotent)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workspace_templates (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            setup_script TEXT,
            run_script TEXT,
            archive_script TEXT,
            run_script_mode TEXT NOT NULL DEFAULT 'nonconcurrent',
            env_vars TEXT NOT NULL DEFAULT '{}',
            sparse_dirs TEXT,
            auto_commit INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(repo_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_templates_repo ON workspace_templates(repo_id);
        ",
    )
    .map_err(|e| AppError::DbError(e.to_string()))?;

    Ok(())
}
