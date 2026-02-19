mod migrations;

use crate::error::AppError;
use crate::models::repository::Repository;
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
        let db_path = data_dir.join("missoula.db");
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

    pub fn delete_workspace(&self, id: &Uuid) -> Result<(), AppError> {
        self.conn.execute(
            "DELETE FROM workspaces WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )?;
        Ok(())
    }
}
