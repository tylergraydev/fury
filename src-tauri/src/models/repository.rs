use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

use crate::models::settings::ProviderConfig;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GitProvider {
    #[default]
    GitHub,
    AzureDevOps,
    Unknown,
}

impl GitProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            GitProvider::GitHub => "github",
            GitProvider::AzureDevOps => "azure_devops",
            GitProvider::Unknown => "unknown",
        }
    }

    pub fn from_db_str(s: &str) -> Self {
        match s {
            "azure_devops" => GitProvider::AzureDevOps,
            "unknown" => GitProvider::Unknown,
            _ => GitProvider::GitHub,
        }
    }
}

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
    #[serde(default)]
    pub provider: GitProvider,
    #[serde(default)]
    pub remote_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoSettings {
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub archive_script: Option<String>,
    pub run_script_mode: RunScriptMode,
    pub env_vars: std::collections::HashMap<String, String>,
    pub worktree_base_path: Option<String>,
    #[serde(default)]
    pub provider_override: Option<ProviderConfig>,
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
pub struct FuryJson {
    #[serde(default)]
    pub scripts: FuryScripts,
    #[serde(default)]
    pub run_script_mode: Option<RunScriptMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FuryScripts {
    pub setup: Option<String>,
    pub run: Option<String>,
    pub archive: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repo_settings_default() {
        let s = RepoSettings::default();
        assert!(s.setup_script.is_none());
        assert!(s.run_script.is_none());
        assert!(s.archive_script.is_none());
        assert!(matches!(s.run_script_mode, RunScriptMode::Nonconcurrent));
        assert!(s.env_vars.is_empty());
        assert!(s.worktree_base_path.is_none());
    }

    #[test]
    fn test_run_script_mode_serde() {
        let concurrent: RunScriptMode = serde_json::from_str("\"concurrent\"").unwrap();
        assert!(matches!(concurrent, RunScriptMode::Concurrent));

        let nonconcurrent: RunScriptMode = serde_json::from_str("\"nonconcurrent\"").unwrap();
        assert!(matches!(nonconcurrent, RunScriptMode::Nonconcurrent));
    }

    #[test]
    fn test_git_provider_serde() {
        let gh: GitProvider = serde_json::from_str("\"git_hub\"").unwrap();
        assert_eq!(gh, GitProvider::GitHub);

        let ado: GitProvider = serde_json::from_str("\"azure_dev_ops\"").unwrap();
        assert_eq!(ado, GitProvider::AzureDevOps);

        let unknown: GitProvider = serde_json::from_str("\"unknown\"").unwrap();
        assert_eq!(unknown, GitProvider::Unknown);
    }

    #[test]
    fn test_git_provider_default() {
        let p = GitProvider::default();
        assert_eq!(p, GitProvider::GitHub);
    }

    #[test]
    fn test_git_provider_db_roundtrip() {
        assert_eq!(GitProvider::from_db_str("github"), GitProvider::GitHub);
        assert_eq!(
            GitProvider::from_db_str("azure_devops"),
            GitProvider::AzureDevOps
        );
        assert_eq!(GitProvider::from_db_str("unknown"), GitProvider::Unknown);
        assert_eq!(
            GitProvider::from_db_str("anything_else"),
            GitProvider::GitHub
        );
    }

    #[test]
    fn test_fury_json_serde() {
        let json = r#"{
            "scripts": {
                "setup": "npm install",
                "run": "npm start",
                "archive": null
            },
            "runScriptMode": "concurrent"
        }"#;
        let cj: FuryJson = serde_json::from_str(json).unwrap();
        assert_eq!(cj.scripts.setup.as_deref(), Some("npm install"));
        assert_eq!(cj.scripts.run.as_deref(), Some("npm start"));
        assert!(cj.scripts.archive.is_none());
        assert!(matches!(
            cj.run_script_mode,
            Some(RunScriptMode::Concurrent)
        ));
    }
}
