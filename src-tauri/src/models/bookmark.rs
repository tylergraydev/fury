use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FileBookmark {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub file_path: String,
    pub line_number: u32,
    pub note: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateBookmarkRequest {
    pub repo_id: Uuid,
    pub file_path: String,
    pub line_number: u32,
    pub note: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBookmarkRequest {
    pub note: Option<String>,
    pub color: Option<String>,
    pub line_number: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_bookmark_serde_roundtrip() {
        let bookmark = FileBookmark {
            id: Uuid::new_v4(),
            repo_id: Uuid::new_v4(),
            file_path: "src/main.ts".to_string(),
            line_number: 42,
            note: Some("Important function".to_string()),
            color: Some("blue".to_string()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&bookmark).unwrap();
        let deserialized: FileBookmark = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, bookmark.id);
        assert_eq!(deserialized.file_path, "src/main.ts");
        assert_eq!(deserialized.line_number, 42);
        assert_eq!(deserialized.note.as_deref(), Some("Important function"));
        assert_eq!(deserialized.color.as_deref(), Some("blue"));
    }

    #[test]
    fn test_create_request_minimal() {
        let json = r#"{
            "repoId": "550e8400-e29b-41d4-a716-446655440000",
            "filePath": "src/lib.rs",
            "lineNumber": 10
        }"#;
        let req: CreateBookmarkRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.file_path, "src/lib.rs");
        assert_eq!(req.line_number, 10);
        assert!(req.note.is_none());
        assert!(req.color.is_none());
    }

    #[test]
    fn test_update_request_partial() {
        let json = r#"{"note": "Updated note"}"#;
        let req: UpdateBookmarkRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.note.as_deref(), Some("Updated note"));
        assert!(req.color.is_none());
        assert!(req.line_number.is_none());
    }
}
