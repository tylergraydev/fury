use super::Database;
use crate::error::AppError;
use crate::models::workspace_template::WorkspaceTemplate;
use chrono::{DateTime, Utc};
use uuid::Uuid;

impl Database {
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

#[cfg(test)]
mod tests {
    use crate::test_helpers::*;
    use chrono::Utc;
    use uuid::Uuid;

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
}
