mod migrations;

use crate::error::AppError;
use crate::models::checkpoint::Checkpoint;
use crate::models::repository::{RepoSettings, Repository, RunScriptMode};
use crate::models::settings::AppSettings;
use crate::models::todo::TodoItem;
use crate::models::workspace::{Workspace, WorkspaceStatus};
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
            "INSERT INTO workspaces (id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
            "SELECT id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, archived_at, error_message
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
            "SELECT id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, archived_at, error_message
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
            "SELECT setup_script, run_script, archive_script, run_script_mode, env_vars
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
            "INSERT OR REPLACE INTO repository_settings (repo_id, setup_script, run_script, archive_script, run_script_mode, env_vars)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                repo_id.to_string(),
                settings.setup_script,
                settings.run_script,
                settings.archive_script,
                mode_str,
                env_json,
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

    // Workspace rename

    pub fn update_workspace_name(&self, id: &Uuid, name: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            rusqlite::params![name, id.to_string()],
        )?;
        Ok(())
    }
}
