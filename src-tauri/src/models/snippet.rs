use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: Uuid,
    pub title: String,
    pub content: String,
    pub language: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub source: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnippetRequest {
    pub title: String,
    pub content: String,
    pub language: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnippetRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub source: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snippet_serde_roundtrip() {
        let snippet = Snippet {
            id: Uuid::new_v4(),
            title: "fetch helper".to_string(),
            content: "async function fetchJSON(url) { ... }".to_string(),
            language: Some("typescript".to_string()),
            description: Some("Typed fetch wrapper".to_string()),
            tags: vec!["http".to_string(), "utility".to_string()],
            source: Some("chat".to_string()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&snippet).unwrap();
        let deserialized: Snippet = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, snippet.id);
        assert_eq!(deserialized.title, snippet.title);
        assert_eq!(deserialized.language.as_deref(), Some("typescript"));
        assert_eq!(deserialized.tags.len(), 2);
    }

    #[test]
    fn test_create_request_minimal() {
        let json = r#"{
            "title": "quick snippet",
            "content": "console.log('hi')"
        }"#;
        let req: CreateSnippetRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.title, "quick snippet");
        assert_eq!(req.content, "console.log('hi')");
        assert!(req.language.is_none());
        assert!(req.description.is_none());
        assert!(req.tags.is_none());
        assert!(req.source.is_none());
    }

    #[test]
    fn test_update_request_partial() {
        let json = r#"{"title": "renamed"}"#;
        let req: UpdateSnippetRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.title.as_deref(), Some("renamed"));
        assert!(req.content.is_none());
        assert!(req.language.is_none());
        assert!(req.tags.is_none());
    }
}
