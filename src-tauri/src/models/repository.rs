use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: Uuid,
    pub name: String,
    pub path: PathBuf,
    pub default_branch: String,
    /// Current checked-out branch, populated at query time.
    #[serde(default)]
    pub current_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoSettings {
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub archive_script: Option<String>,
    pub run_script_mode: RunScriptMode,
    pub env_vars: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RunScriptMode {
    Concurrent,
    #[default]
    Nonconcurrent,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConductorJson {
    #[serde(default)]
    pub scripts: ConductorScripts,
    #[serde(default)]
    pub run_script_mode: Option<RunScriptMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConductorScripts {
    pub setup: Option<String>,
    pub run: Option<String>,
    pub archive: Option<String>,
}
