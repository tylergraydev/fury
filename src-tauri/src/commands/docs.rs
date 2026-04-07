use crate::error::AppError;
use crate::models::docs::DocLibrary;

#[tauri::command]
#[specta::specta]
pub async fn resolve_library_id(
    library_name: String,
) -> Result<Vec<DocLibrary>, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Fury/1.0")
        .build()
        .map_err(|e| AppError::InternalError(format!("HTTP client error: {}", e)))?;

    let url = format!(
        "https://context7.com/api/v1/search?query={}",
        urlencoding::encode(&library_name)
    );

    let response = match client.get(&url).send().await {
        Ok(resp) => resp,
        Err(_) => {
            return Ok(vec![DocLibrary {
                id: library_name.clone(),
                name: library_name,
                version: None,
            }]);
        }
    };

    #[derive(serde::Deserialize)]
    struct Context7Result {
        id: Option<String>,
        name: Option<String>,
        version: Option<String>,
    }

    let results: Vec<Context7Result> = response.json().await.unwrap_or_default();

    if results.is_empty() {
        return Ok(vec![DocLibrary {
            id: library_name.clone(),
            name: library_name,
            version: None,
        }]);
    }

    Ok(results
        .into_iter()
        .map(|r| DocLibrary {
            id: r.id.unwrap_or_else(|| library_name.clone()),
            name: r.name.unwrap_or_else(|| library_name.clone()),
            version: r.version,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn query_library_docs(
    library_id: String,
    query: String,
) -> Result<String, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Fury/1.0")
        .build()
        .map_err(|e| AppError::InternalError(format!("HTTP client error: {}", e)))?;

    let url = format!(
        "https://context7.com/api/v1/{}/search?query={}",
        urlencoding::encode(&library_id),
        urlencoding::encode(&query)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::InternalError(format!("Docs fetch failed: {}", e)))?;

    let text = response
        .text()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read docs response: {}", e)))?;

    Ok(text)
}
