use crate::error::AppError;
use crate::models::memory::{MemoryObservation, MemorySnapshot};

use super::Database;

impl Database {
    /// Insert a new memory observation extracted from an agent session.
    pub fn insert_memory_observation(&self, obs: &MemoryObservation) -> Result<(), AppError> {
        let file_paths_json = serde_json::to_string(&obs.file_paths).unwrap_or_default();
        self.conn
            .execute(
                "INSERT OR IGNORE INTO memory_observations
                 (id, workspace_id, repo_id, session_id, observation_type, content,
                  compressed_content, source_tool, file_paths, tokens_raw, tokens_compressed, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                rusqlite::params![
                    obs.id,
                    obs.workspace_id,
                    obs.repo_id,
                    obs.session_id,
                    obs.observation_type,
                    obs.content,
                    obs.compressed_content,
                    obs.source_tool,
                    file_paths_json,
                    obs.tokens_raw,
                    obs.tokens_compressed,
                    obs.created_at,
                ],
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;
        Ok(())
    }

    /// List observations for a workspace, ordered by creation time descending.
    pub fn list_memory_observations(
        &self,
        workspace_id: &str,
        limit: usize,
    ) -> Result<Vec<MemoryObservation>, AppError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, workspace_id, repo_id, session_id, observation_type, content,
                        compressed_content, source_tool, file_paths, tokens_raw,
                        tokens_compressed, created_at, accessed_at
                 FROM memory_observations
                 WHERE workspace_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let rows = stmt
            .query_map(rusqlite::params![workspace_id, limit], |row| {
                let file_paths_str: String = row.get(8)?;
                let file_paths: Vec<String> =
                    serde_json::from_str(&file_paths_str).unwrap_or_default();
                Ok(MemoryObservation {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    repo_id: row.get(2)?,
                    session_id: row.get(3)?,
                    observation_type: row.get(4)?,
                    content: row.get(5)?,
                    compressed_content: row.get(6)?,
                    source_tool: row.get(7)?,
                    file_paths,
                    tokens_raw: row.get(9)?,
                    tokens_compressed: row.get(10)?,
                    created_at: row.get(11)?,
                    accessed_at: row.get(12)?,
                })
            })
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| AppError::DbError(e.to_string()))?);
        }
        Ok(results)
    }

    /// Search observations using LIKE queries on content.
    pub fn search_memory_observations(
        &self,
        query: &str,
        scope: &str,
        scope_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<MemoryObservation>, AppError> {
        let like_pattern = format!("%{}%", query);
        let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match scope {
            "workspace" => (
                "SELECT id, workspace_id, repo_id, session_id, observation_type, content,
                        compressed_content, source_tool, file_paths, tokens_raw,
                        tokens_compressed, created_at, accessed_at
                 FROM memory_observations
                 WHERE workspace_id = ?1 AND (content LIKE ?2 OR compressed_content LIKE ?2)
                 ORDER BY created_at DESC LIMIT ?3",
                vec![
                    Box::new(scope_id.unwrap_or("").to_string()),
                    Box::new(like_pattern),
                    Box::new(limit as i64),
                ],
            ),
            "repo" => (
                "SELECT id, workspace_id, repo_id, session_id, observation_type, content,
                        compressed_content, source_tool, file_paths, tokens_raw,
                        tokens_compressed, created_at, accessed_at
                 FROM memory_observations
                 WHERE repo_id = ?1 AND (content LIKE ?2 OR compressed_content LIKE ?2)
                 ORDER BY created_at DESC LIMIT ?3",
                vec![
                    Box::new(scope_id.unwrap_or("").to_string()),
                    Box::new(like_pattern),
                    Box::new(limit as i64),
                ],
            ),
            _ => (
                "SELECT id, workspace_id, repo_id, session_id, observation_type, content,
                        compressed_content, source_tool, file_paths, tokens_raw,
                        tokens_compressed, created_at, accessed_at
                 FROM memory_observations
                 WHERE content LIKE ?1 OR compressed_content LIKE ?1
                 ORDER BY created_at DESC LIMIT ?2",
                vec![
                    Box::new(like_pattern),
                    Box::new(limit as i64),
                ],
            ),
        };

        let mut stmt = self
            .conn
            .prepare(sql)
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                let file_paths_str: String = row.get(8)?;
                let file_paths: Vec<String> =
                    serde_json::from_str(&file_paths_str).unwrap_or_default();
                Ok(MemoryObservation {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    repo_id: row.get(2)?,
                    session_id: row.get(3)?,
                    observation_type: row.get(4)?,
                    content: row.get(5)?,
                    compressed_content: row.get(6)?,
                    source_tool: row.get(7)?,
                    file_paths,
                    tokens_raw: row.get(9)?,
                    tokens_compressed: row.get(10)?,
                    created_at: row.get(11)?,
                    accessed_at: row.get(12)?,
                })
            })
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| AppError::DbError(e.to_string()))?);
        }
        Ok(results)
    }

    /// Insert or replace a memory snapshot (compressed context for injection).
    pub fn upsert_memory_snapshot(&self, snapshot: &MemorySnapshot) -> Result<(), AppError> {
        let obs_ids_json =
            serde_json::to_string(&snapshot.observation_ids).unwrap_or_default();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO memory_snapshots
                 (id, scope, scope_id, category, content, observation_ids, created_at, supersedes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    snapshot.id,
                    snapshot.scope,
                    snapshot.scope_id,
                    snapshot.category,
                    snapshot.content,
                    obs_ids_json,
                    snapshot.created_at,
                    snapshot.supersedes,
                ],
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;
        Ok(())
    }

    /// Get all active snapshots for a given scope (workspace, repo, or global).
    pub fn get_memory_snapshots(
        &self,
        scope: &str,
        scope_id: Option<&str>,
    ) -> Result<Vec<MemorySnapshot>, AppError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, scope, scope_id, category, content, observation_ids,
                        created_at, supersedes
                 FROM memory_snapshots
                 WHERE scope = ?1 AND (scope_id = ?2 OR (?2 IS NULL AND scope_id IS NULL))
                 ORDER BY created_at DESC",
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let rows = stmt
            .query_map(rusqlite::params![scope, scope_id], |row| {
                let obs_ids_str: String = row.get(5)?;
                let observation_ids: Vec<String> =
                    serde_json::from_str(&obs_ids_str).unwrap_or_default();
                Ok(MemorySnapshot {
                    id: row.get(0)?,
                    scope: row.get(1)?,
                    scope_id: row.get(2)?,
                    category: row.get(3)?,
                    content: row.get(4)?,
                    observation_ids,
                    created_at: row.get(6)?,
                    supersedes: row.get(7)?,
                })
            })
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| AppError::DbError(e.to_string()))?);
        }
        Ok(results)
    }

    /// Build the full memory context string for a workspace (used by Layer 1).
    /// Returns markdown to append to the system prompt.
    pub fn build_memory_context(
        &self,
        workspace_id: &str,
        repo_id: &str,
    ) -> Result<Option<String>, AppError> {
        let mut sections: Vec<String> = Vec::new();

        // Global preferences
        let global = self.get_memory_snapshots("global", None)?;
        if !global.is_empty() {
            let items: Vec<String> = global.iter().map(|s| s.content.clone()).collect();
            sections.push(format!("### User Preferences\n{}", items.join("\n")));
        }

        // Repo-level patterns
        let repo = self.get_memory_snapshots("repo", Some(repo_id))?;
        if !repo.is_empty() {
            let items: Vec<String> = repo.iter().map(|s| s.content.clone()).collect();
            sections.push(format!("### Project Patterns\n{}", items.join("\n")));
        }

        // Workspace-specific context
        let ws = self.get_memory_snapshots("workspace", Some(workspace_id))?;
        if !ws.is_empty() {
            let items: Vec<String> = ws.iter().map(|s| s.content.clone()).collect();
            sections.push(format!("### Workspace Context\n{}", items.join("\n")));
        }

        if sections.is_empty() {
            return Ok(None);
        }

        Ok(Some(format!(
            "## Project Memory\n\n{}",
            sections.join("\n\n")
        )))
    }

    /// Delete observations older than the given number of days that haven't been accessed.
    pub fn prune_old_observations(&self, older_than_days: i64) -> Result<usize, AppError> {
        let affected = self
            .conn
            .execute(
                "DELETE FROM memory_observations
                 WHERE created_at < datetime('now', ?1)
                 AND (accessed_at IS NULL OR accessed_at < datetime('now', ?1))",
                rusqlite::params![format!("-{} days", older_than_days)],
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;
        Ok(affected)
    }

    /// Get all memory snapshots for MemPalace migration.
    pub fn get_all_memory_snapshots(&self) -> Result<Vec<MemorySnapshot>, AppError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, scope, scope_id, category, content, observation_ids,
                        created_at, supersedes
                 FROM memory_snapshots
                 ORDER BY created_at ASC",
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let obs_ids_str: String = row.get(5)?;
                let observation_ids: Vec<String> =
                    serde_json::from_str(&obs_ids_str).unwrap_or_default();
                Ok(MemorySnapshot {
                    id: row.get(0)?,
                    scope: row.get(1)?,
                    scope_id: row.get(2)?,
                    category: row.get(3)?,
                    content: row.get(4)?,
                    observation_ids,
                    created_at: row.get(6)?,
                    supersedes: row.get(7)?,
                })
            })
            .map_err(|e| AppError::DbError(e.to_string()))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| AppError::DbError(e.to_string()))?);
        }
        Ok(results)
    }

    /// Check if MemPalace migration has been completed.
    pub fn is_mempalace_migrated(&self) -> bool {
        self.conn
            .query_row(
                "SELECT value FROM kv_meta WHERE key = 'mempalace_migrated'",
                [],
                |row| row.get::<_, String>(0),
            )
            .map(|v| v == "true")
            .unwrap_or(false)
    }

    /// Mark MemPalace migration as completed.
    pub fn set_mempalace_migrated(&self) -> Result<(), AppError> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO kv_meta (key, value) VALUES ('mempalace_migrated', 'true')",
                [],
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;
        Ok(())
    }

    /// Delete all memory data for a workspace.
    pub fn clear_workspace_memory(&self, workspace_id: &str) -> Result<(), AppError> {
        self.conn
            .execute(
                "DELETE FROM memory_observations WHERE workspace_id = ?1",
                rusqlite::params![workspace_id],
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;
        self.conn
            .execute(
                "DELETE FROM memory_snapshots WHERE scope = 'workspace' AND scope_id = ?1",
                rusqlite::params![workspace_id],
            )
            .map_err(|e| AppError::DbError(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::db::Database;
    use crate::models::memory::{MemoryObservation, MemorySnapshot};

    fn test_db() -> Database {
        Database::init_in_memory().unwrap()
    }

    #[test]
    fn test_insert_and_list_observations() {
        let db = test_db();
        let obs = MemoryObservation {
            id: "obs-1".to_string(),
            workspace_id: "ws-1".to_string(),
            repo_id: "repo-1".to_string(),
            session_id: Some("sess-1".to_string()),
            observation_type: "decision".to_string(),
            content: "Chose Zustand over Redux".to_string(),
            compressed_content: None,
            source_tool: Some("Edit".to_string()),
            file_paths: vec!["src/store.ts".to_string()],
            tokens_raw: Some(50),
            tokens_compressed: None,
            created_at: "2026-04-08T12:00:00Z".to_string(),
            accessed_at: None,
        };
        db.insert_memory_observation(&obs).unwrap();

        let results = db.list_memory_observations("ws-1", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "Chose Zustand over Redux");
        assert_eq!(results[0].file_paths, vec!["src/store.ts"]);
    }

    #[test]
    fn test_search_observations() {
        let db = test_db();
        let obs = MemoryObservation {
            id: "obs-2".to_string(),
            workspace_id: "ws-1".to_string(),
            repo_id: "repo-1".to_string(),
            session_id: None,
            observation_type: "error".to_string(),
            content: "cargo build failed: missing lifetime".to_string(),
            compressed_content: None,
            source_tool: Some("Bash".to_string()),
            file_paths: vec![],
            tokens_raw: None,
            tokens_compressed: None,
            created_at: "2026-04-08T12:00:00Z".to_string(),
            accessed_at: None,
        };
        db.insert_memory_observation(&obs).unwrap();

        let results = db
            .search_memory_observations("lifetime", "workspace", Some("ws-1"), 10)
            .unwrap();
        assert_eq!(results.len(), 1);

        let no_results = db
            .search_memory_observations("nonexistent", "workspace", Some("ws-1"), 10)
            .unwrap();
        assert_eq!(no_results.len(), 0);
    }

    #[test]
    fn test_upsert_and_get_snapshots() {
        let db = test_db();
        let snapshot = MemorySnapshot {
            id: "snap-1".to_string(),
            scope: "workspace".to_string(),
            scope_id: Some("ws-1".to_string()),
            category: "decisions".to_string(),
            content: "- Chose Zustand over Redux\n- Using barrel exports".to_string(),
            observation_ids: vec!["obs-1".to_string(), "obs-2".to_string()],
            created_at: "2026-04-08T12:00:00Z".to_string(),
            supersedes: None,
        };
        db.upsert_memory_snapshot(&snapshot).unwrap();

        let results = db
            .get_memory_snapshots("workspace", Some("ws-1"))
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].category, "decisions");
        assert_eq!(results[0].observation_ids.len(), 2);
    }

    #[test]
    fn test_build_memory_context_empty() {
        let db = test_db();
        let ctx = db.build_memory_context("ws-1", "repo-1").unwrap();
        assert!(ctx.is_none());
    }

    #[test]
    fn test_build_memory_context_with_data() {
        let db = test_db();
        db.upsert_memory_snapshot(&MemorySnapshot {
            id: "snap-g".to_string(),
            scope: "global".to_string(),
            scope_id: None,
            category: "preferences".to_string(),
            content: "- Prefers TypeScript strict mode".to_string(),
            observation_ids: vec![],
            created_at: "2026-04-08T12:00:00Z".to_string(),
            supersedes: None,
        })
        .unwrap();

        db.upsert_memory_snapshot(&MemorySnapshot {
            id: "snap-r".to_string(),
            scope: "repo".to_string(),
            scope_id: Some("repo-1".to_string()),
            category: "patterns".to_string(),
            content: "- Uses Zustand for state management".to_string(),
            observation_ids: vec![],
            created_at: "2026-04-08T12:00:00Z".to_string(),
            supersedes: None,
        })
        .unwrap();

        let ctx = db.build_memory_context("ws-1", "repo-1").unwrap();
        assert!(ctx.is_some());
        let text = ctx.unwrap();
        assert!(text.contains("User Preferences"));
        assert!(text.contains("Project Patterns"));
        assert!(text.contains("TypeScript strict mode"));
        assert!(text.contains("Zustand"));
    }

    #[test]
    fn test_clear_workspace_memory() {
        let db = test_db();
        let obs = MemoryObservation {
            id: "obs-del".to_string(),
            workspace_id: "ws-del".to_string(),
            repo_id: "repo-1".to_string(),
            session_id: None,
            observation_type: "pattern".to_string(),
            content: "test content".to_string(),
            compressed_content: None,
            source_tool: None,
            file_paths: vec![],
            tokens_raw: None,
            tokens_compressed: None,
            created_at: "2026-04-08T12:00:00Z".to_string(),
            accessed_at: None,
        };
        db.insert_memory_observation(&obs).unwrap();
        assert_eq!(db.list_memory_observations("ws-del", 10).unwrap().len(), 1);

        db.clear_workspace_memory("ws-del").unwrap();
        assert_eq!(db.list_memory_observations("ws-del", 10).unwrap().len(), 0);
    }
}
