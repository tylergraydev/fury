use super::Database;
use crate::error::AppError;
use crate::models::linear::WorkspaceIssue;
use crate::models::workspace::{Workspace, WorkspaceStatus};
use std::path::PathBuf;
use uuid::Uuid;

impl Database {
    pub fn insert_workspace(&self, ws: &Workspace) -> Result<(), AppError> {
        self.conn.execute(
            "INSERT INTO workspaces (id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, auto_commit, pinned, devcontainer_config)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
                ws.devcontainer_config.as_ref().map(|c| serde_json::to_string(c).unwrap_or_default()),
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
            "SELECT id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, archived_at, error_message, auto_commit, pinned, devcontainer_config
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
                    devcontainer_config: row
                        .get::<_, Option<String>>(14)?
                        .and_then(|s| serde_json::from_str(&s).ok()),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(workspaces)
    }

    pub fn list_archived_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, name, branch, worktree_path, status, port_base, sparse_dirs, notes, created_at, archived_at, error_message, auto_commit, pinned, devcontainer_config
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
                    devcontainer_config: row
                        .get::<_, Option<String>>(14)?
                        .and_then(|s| serde_json::from_str(&s).ok()),
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

    pub fn update_workspace_devcontainer_config(
        &self,
        id: &Uuid,
        config: Option<&crate::models::devcontainer::DevContainerConfig>,
    ) -> Result<(), AppError> {
        let json = config.map(|c| serde_json::to_string(c).unwrap_or_default());
        self.conn.execute(
            "UPDATE workspaces SET devcontainer_config = ?1 WHERE id = ?2",
            rusqlite::params![json, id.to_string()],
        )?;
        Ok(())
    }

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

    pub fn update_workspace_notes(&self, id: &Uuid, notes: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET notes = ?1 WHERE id = ?2",
            rusqlite::params![notes, id.to_string()],
        )?;
        Ok(())
    }

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

    pub fn update_workspace_pinned(&self, id: &Uuid, pinned: bool) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET pinned = ?1 WHERE id = ?2",
            rusqlite::params![pinned as i32, id.to_string()],
        )?;
        Ok(())
    }

    pub fn update_workspace_name(&self, id: &Uuid, name: &str) -> Result<(), AppError> {
        self.conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            rusqlite::params![name, id.to_string()],
        )?;
        Ok(())
    }

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
}

#[cfg(test)]
mod tests {
    use crate::models::workspace::WorkspaceStatus;
    use crate::test_helpers::*;

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
        let active = db.list_workspaces().unwrap();
        assert!(active.is_empty());
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
        db.insert_workspace_link(&ws1.id, &ws2.id).unwrap();
        let links = db.get_workspace_links(&ws1.id).unwrap();
        assert_eq!(links.len(), 1);
    }

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
}
