use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UrlContent {
    pub url: String,
    pub title: Option<String>,
    pub content: String,
    pub content_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serde_roundtrip() {
        let content = UrlContent {
            url: "https://example.com".to_string(),
            title: Some("Example".to_string()),
            content: "Hello world".to_string(),
            content_type: "text/html".to_string(),
        };
        let json = serde_json::to_string(&content).unwrap();
        let deserialized: UrlContent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.url, content.url);
        assert_eq!(deserialized.title, content.title);
        assert_eq!(deserialized.content, content.content);
        assert_eq!(deserialized.content_type, content.content_type);
    }

    #[test]
    fn test_serde_roundtrip_no_title() {
        let content = UrlContent {
            url: "https://example.com".to_string(),
            title: None,
            content: "Plain text".to_string(),
            content_type: "text/plain".to_string(),
        };
        let json = serde_json::to_string(&content).unwrap();
        let deserialized: UrlContent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.title, None);
    }
}
