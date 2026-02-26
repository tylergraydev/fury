mod migrations;

use crate::error::AppError;
use crate::models::chat::{ChatMessage, ChatMessageSearchResult, ContentBlock, MessageRole};
use crate::models::checkpoint::Checkpoint;
use crate::models::linear::WorkspaceIssue;
use crate::models::repository::{RepoSettings, Repository, RunScriptMode};
use crate::models::settings::AppSettings;
use crate::models::todo::TodoItem;
use crate::models::workspace::{Workspace, WorkspaceStatus};
use crate::models::workspace_template::WorkspaceTemplate;
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn init(data_dir: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("fury.db");
        let conn = Connection::open(&db_path).map_err(|e| AppError::DbError(e.to_string()))?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    /// Create an in-memory database for testing with all migrations applied.
    #[cfg(test)]
    pub fn init_in_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory().map_err(|e| AppError::DbError(e.to_string()))?;
        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), AppError> {
        migrations::run(&self.conn)
    }

    // Repository operations

    pub fn insert_repository(&self, repo: &Repository) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO repositories (id, name, path, default_branch) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                repo.id.to_string(),
                repo.name,
                repo.path.to_string_lossy().to_string(),
                repo.default_branch,
            ],
        )?;
        Ok(())
    }

    pub fn delete_repository(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM repositories WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    pub fn list_repositories(&self) -> Result<Vec<Repository>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, path, default_branch FROM repositories")?;
        let repos = stmt
            .query_map([], |row| {
                Ok(Repository {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    name: row.get(1)?,
                    path: PathBuf::from(row.get::<_, String>(2)?),
                    default_branch: row.get(3)?,
                    current_branch: None,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(repos)
    }

    // Workspace operations

    pub fn insert_workspace(&self, ws: &Workspace) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO workspaces (id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, auto_commit, pinned)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                ws.id.to_string(),
                ws.repo_id.to_string(),
                ws.name,
                ws.branch,
                ws.worktree_path.to_string_lossy().to_string(),
                ws.status.as_str(),
                ws.port_base,
                ws.sparse_dirs.as_ref().map(|d| serde_json::to_string(d).unwrap_or_default()),
                ws.notes,
                ws.created_at.to_rfc3339(),
                ws.auto_commit as i32,
                ws.pinned as i32,
            ],
        )?;
        Ok(())
    }

    pub fn update_workspace_status(
        &self,
        id: &Uuid,
        status: &WorkspaceStatus,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET status = ?1, archived_at = ?2 WHERE id = ?3",
            rusqlite::params![
                status.as_str(),
                match status {
                    WorkspaceStatus::Archived => Some(chrono::Utc::now().to_rfc3339()),
                    _ => None,
                },
                id.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, archived_at, error_message, auto_commit, pinned
             FROM workspaces WHERE status != 'archived'",
        )?;
        let workspaces = stmt
            .query_map([], |row| {
                let status_str: String = row.get(5)?;
                let error_msg: Option<String> = row.get(11)?;
                Ok(Workspace {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    repo_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    name: row.get(2)?,
                    branch: row.get(3)?,
                    worktree_path: PathBuf::from(row.get::<_, String>(4)?),
                    status: WorkspaceStatus::from_str(&status_str, error_msg),
                    port_base: row.get(6)?,
                    sparse_dirs: row
                        .get::<_, Option<String>>(7)?
                        .and_then(|s| serde_json::from_str(&s).ok()),
                    notes: row.get(8)?,
                    auto_commit: row.get::<_, i32>(12).unwrap_or(1) != 0,
                    pinned: row.get::<_, i32>(13).unwrap_or(0) != 0,
                    created_at: row
                        .get::<_, String>(9)?
                        .parse()
                        .unwrap_or_else(|_| chrono::Utc::now()),
                    archived_at: row
                        .get::<_, Option<String>>(10)?
                        .and_then(|s| s.parse().ok()),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(workspaces)
    }

    pub fn list_archived_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, archived_at, error_message, auto_commit, pinned
             FROM workspaces WHERE status = 'archived' ORDER BY archived_at DESC",
        )?;
        let workspaces = stmt
            .query_map([], |row| {
                let status_str: String = row.get(5)?;
                let error_msg: Option<String> = row.get(11)?;
                Ok(Workspace {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    repo_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    name: row.get(2)?,
                    branch: row.get(3)?,
                    worktree_path: PathBuf::from(row.get::<_, String>(4)?),
                    status: WorkspaceStatus::from_str(&status_str, error_msg),
                    port_base: row.get(6)?,
                    sparse_dirs: row
                        .get::<_, Option<String>>(7)?
                        .and_then(|s| serde_json::from_str(&s).ok()),
                    notes: row.get(8)?,
                    auto_commit: row.get::<_, i32>(12).unwrap_or(1) != 0,
                    pinned: row.get::<_, i32>(13).unwrap_or(0) != 0,
                    created_at: row
                        .get::<_, String>(9)?
                        .parse()
                        .unwrap_or_else(|_| chrono::Utc::now()),
                    archived_at: row
                        .get::<_, Option<String>>(10)?
                        .and_then(|s| s.parse().ok()),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(workspaces)
    }

    pub fn delete_workspace(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM workspaces WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    // Checkpoint operations

    pub fn insert_checkpoint(&self, cp: &Checkpoint) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO checkpoints (id, workspace_id, session_id, turn_index, ref_name, tree_sha, commit_sha, user_message, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                cp.id.to_string(),
                cp.workspace_id.to_string(),
                cp.session_id,
                cp.turn_index,
                cp.ref_name,
                cp.tree_sha,
                cp.commit_sha,
                cp.user_message,
                cp.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_checkpoint(&self, checkpoint_id: &Uuid) -> Result<Option<Checkpoint>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, session_id, turn_index, ref_name, tree_sha, commit_sha, user_message, created_at
             FROM checkpoints WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![checkpoint_id.to_string()], |row| {
            Ok(Checkpoint {
                id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                session_id: row.get(2)?,
                turn_index: row.get(3)?,
                ref_name: row.get(4)?,
                tree_sha: row.get(5)?,
                commit_sha: row.get(6)?,
                user_message: row.get(7)?,
                created_at: row.get(8)?,
            })
        });
        match result {
            Ok(cp) => Ok(Some(cp)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn list_checkpoints(&self, workspace_id: &Uuid) -> Result<Vec<Checkpoint>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, session_id, turn_index, ref_name, tree_sha, commit_sha, user_message, created_at
             FROM checkpoints WHERE workspace_id = ?1 ORDER BY turn_index ASC",
        )?;
        let checkpoints = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                Ok(Checkpoint {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    session_id: row.get(2)?,
                    turn_index: row.get(3)?,
                    ref_name: row.get(4)?,
                    tree_sha: row.get(5)?,
                    commit_sha: row.get(6)?,
                    user_message: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(checkpoints)
    }

    pub fn delete_checkpoints_after(
        &self,
        workspace_id: &Uuid,
        turn_index: u32,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM checkpoints WHERE workspace_id = ?1 AND turn_index > ?2",
            rusqlite::params![workspace_id.to_string(), turn_index],
        )?;
        Ok(())
    }

    // Repository settings operations

    pub fn get_repo_settings(&self, repo_id: &Uuid) -> Result<RepoSettings, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT setup_script, run_script, archive_script, run_script_mode, env_vars, worktree_base_path
             FROM repository_settings WHERE repo_id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![repo_id.to_string()], |row| {
            let mode_str: String = row.get(3)?;
            let env_json: String = row.get(4)?;
            Ok(RepoSettings {
                setup_script: row.get(0)?,
                run_script: row.get(1)?,
                archive_script: row.get(2)?,
                run_script_mode: match mode_str.as_str() {
                    "concurrent" => RunScriptMode::Concurrent,
                    _ => RunScriptMode::Nonconcurrent,
                },
                env_vars: serde_json::from_str(&env_json).unwrap_or_default(),
                worktree_base_path: row.get(5)?,
            })
        });
        match result {
            Ok(settings) => Ok(settings),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(RepoSettings::default()),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn upsert_repo_settings(
        &self,
        repo_id: &Uuid,
        settings: &RepoSettings,
    ) -> Result<(), AppError> {
        let mode_str = match settings.run_script_mode {
            RunScriptMode::Concurrent => "concurrent",
            RunScriptMode::Nonconcurrent => "nonconcurrent",
        };
        let env_json = serde_json::to_string(&settings.env_vars)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO repository_settings (repo_id, setup_script, run_script, archive_script, run_script_mode, env_vars, worktree_base_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                repo_id.to_string(),
                settings.setup_script,
                settings.run_script,
                settings.archive_script,
                mode_str,
                env_json,
                settings.worktree_base_path,
            ],
        )?;
        Ok(())
    }

    pub fn get_next_turn_index(&self, workspace_id: &Uuid) -> Result<u32, AppError> {
        let result: Result<Option<u32>, _> = self.conn.query_row(
            "SELECT MAX(turn_index) FROM checkpoints WHERE workspace_id = ?1",
            rusqlite::params![workspace_id.to_string()],
            |row| row.get(0),
        );
        match result {
            Ok(Some(n)) => Ok(n + 1),
            Ok(None) | Err(_) => Ok(0),
        }
    }

    // Todo operations

    pub fn insert_todo(&self, todo: &TodoItem) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO todos (id, workspace_id, text, completed, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                todo.id.to_string(),
                todo.workspace_id.to_string(),
                todo.text,
                todo.completed as i32,
                todo.sort_order,
            ],
        )?;
        Ok(())
    }

    pub fn update_todo(
        &self,
        id: &Uuid,
        text: Option<&str>,
        completed: Option<bool>,
    ) -> Result<(), AppError> {
        if let Some(t) = text {
            self.conn.execute(
                "UPDATE todos SET text = ?1 WHERE id = ?2",
                rusqlite::params![t, id.to_string()],
            )?;
        }
        if let Some(c) = completed {
            self.conn.execute(
                "UPDATE todos SET completed = ?1 WHERE id = ?2",
                rusqlite::params![c as i32, id.to_string()],
            )?;
        }
        Ok(())
    }

    pub fn delete_todo(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM todos WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }

    pub fn list_todos(&self, workspace_id: &Uuid) -> Result<Vec<TodoItem>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, text, completed, sort_order
             FROM todos WHERE workspace_id = ?1 ORDER BY sort_order ASC, created_at ASC",
        )?;
        let todos = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                Ok(TodoItem {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    text: row.get(2)?,
                    completed: row.get::<_, i32>(3)? != 0,
                    sort_order: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(todos)
    }

    pub fn toggle_todo(&self, id: &Uuid) -> Result<bool, AppError> {
        self.conn.execute(
            "UPDATE todos SET completed = CASE WHEN completed = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        let new_val: i32 = self.conn.query_row(
            "SELECT completed FROM todos WHERE id = ?1",
            rusqlite::params![id.to_string()],
            |row| row.get(0),
        )?;
        Ok(new_val != 0)
    }

    pub fn reorder_todos(&self, workspace_id: &Uuid, todo_ids: &[Uuid]) -> Result<(), AppError> {
        for (index, id) in todo_ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE todos SET sort_order = ?1 WHERE id = ?2 AND workspace_id = ?3",
                rusqlite::params![index as i32, id.to_string(), workspace_id.to_string()],
            )?;
        }
        Ok(())
    }

    pub fn get_next_sort_order(&self, workspace_id: &Uuid) -> Result<i32, AppError> {
        let result: Result<Option<i32>, _> = self.conn.query_row(
            "SELECT MAX(sort_order) FROM todos WHERE workspace_id = ?1",
            rusqlite::params![workspace_id.to_string()],
            |row| row.get(0),
        );
        match result {
            Ok(Some(n)) => Ok(n + 1),
            Ok(None) | Err(_) => Ok(0),
        }
    }

    // App settings operations

    pub fn get_app_settings(&self) -> Result<AppSettings, AppError> {
        let result = self.conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'settings'",
            [],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(json) => serde_json::from_str(&json)
                .map_err(|e| AppError::DbError(format!("Failed to parse app settings: {}", e))),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(AppSettings::default()),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn save_app_settings(&self, settings: &AppSettings) -> Result<(), AppError> {
        let json = serde_json::to_string(settings)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('settings', ?1)",
            rusqlite::params![json],
        )?;
        Ok(())
    }

    // Workspace sparse dirs

    pub fn update_workspace_sparse_dirs(
        &self,
        id: &Uuid,
        dirs: &Option<Vec<String>>,
    ) -> Result<(), AppError> {
        let json = dirs.as_ref().map(|d| serde_json::to_string(d).unwrap());
        self.conn.execute(
            "UPDATE workspaces SET sparse_dirs = ?1 WHERE id = ?2",
            rusqlite::params![json, id.to_string()],
        )?;
        Ok(())
    }

    // Workspace links

    pub fn insert_workspace_link(&self, ws_id: &Uuid, linked_id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT OR IGNORE INTO workspace_links (workspace_id, linked_workspace_id) VALUES (?1, ?2)",
            rusqlite::params![ws_id.to_string(), linked_id.to_string()],
        )?;
        Ok(())
    }

    pub fn delete_workspace_link(&self, ws_id: &Uuid, linked_id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM workspace_links WHERE workspace_id = ?1 AND linked_workspace_id = ?2",
            rusqlite::params![ws_id.to_string(), linked_id.to_string()],
        )?;
        Ok(())
    }

    pub fn get_workspace_links(&self, ws_id: &Uuid) -> Result<Vec<Uuid>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT linked_workspace_id FROM workspace_links WHERE workspace_id = ?1")?;
        let ids = stmt
            .query_map(rusqlite::params![ws_id.to_string()], |row| {
                row.get::<_, String>(0)
            })?
            .filter_map(|r| r.ok())
            .filter_map(|s| s.parse::<Uuid>().ok())
            .collect();
        Ok(ids)
    }

    // Workspace notes

    pub fn update_workspace_notes(&self, id: &Uuid, notes: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET notes = ?1 WHERE id = ?2",
            rusqlite::params![notes, id.to_string()],
        )?;
        Ok(())
    }

    // Workspace auto-commit

    #[allow(dead_code)]
    pub fn update_workspace_auto_commit(
        &self,
        id: &Uuid,
        auto_commit: bool,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET auto_commit = ?1 WHERE id = ?2",
            rusqlite::params![auto_commit as i32, id.to_string()],
        )?;
        Ok(())
    }

    // Workspace pinned

    pub fn update_workspace_pinned(&self, id: &Uuid, pinned: bool) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET pinned = ?1 WHERE id = ?2",
            rusqlite::params![pinned as i32, id.to_string()],
        )?;
        Ok(())
    }

    // Workspace rename

    pub fn update_workspace_name(&self, id: &Uuid, name: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            rusqlite::params![name, id.to_string()],
        )?;
        Ok(())
    }

    // Chat message operations

    pub fn insert_chat_message(&self, msg: &ChatMessage) -> Result<(), AppError> {
        let content_json = serde_json::to_string(&msg.content)?;
        let metadata_json = msg
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let role_str = match msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        };
        self.conn.execute(
            "INSERT OR REPLACE INTO chat_messages (id, workspace_id, role, content, timestamp, display_text, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                msg.id.to_string(),
                msg.workspace_id.to_string(),
                role_str,
                content_json,
                msg.timestamp.to_rfc3339(),
                msg.display_text,
                metadata_json,
            ],
        )?;
        Ok(())
    }

    pub fn list_chat_messages(&self, workspace_id: &Uuid) -> Result<Vec<ChatMessage>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, role, content, timestamp, display_text, metadata
             FROM chat_messages WHERE workspace_id = ?1 ORDER BY timestamp ASC, rowid ASC",
        )?;
        let messages = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                let role_str: String = row.get(2)?;
                let content_json: String = row.get(3)?;
                let timestamp_str: String = row.get(4)?;
                let display_text: Option<String> = row.get(5)?;
                let metadata_json: Option<String> = row.get(6)?;
                let metadata = match metadata_json {
                    Some(j) => match serde_json::from_str(&j) {
                        Ok(m) => Some(m),
                        Err(e) => {
                            eprintln!("[db] Failed to deserialize chat message metadata: {e}");
                            None
                        }
                    },
                    None => None,
                };
                Ok(ChatMessage {
                    id: row.get::<_, String>(0)?.parse::<Uuid>().unwrap_or_default(),
                    workspace_id: row.get::<_, String>(1)?.parse::<Uuid>().unwrap_or_default(),
                    role: match role_str.as_str() {
                        "user" => MessageRole::User,
                        "assistant" => MessageRole::Assistant,
                        _ => MessageRole::System,
                    },
                    content: serde_json::from_str::<Vec<ContentBlock>>(&content_json)
                        .unwrap_or_default(),
                    timestamp: timestamp_str
                        .parse::<DateTime<Utc>>()
                        .unwrap_or_else(|_| Utc::now()),
                    display_text,
                    metadata,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(messages)
    }

    pub fn clear_chat_messages(&self, workspace_id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM chat_messages WHERE workspace_id = ?1",
            rusqlite::params![workspace_id.to_string()],
        )?;
        Ok(())
    }

    pub fn search_chat_messages(
        &self,
        query: &str,
        workspace_id: Option<&Uuid>,
    ) -> Result<Vec<ChatMessageSearchResult>, AppError> {
        let pattern = format!("%{}%", query);
        let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(ws_id) =
            workspace_id
        {
            (
                "SELECT cm.id, cm.workspace_id, w.name, cm.role, cm.content, cm.display_text, cm.timestamp
                 FROM chat_messages cm
                 JOIN workspaces w ON cm.workspace_id = w.id
                 WHERE cm.workspace_id = ?1
                   AND (cm.content LIKE ?2 OR cm.display_text LIKE ?2)
                 ORDER BY cm.timestamp DESC
                 LIMIT 50",
                vec![
                    Box::new(ws_id.to_string()) as Box<dyn rusqlite::types::ToSql>,
                    Box::new(pattern.clone()),
                ],
            )
        } else {
            (
                "SELECT cm.id, cm.workspace_id, w.name, cm.role, cm.content, cm.display_text, cm.timestamp
                 FROM chat_messages cm
                 JOIN workspaces w ON cm.workspace_id = w.id
                 WHERE cm.content LIKE ?1 OR cm.display_text LIKE ?1
                 ORDER BY cm.timestamp DESC
                 LIMIT 50",
                vec![Box::new(pattern.clone()) as Box<dyn rusqlite::types::ToSql>],
            )
        };

        let mut stmt = self.conn.prepare(sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        let results = stmt
            .query_map(params_refs.as_slice(), |row| {
                let content_json: String = row.get(4)?;
                let display_text: Option<String> = row.get(5)?;

                // Extract matched text from content blocks
                let matched = extract_matched_text(&content_json, &display_text, query);

                Ok(ChatMessageSearchResult {
                    message_id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    workspace_name: row.get(2)?,
                    role: row.get(3)?,
                    matched_text: matched,
                    timestamp: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(results)
    }

    // Workspace issue links

    pub fn link_workspace_issue(
        &self,
        workspace_id: &Uuid,
        issue_id: &str,
        identifier: &str,
        title: &str,
        url: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT OR IGNORE INTO workspace_issues (workspace_id, issue_id, identifier, title, url) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![workspace_id.to_string(), issue_id, identifier, title, url],
        )?;
        Ok(())
    }

    pub fn unlink_workspace_issue(
        &self,
        workspace_id: &Uuid,
        issue_id: &str,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM workspace_issues WHERE workspace_id = ?1 AND issue_id = ?2",
            rusqlite::params![workspace_id.to_string(), issue_id],
        )?;
        Ok(())
    }

    pub fn get_workspace_issues(
        &self,
        workspace_id: &Uuid,
    ) -> Result<Vec<WorkspaceIssue>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT workspace_id, issue_id, identifier, title, url, linked_at
             FROM workspace_issues WHERE workspace_id = ?1 ORDER BY linked_at DESC",
        )?;
        let issues = stmt
            .query_map(rusqlite::params![workspace_id.to_string()], |row| {
                Ok(WorkspaceIssue {
                    workspace_id: row.get(0)?,
                    issue_id: row.get(1)?,
                    identifier: row.get(2)?,
                    title: row.get(3)?,
                    url: row.get(4)?,
                    linked_at: row.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(issues)
    }

    // --- Workspace template operations ---

    pub fn insert_workspace_template(&self, template: &WorkspaceTemplate) -> Result<(), AppError> {
        let env_json = serde_json::to_string(&template.env_vars)?;
        let sparse_json = template
            .sparse_dirs
            .as_ref()
            .map(|d| serde_json::to_string(d).unwrap_or_default());
        self.conn.execute(
            "INSERT INTO workspace_templates (id, repo_id, name, description, setup_script, run_script, archive_script, run_script_mode, env_vars, sparse_dirs, auto_commit, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                template.id.to_string(),
                template.repo_id.to_string(),
                template.name,
                template.description,
                template.setup_script,
                template.run_script,
                template.archive_script,
                template.run_script_mode,
                env_json,
                sparse_json,
                template.auto_commit as i32,
                template.created_at.to_rfc3339(),
                template.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn list_workspace_templates(
        &self,
        repo_id: &Uuid,
    ) -> Result<Vec<WorkspaceTemplate>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, name, description, setup_script, run_script, archive_script, run_script_mode, env_vars, sparse_dirs, auto_commit, created_at, updated_at
             FROM workspace_templates WHERE repo_id = ?1 ORDER BY name ASC",
        )?;
        let templates = stmt
            .query_map(rusqlite::params![repo_id.to_string()], |row| {
                let env_json: String = row.get(8)?;
                let sparse_json: Option<String> = row.get(9)?;
                let id_str: String = row.get(0)?;
                let repo_id_str: String = row.get(1)?;
                let created_str: String = row.get(11)?;
                let updated_str: String = row.get(12)?;
                Ok(WorkspaceTemplate {
                    id: Uuid::parse_str(&id_str).unwrap_or_default(),
                    repo_id: Uuid::parse_str(&repo_id_str).unwrap_or_default(),
                    name: row.get(2)?,
                    description: row.get(3)?,
                    setup_script: row.get(4)?,
                    run_script: row.get(5)?,
                    archive_script: row.get(6)?,
                    run_script_mode: row.get(7)?,
                    env_vars: serde_json::from_str(&env_json).unwrap_or_default(),
                    sparse_dirs: sparse_json.and_then(|j| serde_json::from_str(&j).ok()),
                    auto_commit: row.get::<_, i32>(10)? != 0,
                    created_at: DateTime::parse_from_rfc3339(&created_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: DateTime::parse_from_rfc3339(&updated_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(templates)
    }

    pub fn get_workspace_template(&self, id: &Uuid) -> Result<Option<WorkspaceTemplate>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, name, description, setup_script, run_script, archive_script, run_script_mode, env_vars, sparse_dirs, auto_commit, created_at, updated_at
             FROM workspace_templates WHERE id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![id.to_string()], |row| {
            let env_json: String = row.get(8)?;
            let sparse_json: Option<String> = row.get(9)?;
            let id_str: String = row.get(0)?;
            let repo_id_str: String = row.get(1)?;
            let created_str: String = row.get(11)?;
            let updated_str: String = row.get(12)?;
            Ok(WorkspaceTemplate {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                repo_id: Uuid::parse_str(&repo_id_str).unwrap_or_default(),
                name: row.get(2)?,
                description: row.get(3)?,
                setup_script: row.get(4)?,
                run_script: row.get(5)?,
                archive_script: row.get(6)?,
                run_script_mode: row.get(7)?,
                env_vars: serde_json::from_str(&env_json).unwrap_or_default(),
                sparse_dirs: sparse_json.and_then(|j| serde_json::from_str(&j).ok()),
                auto_commit: row.get::<_, i32>(10)? != 0,
                created_at: DateTime::parse_from_rfc3339(&created_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });
        match result {
            Ok(template) => Ok(Some(template)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn update_workspace_template(&self, template: &WorkspaceTemplate) -> Result<(), AppError> {
        let env_json = serde_json::to_string(&template.env_vars)?;
        let sparse_json = template
            .sparse_dirs
            .as_ref()
            .map(|d| serde_json::to_string(d).unwrap_or_default());
        self.conn.execute(
            "UPDATE workspace_templates SET name = ?1, description = ?2, setup_script = ?3, run_script = ?4, archive_script = ?5, run_script_mode = ?6, env_vars = ?7, sparse_dirs = ?8, auto_commit = ?9, updated_at = ?10 WHERE id = ?11",
            rusqlite::params![
                template.name,
                template.description,
                template.setup_script,
                template.run_script,
                template.archive_script,
                template.run_script_mode,
                env_json,
                sparse_json,
                template.auto_commit as i32,
                template.updated_at.to_rfc3339(),
                template.id.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn delete_workspace_template(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM workspace_templates WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }
}

/// Extract a text snippet from chat message content that matches the search query.
fn extract_matched_text(content_json: &str, display_text: &Option<String>, query: &str) -> String {
    let query_lower = query.to_lowercase();

    // Check display_text first
    if let Some(dt) = display_text {
        if dt.to_lowercase().contains(&query_lower) {
            return snippet(dt, &query_lower);
        }
    }

    // Parse content blocks and search text blocks
    if let Ok(blocks) = serde_json::from_str::<Vec<ContentBlock>>(content_json) {
        for block in &blocks {
            if let ContentBlock::Text { text } = block {
                if text.to_lowercase().contains(&query_lower) {
                    return snippet(text, &query_lower);
                }
            }
        }
    }

    // Fallback: raw substring match on JSON
    snippet(content_json, &query_lower)
}

/// Return a short snippet around the first occurrence of `query_lower` in `text`.
fn snippet(text: &str, query_lower: &str) -> String {
    let text_lower = text.to_lowercase();
    let max_len = 120;
    if let Some(pos) = text_lower.find(query_lower) {
        let start = pos.saturating_sub(40);
        let end = (pos + query_lower.len() + 40).min(text.len());
        // Align to char boundaries
        let start = text.floor_char_boundary(start);
        let end = text.ceil_char_boundary(end);
        let mut s = String::new();
        if start > 0 {
            s.push_str("...");
        }
        s.push_str(&text[start..end]);
        if end < text.len() {
            s.push_str("...");
        }
        s
    } else {
        text.chars().take(max_len).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::chat::ResponseMetadata;
    use crate::test_helpers::*;

    // --- Repository CRUD ---

    #[test]
    fn test_list_repositories_empty() {
        let db = test_db();
        let repos = db.list_repositories().unwrap();
        assert!(repos.is_empty());
    }

    #[test]
    fn test_insert_and_list_repository() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let repos = db.list_repositories().unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].id, repo.id);
        assert_eq!(repos[0].name, "test-repo");
        assert_eq!(repos[0].default_branch, "main");
    }

    #[test]
    fn test_delete_repository() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        db.delete_repository(&repo.id).unwrap();
        let repos = db.list_repositories().unwrap();
        assert!(repos.is_empty());
    }

    // --- Workspace CRUD ---

    #[test]
    fn test_insert_and_list_workspace() {
        let db = test_db();
        let (repo, ws) = insert_test_repo_and_workspace(&db);
        let workspaces = db.list_workspaces().unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].id, ws.id);
        assert_eq!(workspaces[0].repo_id, repo.id);
        assert_eq!(workspaces[0].name, "test-workspace");
    }

    #[test]
    fn test_update_workspace_status_to_archived() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.update_workspace_status(&ws.id, &WorkspaceStatus::Archived)
            .unwrap();
        // Should not appear in active list
        let active = db.list_workspaces().unwrap();
        assert!(active.is_empty());
        // Should appear in archived list
        let archived = db.list_archived_workspaces().unwrap();
        assert_eq!(archived.len(), 1);
        assert!(archived[0].archived_at.is_some());
    }

    #[test]
    fn test_list_workspaces_excludes_archived() {
        let db = test_db();
        let (repo, ws1) = insert_test_repo_and_workspace(&db);
        let mut ws2 = test_workspace(repo.id);
        ws2.branch = "feature-2".to_string();
        db.insert_workspace(&ws2).unwrap();
        db.update_workspace_status(&ws1.id, &WorkspaceStatus::Archived)
            .unwrap();
        let active = db.list_workspaces().unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, ws2.id);
    }

    #[test]
    fn test_delete_workspace() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.delete_workspace(&ws.id).unwrap();
        let workspaces = db.list_workspaces().unwrap();
        assert!(workspaces.is_empty());
    }

    #[test]
    fn test_update_workspace_name() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.update_workspace_name(&ws.id, "renamed").unwrap();
        let workspaces = db.list_workspaces().unwrap();
        assert_eq!(workspaces[0].name, "renamed");
    }

    #[test]
    fn test_update_workspace_notes() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.update_workspace_notes(&ws.id, "some notes").unwrap();
        let workspaces = db.list_workspaces().unwrap();
        assert_eq!(workspaces[0].notes, "some notes");
    }

    #[test]
    fn test_update_workspace_auto_commit() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.update_workspace_auto_commit(&ws.id, false).unwrap();
        let workspaces = db.list_workspaces().unwrap();
        assert!(!workspaces[0].auto_commit);
    }

    #[test]
    fn test_update_workspace_pinned() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.update_workspace_pinned(&ws.id, true).unwrap();
        let workspaces = db.list_workspaces().unwrap();
        assert!(workspaces[0].pinned);
    }

    #[test]
    fn test_update_workspace_sparse_dirs() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let dirs = Some(vec!["src".to_string(), "tests".to_string()]);
        db.update_workspace_sparse_dirs(&ws.id, &dirs).unwrap();
        let workspaces = db.list_workspaces().unwrap();
        assert_eq!(workspaces[0].sparse_dirs, dirs);
    }

    // --- Checkpoint operations ---

    #[test]
    fn test_insert_and_get_checkpoint() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let cp = test_checkpoint(ws.id);
        db.insert_checkpoint(&cp).unwrap();
        let fetched = db.get_checkpoint(&cp.id).unwrap().unwrap();
        assert_eq!(fetched.id, cp.id);
        assert_eq!(fetched.workspace_id, ws.id);
        assert_eq!(fetched.session_id, "test-session");
        assert_eq!(fetched.user_message, "test message");
    }

    #[test]
    fn test_get_nonexistent_checkpoint() {
        let db = test_db();
        let result = db.get_checkpoint(&Uuid::new_v4()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_list_checkpoints_ordered() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut cp1 = test_checkpoint(ws.id);
        cp1.turn_index = 0;
        let mut cp2 = test_checkpoint(ws.id);
        cp2.turn_index = 1;
        let mut cp3 = test_checkpoint(ws.id);
        cp3.turn_index = 2;
        db.insert_checkpoint(&cp1).unwrap();
        db.insert_checkpoint(&cp3).unwrap();
        db.insert_checkpoint(&cp2).unwrap();
        let list = db.list_checkpoints(&ws.id).unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].turn_index, 0);
        assert_eq!(list[1].turn_index, 1);
        assert_eq!(list[2].turn_index, 2);
    }

    #[test]
    fn test_delete_checkpoints_after() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        for i in 0..5 {
            let mut cp = test_checkpoint(ws.id);
            cp.turn_index = i;
            db.insert_checkpoint(&cp).unwrap();
        }
        db.delete_checkpoints_after(&ws.id, 2).unwrap();
        let list = db.list_checkpoints(&ws.id).unwrap();
        assert_eq!(list.len(), 3); // indices 0, 1, 2 remain
    }

    #[test]
    fn test_get_next_turn_index_empty() {
        let db = test_db();
        let ws_id = Uuid::new_v4();
        assert_eq!(db.get_next_turn_index(&ws_id).unwrap(), 0);
    }

    #[test]
    fn test_get_next_turn_index_with_checkpoints() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut cp = test_checkpoint(ws.id);
        cp.turn_index = 3;
        db.insert_checkpoint(&cp).unwrap();
        assert_eq!(db.get_next_turn_index(&ws.id).unwrap(), 4);
    }

    // --- Todo operations ---

    #[test]
    fn test_insert_and_list_todos() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].text, "Test todo item");
        assert!(!todos[0].completed);
    }

    #[test]
    fn test_update_todo_text() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        db.update_todo(&todo.id, Some("Updated text"), None)
            .unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert_eq!(todos[0].text, "Updated text");
    }

    #[test]
    fn test_toggle_todo() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        let result = db.toggle_todo(&todo.id).unwrap();
        assert!(result); // toggled from false to true
        let result = db.toggle_todo(&todo.id).unwrap();
        assert!(!result); // toggled back
    }

    #[test]
    fn test_delete_todo() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        db.delete_todo(&todo.id).unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert!(todos.is_empty());
    }

    #[test]
    fn test_reorder_todos() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut todo1 = test_todo(ws.id);
        todo1.sort_order = 0;
        let mut todo2 = test_todo(ws.id);
        todo2.sort_order = 1;
        db.insert_todo(&todo1).unwrap();
        db.insert_todo(&todo2).unwrap();
        // Reverse order
        db.reorder_todos(&ws.id, &[todo2.id, todo1.id]).unwrap();
        let todos = db.list_todos(&ws.id).unwrap();
        assert_eq!(todos[0].id, todo2.id);
        assert_eq!(todos[1].id, todo1.id);
    }

    #[test]
    fn test_get_next_sort_order() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        assert_eq!(db.get_next_sort_order(&ws.id).unwrap(), 0);
        let todo = test_todo(ws.id);
        db.insert_todo(&todo).unwrap();
        assert_eq!(db.get_next_sort_order(&ws.id).unwrap(), 1);
    }

    // --- Settings operations ---

    #[test]
    fn test_get_default_app_settings() {
        let db = test_db();
        let settings = db.get_app_settings().unwrap();
        assert!(!settings.analytics_enabled);
    }

    #[test]
    fn test_save_and_get_app_settings() {
        let db = test_db();
        let mut settings = AppSettings::default();
        settings.analytics_enabled = true;
        db.save_app_settings(&settings).unwrap();
        let fetched = db.get_app_settings().unwrap();
        assert!(fetched.analytics_enabled);
    }

    #[test]
    fn test_get_default_repo_settings() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let settings = db.get_repo_settings(&repo.id).unwrap();
        assert!(settings.setup_script.is_none());
        assert!(matches!(
            settings.run_script_mode,
            RunScriptMode::Nonconcurrent
        ));
    }

    #[test]
    fn test_upsert_and_get_repo_settings() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let mut settings = RepoSettings::default();
        settings.setup_script = Some("npm install".to_string());
        settings.run_script_mode = RunScriptMode::Concurrent;
        db.upsert_repo_settings(&repo.id, &settings).unwrap();
        let fetched = db.get_repo_settings(&repo.id).unwrap();
        assert_eq!(fetched.setup_script.as_deref(), Some("npm install"));
        assert!(matches!(fetched.run_script_mode, RunScriptMode::Concurrent));
    }

    // --- Chat messages ---

    #[test]
    fn test_insert_and_list_chat_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let msg = test_chat_message(ws.id);
        db.insert_chat_message(&msg).unwrap();
        let messages = db.list_chat_messages(&ws.id).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, msg.id);
        assert_eq!(messages[0].role, MessageRole::User);
    }

    #[test]
    fn test_clear_chat_messages() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let msg = test_chat_message(ws.id);
        db.insert_chat_message(&msg).unwrap();
        db.clear_chat_messages(&ws.id).unwrap();
        let messages = db.list_chat_messages(&ws.id).unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_chat_message_with_metadata() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let mut msg = test_chat_message(ws.id);
        msg.metadata = Some(ResponseMetadata {
            duration_ms: Some(1000),
            duration_api_ms: Some(800),
            total_cost_usd: Some(0.05),
            num_turns: Some(1),
            input_tokens: Some(100),
            output_tokens: Some(200),
            cache_read_tokens: None,
            cache_creation_tokens: None,
        });
        db.insert_chat_message(&msg).unwrap();
        let messages = db.list_chat_messages(&ws.id).unwrap();
        let meta = messages[0].metadata.as_ref().unwrap();
        assert_eq!(meta.duration_ms, Some(1000));
        assert_eq!(meta.total_cost_usd, Some(0.05));
    }

    // --- Workspace links ---

    #[test]
    fn test_insert_and_get_workspace_links() {
        let db = test_db();
        let (repo, ws1) = insert_test_repo_and_workspace(&db);
        let mut ws2 = test_workspace(repo.id);
        ws2.branch = "link-branch".to_string();
        db.insert_workspace(&ws2).unwrap();
        db.insert_workspace_link(&ws1.id, &ws2.id).unwrap();
        let links = db.get_workspace_links(&ws1.id).unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0], ws2.id);
    }

    #[test]
    fn test_delete_workspace_link() {
        let db = test_db();
        let (repo, ws1) = insert_test_repo_and_workspace(&db);
        let mut ws2 = test_workspace(repo.id);
        ws2.branch = "link-branch".to_string();
        db.insert_workspace(&ws2).unwrap();
        db.insert_workspace_link(&ws1.id, &ws2.id).unwrap();
        db.delete_workspace_link(&ws1.id, &ws2.id).unwrap();
        let links = db.get_workspace_links(&ws1.id).unwrap();
        assert!(links.is_empty());
    }

    #[test]
    fn test_duplicate_workspace_link_ignored() {
        let db = test_db();
        let (repo, ws1) = insert_test_repo_and_workspace(&db);
        let mut ws2 = test_workspace(repo.id);
        ws2.branch = "link-branch".to_string();
        db.insert_workspace(&ws2).unwrap();
        db.insert_workspace_link(&ws1.id, &ws2.id).unwrap();
        db.insert_workspace_link(&ws1.id, &ws2.id).unwrap(); // duplicate
        let links = db.get_workspace_links(&ws1.id).unwrap();
        assert_eq!(links.len(), 1);
    }

    // --- Workspace issues ---

    #[test]
    fn test_link_and_get_workspace_issues() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.link_workspace_issue(
            &ws.id,
            "ISSUE-1",
            "PRJ-1",
            "Fix bug",
            "https://linear.app/1",
        )
        .unwrap();
        let issues = db.get_workspace_issues(&ws.id).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].issue_id, "ISSUE-1");
        assert_eq!(issues[0].identifier, "PRJ-1");
        assert_eq!(issues[0].title, "Fix bug");
    }

    #[test]
    fn test_unlink_workspace_issue() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.link_workspace_issue(
            &ws.id,
            "ISSUE-1",
            "PRJ-1",
            "Fix bug",
            "https://linear.app/1",
        )
        .unwrap();
        db.unlink_workspace_issue(&ws.id, "ISSUE-1").unwrap();
        let issues = db.get_workspace_issues(&ws.id).unwrap();
        assert!(issues.is_empty());
    }

    #[test]
    fn test_duplicate_issue_link_ignored() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        db.link_workspace_issue(
            &ws.id,
            "ISSUE-1",
            "PRJ-1",
            "Fix bug",
            "https://linear.app/1",
        )
        .unwrap();
        db.link_workspace_issue(
            &ws.id,
            "ISSUE-1",
            "PRJ-1",
            "Fix bug",
            "https://linear.app/1",
        )
        .unwrap();
        let issues = db.get_workspace_issues(&ws.id).unwrap();
        assert_eq!(issues.len(), 1);
    }

    // --- Workspace templates ---

    #[test]
    fn test_insert_and_list_workspace_templates() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let template = test_workspace_template(repo.id);
        db.insert_workspace_template(&template).unwrap();
        let templates = db.list_workspace_templates(&repo.id).unwrap();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].id, template.id);
        assert_eq!(templates[0].name, "test-template");
        assert_eq!(
            templates[0].env_vars.get("NODE_ENV").unwrap(),
            "development"
        );
        assert!(templates[0].auto_commit);
    }

    #[test]
    fn test_get_workspace_template() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let template = test_workspace_template(repo.id);
        db.insert_workspace_template(&template).unwrap();
        let fetched = db.get_workspace_template(&template.id).unwrap().unwrap();
        assert_eq!(fetched.name, "test-template");
        assert_eq!(fetched.setup_script.as_deref(), Some("npm install"));
        assert_eq!(
            fetched.sparse_dirs.as_ref().unwrap(),
            &vec!["src".to_string()]
        );
    }

    #[test]
    fn test_get_nonexistent_template() {
        let db = test_db();
        let result = db.get_workspace_template(&Uuid::new_v4()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_update_workspace_template() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let mut template = test_workspace_template(repo.id);
        db.insert_workspace_template(&template).unwrap();
        template.name = "renamed-template".to_string();
        template.setup_script = Some("yarn install".to_string());
        template.updated_at = Utc::now();
        db.update_workspace_template(&template).unwrap();
        let fetched = db.get_workspace_template(&template.id).unwrap().unwrap();
        assert_eq!(fetched.name, "renamed-template");
        assert_eq!(fetched.setup_script.as_deref(), Some("yarn install"));
    }

    #[test]
    fn test_delete_workspace_template() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let template = test_workspace_template(repo.id);
        db.insert_workspace_template(&template).unwrap();
        db.delete_workspace_template(&template.id).unwrap();
        let templates = db.list_workspace_templates(&repo.id).unwrap();
        assert!(templates.is_empty());
    }

    #[test]
    fn test_workspace_templates_cascade_on_repo_delete() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let template = test_workspace_template(repo.id);
        db.insert_workspace_template(&template).unwrap();
        db.delete_repository(&repo.id).unwrap();
        let templates = db.list_workspace_templates(&repo.id).unwrap();
        assert!(templates.is_empty());
    }

    // --- Migrations ---

    #[test]
    fn test_migrations_idempotent() {
        let db = test_db();
        // Running migrations again should not error
        db.run_migrations().unwrap();
    }
}
