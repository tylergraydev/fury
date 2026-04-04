use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: Uuid,
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatePromptRequest {
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePromptRequest {
    pub name: Option<String>,
    pub content: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_serde_roundtrip() {
        let prompt = Prompt {
            id: Uuid::new_v4(),
            name: "code-review".to_string(),
            content: "Review {{file}} for {{issue_type}} issues".to_string(),
            description: Some("A code review prompt".to_string()),
            category: Some("Code Review".to_string()),
            tags: vec!["review".to_string(), "quality".to_string()],
            sort_order: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&prompt).unwrap();
        let deserialized: Prompt = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, prompt.id);
        assert_eq!(deserialized.name, prompt.name);
        assert_eq!(deserialized.tags.len(), 2);
        assert_eq!(deserialized.tags[0], "review");
    }

    #[test]
    fn test_create_request_minimal() {
        let json = r#"{
            "name": "basic",
            "content": "Hello world"
        }"#;
        let req: CreatePromptRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.name, "basic");
        assert_eq!(req.content, "Hello world");
        assert!(req.description.is_none());
        assert!(req.category.is_none());
        assert!(req.tags.is_none());
    }

    #[test]
    fn test_update_request_partial() {
        let json = r#"{"name": "renamed"}"#;
        let req: UpdatePromptRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.name.as_deref(), Some("renamed"));
        assert!(req.content.is_none());
        assert!(req.category.is_none());
    }
}
