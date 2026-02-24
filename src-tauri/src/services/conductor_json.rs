use std::path::Path;

use crate::error::AppError;
use crate::models::repository::{ConductorJson, RepoSettings, RunScriptMode};

/// Load and parse conductor.json from the given repository root.
/// Returns None if the file doesn't exist.
pub fn load_conductor_json(repo_path: &Path) -> Result<Option<ConductorJson>, AppError> {
    let path = repo_path.join("conductor.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)?;
    let config: ConductorJson = serde_json::from_str(&content)?;
    Ok(Some(config))
}

/// Merge conductor.json scripts with DB-persisted RepoSettings.
/// DB settings take precedence; conductor.json provides defaults.
pub fn merge_settings(
    db_settings: &RepoSettings,
    conductor_json: Option<&ConductorJson>,
) -> RepoSettings {
    let cj = match conductor_json {
        Some(cj) => cj,
        None => return db_settings.clone(),
    };

    RepoSettings {
        setup_script: db_settings
            .setup_script
            .clone()
            .or_else(|| cj.scripts.setup.clone()),
        run_script: db_settings
            .run_script
            .clone()
            .or_else(|| cj.scripts.run.clone()),
        archive_script: db_settings
            .archive_script
            .clone()
            .or_else(|| cj.scripts.archive.clone()),
        run_script_mode: match db_settings.run_script_mode {
            RunScriptMode::Nonconcurrent => cj
                .run_script_mode
                .clone()
                .unwrap_or(RunScriptMode::Nonconcurrent),
            ref mode => mode.clone(),
        },
        env_vars: db_settings.env_vars.clone(),
        worktree_base_path: db_settings.worktree_base_path.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::repository::ConductorScripts;

    #[test]
    fn test_merge_settings_no_conductor_json() {
        let db = RepoSettings {
            setup_script: Some("npm install".to_string()),
            ..Default::default()
        };
        let result = merge_settings(&db, None);
        assert_eq!(result.setup_script.as_deref(), Some("npm install"));
    }

    #[test]
    fn test_merge_settings_conductor_provides_defaults() {
        let db = RepoSettings::default();
        let cj = ConductorJson {
            scripts: ConductorScripts {
                setup: Some("yarn install".to_string()),
                run: Some("yarn dev".to_string()),
                archive: None,
            },
            run_script_mode: None,
        };
        let result = merge_settings(&db, Some(&cj));
        assert_eq!(result.setup_script.as_deref(), Some("yarn install"));
        assert_eq!(result.run_script.as_deref(), Some("yarn dev"));
        assert!(result.archive_script.is_none());
    }

    #[test]
    fn test_merge_settings_db_takes_precedence() {
        let db = RepoSettings {
            setup_script: Some("npm install".to_string()),
            ..Default::default()
        };
        let cj = ConductorJson {
            scripts: ConductorScripts {
                setup: Some("yarn install".to_string()),
                ..Default::default()
            },
            run_script_mode: None,
        };
        let result = merge_settings(&db, Some(&cj));
        assert_eq!(result.setup_script.as_deref(), Some("npm install"));
    }

    #[test]
    fn test_merge_settings_run_script_mode_from_conductor() {
        let db = RepoSettings::default(); // Nonconcurrent
        let cj = ConductorJson {
            scripts: Default::default(),
            run_script_mode: Some(RunScriptMode::Concurrent),
        };
        let result = merge_settings(&db, Some(&cj));
        assert!(matches!(result.run_script_mode, RunScriptMode::Concurrent));
    }

    #[test]
    fn test_merge_settings_env_vars_from_db() {
        let mut env = std::collections::HashMap::new();
        env.insert("MY_VAR".to_string(), "value".to_string());
        let db = RepoSettings {
            env_vars: env.clone(),
            ..Default::default()
        };
        let cj = ConductorJson::default();
        let result = merge_settings(&db, Some(&cj));
        assert_eq!(result.env_vars.get("MY_VAR").unwrap(), "value");
    }
}
