use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Notepad {
    pub id: Uuid,
    pub title: String,
    pub content: String,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotepadRequest {
    pub title: String,
    pub content: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotepadRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notepad_serde_roundtrip() {
        let notepad = Notepad {
            id: Uuid::new_v4(),
            title: "meeting notes".to_string(),
            content: "# Sprint Planning\n- Review backlog\n- Assign tasks".to_string(),
            description: Some("Weekly sprint planning notes".to_string()),
            tags: vec!["meetings".to_string(), "sprint".to_string()],
            pinned: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&notepad).unwrap();
        let deserialized: Notepad = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, notepad.id);
        assert_eq!(deserialized.title, notepad.title);
        assert_eq!(deserialized.description.as_deref(), Some("Weekly sprint planning notes"));
        assert_eq!(deserialized.tags.len(), 2);
        assert!(deserialized.pinned);
    }

    #[test]
    fn test_create_request_minimal() {
        let json = r#"{
            "title": "quick note",
            "content": "some content"
        }"#;
        let req: CreateNotepadRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.title, "quick note");
        assert_eq!(req.content, "some content");
        assert!(req.description.is_none());
        assert!(req.tags.is_none());
    }

    #[test]
    fn test_update_request_partial() {
        let json = r#"{"title": "renamed"}"#;
        let req: UpdateNotepadRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.title.as_deref(), Some("renamed"));
        assert!(req.content.is_none());
        assert!(req.tags.is_none());
        assert!(req.pinned.is_none());
    }
}
