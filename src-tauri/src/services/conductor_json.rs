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
