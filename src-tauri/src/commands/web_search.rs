use crate::error::AppError;
use crate::models::web_search::WebSearchResult;
use serde::Deserialize;

#[derive(Deserialize)]
struct DdgResponse {
    #[serde(rename = "AbstractText")]
    abstract_text: Option<String>,
    #[serde(rename = "AbstractURL")]
    abstract_url: Option<String>,
    #[serde(rename = "Heading")]
    heading: Option<String>,
    #[serde(rename = "RelatedTopics")]
    related_topics: Option<Vec<DdgTopic>>,
}

#[derive(Deserialize)]
struct DdgTopic {
    #[serde(rename = "Text")]
    text: Option<String>,
    #[serde(rename = "FirstURL")]
    first_url: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn web_search(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<WebSearchResult>, AppError> {
    let limit = limit.unwrap_or(5) as usize;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Fury/1.0")
        .build()
        .map_err(|e| AppError::InternalError(format!("HTTP client error: {}", e)))?;

    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        urlencoding::encode(&query)
    );

    let response: DdgResponse = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::InternalError(format!("Search request failed: {}", e)))?
        .error_for_status()
        .map_err(|e| AppError::InternalError(format!("DuckDuckGo returned error: {}", e)))?
        .json()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to parse search results: {}", e)))?;

    let mut results = Vec::new();

    if let (Some(text), Some(url)) = (&response.abstract_text, &response.abstract_url) {
        if !text.is_empty() {
            results.push(WebSearchResult {
                title: response.heading.clone().unwrap_or_default(),
                url: url.clone(),
                snippet: text.clone(),
            });
        }
    }

    if let Some(topics) = response.related_topics {
        for topic in topics {
            if results.len() >= limit {
                break;
            }
            if let (Some(text), Some(url)) = (topic.text, topic.first_url) {
                results.push(WebSearchResult {
                    title: text.chars().take(80).collect::<String>(),
                    url,
                    snippet: text,
                });
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ddg_response_deserialize() {
        let json = r#"{"AbstractText":"Test","AbstractURL":"https://example.com","Heading":"Test","RelatedTopics":[]}"#;
        let response: DdgResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.abstract_text.as_deref(), Some("Test"));
        assert_eq!(response.heading.as_deref(), Some("Test"));
    }
}
