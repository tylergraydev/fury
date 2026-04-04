use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTemplate {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub archive_script: Option<String>,
    pub run_script_mode: String,
    pub env_vars: HashMap<String, String>,
    pub sparse_dirs: Option<Vec<String>>,
    pub auto_commit: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceTemplateRequest {
    pub repo_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub archive_script: Option<String>,
    pub run_script_mode: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
    pub sparse_dirs: Option<Vec<String>>,
    pub auto_commit: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspaceTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub archive_script: Option<String>,
    pub run_script_mode: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
    pub sparse_dirs: Option<Vec<String>>,
    pub auto_commit: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_template_serde_roundtrip() {
        let template = WorkspaceTemplate {
            id: Uuid::new_v4(),
            repo_id: Uuid::new_v4(),
            name: "my-template".to_string(),
            description: Some("A test template".to_string()),
            setup_script: Some("npm install".to_string()),
            run_script: Some("npm start".to_string()),
            archive_script: None,
            run_script_mode: "nonconcurrent".to_string(),
            env_vars: HashMap::from([("NODE_ENV".to_string(), "development".to_string())]),
            sparse_dirs: Some(vec!["src".to_string(), "tests".to_string()]),
            auto_commit: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&template).unwrap();
        let deserialized: WorkspaceTemplate = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, template.id);
        assert_eq!(deserialized.name, template.name);
        assert_eq!(
            deserialized.env_vars.get("NODE_ENV").unwrap(),
            "development"
        );
        assert_eq!(deserialized.sparse_dirs.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_create_request_minimal() {
        let json = r#"{
            "repoId": "550e8400-e29b-41d4-a716-446655440000",
            "name": "basic"
        }"#;
        let req: CreateWorkspaceTemplateRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.name, "basic");
        assert!(req.description.is_none());
        assert!(req.setup_script.is_none());
        assert!(req.env_vars.is_none());
        assert!(req.auto_commit.is_none());
    }

    #[test]
    fn test_update_request_partial() {
        let json = r#"{"name": "renamed"}"#;
        let req: UpdateWorkspaceTemplateRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.name.as_deref(), Some("renamed"));
        assert!(req.setup_script.is_none());
    }
}
