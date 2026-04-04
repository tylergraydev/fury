use super::Database;
use crate::error::AppError;
use crate::models::repository::{RepoSettings, RunScriptMode};
use crate::models::settings::AppSettings;
use crate::models::test_runner::{TestFramework, TestRunRecord, TestRunSummary, TestRunnerConfig};
use uuid::Uuid;

impl Database {
    pub fn get_repo_settings(&self, repo_id: &Uuid) -> Result<RepoSettings, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT setup_script, run_script, archive_script, run_script_mode, env_vars, worktree_base_path, provider_override, devcontainer_config
             FROM repository_settings WHERE repo_id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![repo_id.to_string()], |row| {
            let mode_str: String = row.get(3)?;
            let env_json: String = row.get(4)?;
            let provider_json: Option<String> = row.get(6)?;
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
                provider_override: provider_json.and_then(|j| serde_json::from_str(&j).ok()),
                devcontainer: row
                    .get::<_, Option<String>>(7)?
                    .and_then(|s| serde_json::from_str(&s).ok()),
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
        let provider_json = settings
            .provider_override
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let devcontainer_json = settings
            .devcontainer
            .as_ref()
            .map(|c| serde_json::to_string(c).unwrap_or_default());
        // Use INSERT OR IGNORE + UPDATE to avoid nuking columns managed by other writers
        // (e.g. test_runner columns on the same table). Wrapped in a transaction for atomicity.
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO repository_settings (repo_id) VALUES (?1)",
            rusqlite::params![repo_id.to_string()],
        )?;
        tx.execute(
            "UPDATE repository_settings SET setup_script = ?2, run_script = ?3, archive_script = ?4, run_script_mode = ?5, env_vars = ?6, worktree_base_path = ?7, provider_override = ?8, devcontainer_config = ?9 WHERE repo_id = ?1",
            rusqlite::params![
                repo_id.to_string(),
                settings.setup_script,
                settings.run_script,
                settings.archive_script,
                mode_str,
                env_json,
                settings.worktree_base_path,
                provider_json,
                devcontainer_json,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn get_test_runner_config(&self, repo_id: &Uuid) -> Result<TestRunnerConfig, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT test_framework, test_command, test_file_command, test_working_dir, coverage_command
             FROM repository_settings WHERE repo_id = ?1",
        )?;
        let result = stmt.query_row(rusqlite::params![repo_id.to_string()], |row| {
            let fw_str: Option<String> = row.get(0)?;
            Ok(TestRunnerConfig {
                framework: fw_str.and_then(|s| {
                    serde_json::from_str::<TestFramework>(&format!("\"{}\"", s)).ok()
                }),
                test_command: row.get(1)?,
                test_file_command: row.get(2)?,
                working_dir: row.get(3)?,
                coverage_command: row.get(4)?,
            })
        });
        match result {
            Ok(config) => Ok(config),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(TestRunnerConfig::default()),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn save_test_runner_config(
        &self,
        repo_id: &Uuid,
        config: &TestRunnerConfig,
    ) -> Result<(), AppError> {
        let fw_str = config.framework.as_ref().map(|f| {
            let json = serde_json::to_string(f).unwrap_or_default();
            json.trim_matches('"').to_string()
        });
        // Ensure a row exists in repository_settings before updating.
        // Wrapped in a transaction for atomicity.
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO repository_settings (repo_id) VALUES (?1)",
            rusqlite::params![repo_id.to_string()],
        )?;
        tx.execute(
            "UPDATE repository_settings SET test_framework = ?2, test_command = ?3, test_file_command = ?4, test_working_dir = ?5, coverage_command = ?6 WHERE repo_id = ?1",
            rusqlite::params![
                repo_id.to_string(),
                fw_str,
                config.test_command,
                config.test_file_command,
                config.working_dir,
                config.coverage_command,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn insert_test_run(
        &self,
        repo_id: &Uuid,
        summary: &TestRunSummary,
    ) -> Result<(), AppError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO test_run_history (id, repo_id, total, passed, failed, skipped, duration_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                id,
                repo_id.to_string(),
                summary.total as i64,
                summary.passed as i64,
                summary.failed as i64,
                summary.skipped as i64,
                summary.duration_ms,
            ],
        )?;
        Ok(())
    }

    pub fn list_test_runs(
        &self,
        repo_id: &Uuid,
        limit: usize,
    ) -> Result<Vec<TestRunRecord>, AppError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_id, ran_at, total, passed, failed, skipped, duration_ms
             FROM test_run_history WHERE repo_id = ?1 ORDER BY ran_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![repo_id.to_string(), limit as i64],
            |row| {
                Ok(TestRunRecord {
                    id: row.get(0)?,
                    repo_id: row.get(1)?,
                    ran_at: row.get(2)?,
                    total: row.get::<_, i64>(3)? as usize,
                    passed: row.get::<_, i64>(4)? as usize,
                    failed: row.get::<_, i64>(5)? as usize,
                    skipped: row.get::<_, i64>(6)? as usize,
                    duration_ms: row.get(7)?,
                })
            },
        )?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(|e| AppError::DbError(e.to_string()))?);
        }
        Ok(records)
    }

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

    pub fn get_last_active_context(&self) -> Result<(Option<String>, Option<String>), AppError> {
        let result = self.conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'last_active_context'",
            [],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(json) => {
                let v: serde_json::Value =
                    serde_json::from_str(&json).map_err(|e| AppError::DbError(e.to_string()))?;
                let ws_id = v
                    .get("workspaceId")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                let repo_id = v.get("repoId").and_then(|v| v.as_str()).map(String::from);
                Ok((ws_id, repo_id))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok((None, None)),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn save_last_active_context(
        &self,
        workspace_id: Option<&str>,
        repo_id: Option<&str>,
    ) -> Result<(), AppError> {
        let json = serde_json::json!({
            "workspaceId": workspace_id,
            "repoId": repo_id,
        });
        self.conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_active_context', ?1)",
            rusqlite::params![json.to_string()],
        )?;
        Ok(())
    }

    pub fn get_session_id(&self, context_id: &str) -> Result<Option<String>, AppError> {
        let key = format!("session:{}", context_id);
        let result = self.conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            rusqlite::params![key],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(sid) => Ok(Some(sid)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::DbError(e.to_string())),
        }
    }

    pub fn save_session_id(&self, context_id: &str, session_id: &str) -> Result<(), AppError> {
        let key = format!("session:{}", context_id);
        self.conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, session_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::models::repository::{RepoSettings, RunScriptMode};
    use crate::models::test_runner::{TestFramework, TestRunSummary, TestRunnerConfig};
    use crate::test_helpers::*;

    #[test]
    fn test_get_default_app_settings() {
        let db = test_db();
        let settings = db.get_app_settings().unwrap();
        assert!(!settings.analytics_enabled);
    }

    #[test]
    fn test_save_and_get_app_settings() {
        let db = test_db();
        let mut settings = crate::models::settings::AppSettings::default();
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

    #[test]
    fn test_upsert_repo_settings_twice() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let mut settings1 = RepoSettings::default();
        settings1.setup_script = Some("npm install".to_string());
        db.upsert_repo_settings(&repo.id, &settings1).unwrap();
        let mut settings2 = RepoSettings::default();
        settings2.setup_script = Some("yarn install".to_string());
        settings2.run_script = Some("yarn dev".to_string());
        settings2.run_script_mode = RunScriptMode::Concurrent;
        db.upsert_repo_settings(&repo.id, &settings2).unwrap();
        let fetched = db.get_repo_settings(&repo.id).unwrap();
        assert_eq!(fetched.setup_script.as_deref(), Some("yarn install"));
        assert_eq!(fetched.run_script.as_deref(), Some("yarn dev"));
        assert!(matches!(fetched.run_script_mode, RunScriptMode::Concurrent));
    }

    #[test]
    fn test_upsert_repo_settings_with_env_vars() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let mut settings = RepoSettings::default();
        settings.env_vars = std::collections::HashMap::from([
            ("NODE_ENV".to_string(), "production".to_string()),
            ("PORT".to_string(), "3000".to_string()),
        ]);
        db.upsert_repo_settings(&repo.id, &settings).unwrap();
        let fetched = db.get_repo_settings(&repo.id).unwrap();
        assert_eq!(fetched.env_vars.get("NODE_ENV").unwrap(), "production");
        assert_eq!(fetched.env_vars.get("PORT").unwrap(), "3000");
    }

    #[test]
    fn test_get_default_test_runner_config() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let config = db.get_test_runner_config(&repo.id).unwrap();
        assert!(config.framework.is_none());
        assert!(config.test_command.is_none());
        assert!(config.test_file_command.is_none());
        assert!(config.working_dir.is_none());
        assert!(config.coverage_command.is_none());
    }

    #[test]
    fn test_save_and_get_test_runner_config() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let config = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest run".to_string()),
            test_file_command: Some("npx vitest run {{file}}".to_string()),
            working_dir: Some("/tmp/project".to_string()),
            coverage_command: Some("npx vitest --coverage".to_string()),
        };
        db.save_test_runner_config(&repo.id, &config).unwrap();
        let fetched = db.get_test_runner_config(&repo.id).unwrap();
        assert_eq!(fetched.framework, Some(TestFramework::Vitest));
        assert_eq!(fetched.test_command.as_deref(), Some("npx vitest run"));
        assert_eq!(
            fetched.test_file_command.as_deref(),
            Some("npx vitest run {{file}}")
        );
        assert_eq!(fetched.working_dir.as_deref(), Some("/tmp/project"));
        assert_eq!(
            fetched.coverage_command.as_deref(),
            Some("npx vitest --coverage")
        );
    }

    #[test]
    fn test_save_test_runner_config_update() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let config1 = TestRunnerConfig {
            framework: Some(TestFramework::Jest),
            test_command: Some("npx jest".to_string()),
            ..Default::default()
        };
        db.save_test_runner_config(&repo.id, &config1).unwrap();
        let config2 = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest run".to_string()),
            ..Default::default()
        };
        db.save_test_runner_config(&repo.id, &config2).unwrap();
        let fetched = db.get_test_runner_config(&repo.id).unwrap();
        assert_eq!(fetched.framework, Some(TestFramework::Vitest));
        assert_eq!(fetched.test_command.as_deref(), Some("npx vitest run"));
    }

    #[test]
    fn test_save_test_runner_config_does_not_clobber_repo_settings() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let mut settings = RepoSettings::default();
        settings.setup_script = Some("npm install".to_string());
        db.upsert_repo_settings(&repo.id, &settings).unwrap();
        let config = TestRunnerConfig {
            framework: Some(TestFramework::Vitest),
            test_command: Some("npx vitest".to_string()),
            ..Default::default()
        };
        db.save_test_runner_config(&repo.id, &config).unwrap();
        let fetched_settings = db.get_repo_settings(&repo.id).unwrap();
        assert_eq!(
            fetched_settings.setup_script.as_deref(),
            Some("npm install")
        );
    }

    #[test]
    fn test_insert_and_list_test_runs() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let summary = TestRunSummary {
            total: 10,
            passed: 8,
            failed: 1,
            skipped: 1,
            duration_ms: 1234.5,
            suites: vec![],
        };
        db.insert_test_run(&repo.id, &summary).unwrap();
        let runs = db.list_test_runs(&repo.id, 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].total, 10);
        assert_eq!(runs[0].passed, 8);
        assert_eq!(runs[0].failed, 1);
        assert_eq!(runs[0].skipped, 1);
        assert_eq!(runs[0].duration_ms, 1234.5);
    }

    #[test]
    fn test_list_test_runs_limit() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        for i in 0..5 {
            let summary = TestRunSummary {
                total: i + 1,
                passed: i + 1,
                failed: 0,
                skipped: 0,
                duration_ms: 100.0 * (i + 1) as f64,
                suites: vec![],
            };
            db.insert_test_run(&repo.id, &summary).unwrap();
        }
        let runs = db.list_test_runs(&repo.id, 3).unwrap();
        assert_eq!(runs.len(), 3);
    }

    #[test]
    fn test_list_test_runs_empty() {
        let db = test_db();
        let repo = test_repo();
        db.insert_repository(&repo).unwrap();
        let runs = db.list_test_runs(&repo.id, 10).unwrap();
        assert!(runs.is_empty());
    }
}
