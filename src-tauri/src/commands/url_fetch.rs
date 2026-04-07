use crate::error::AppError;
use crate::models::url_content::UrlContent;

const MAX_CONTENT_LENGTH: usize = 10_000;

#[tauri::command]
#[specta::specta]
pub async fn fetch_url_content(url: String) -> Result<UrlContent, AppError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::InternalError(
            "URL must start with http:// or https://".into(),
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Fury/1.0")
        .build()
        .map_err(|e| AppError::InternalError(format!("HTTP client error: {}", e)))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to fetch URL: {}", e)))?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("text/plain")
        .to_string();

    let body = response
        .text()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to read response: {}", e)))?;

    let (title, content) = if content_type.contains("text/html") {
        extract_html_content(&body)
    } else {
        (None, body)
    };

    let content = if content.len() > MAX_CONTENT_LENGTH {
        format!(
            "{}...\n[truncated — {} chars total]",
            &content[..MAX_CONTENT_LENGTH],
            content.len()
        )
    } else {
        content
    };

    Ok(UrlContent {
        url,
        title,
        content,
        content_type,
    })
}

fn extract_html_content(html: &str) -> (Option<String>, String) {
    let title = extract_tag_content(html, "title");

    let mut text = html.to_string();
    for tag in &["script", "style", "noscript"] {
        while let Some(start) = text.to_lowercase().find(&format!("<{}", tag)) {
            let close_tag = format!("</{}>", tag);
            if let Some(end_offset) = text[start..].to_lowercase().find(&close_tag) {
                let end = start + end_offset + close_tag.len();
                text.replace_range(start..end, " ");
            } else {
                break;
            }
        }
    }

    let text = text
        .replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
        .replace("</p>", "\n").replace("</div>", "\n").replace("</li>", "\n")
        .replace("</h1>", "\n").replace("</h2>", "\n").replace("</h3>", "\n");

    let mut result = String::new();
    let mut in_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }

    let result = result
        .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");

    let lines: Vec<&str> = result.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    (title, lines.join("\n"))
}

fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let start_pos = lower.find(&open)?;
    let gt_pos = html[start_pos..].find('>')? + start_pos + 1;
    let end_pos = lower[gt_pos..].find(&close)? + gt_pos;
    Some(html[gt_pos..end_pos].trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_html_with_title() {
        let html = "<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>";
        let (title, content) = extract_html_content(html);
        assert_eq!(title.as_deref(), Some("Test Page"));
        assert!(content.contains("Hello world"));
    }

    #[test]
    fn test_extract_html_strips_scripts() {
        let html = "<p>Before</p><script>alert('x')</script><p>After</p>";
        let (_, content) = extract_html_content(html);
        assert!(content.contains("Before"));
        assert!(content.contains("After"));
        assert!(!content.contains("alert"));
    }

    #[test]
    fn test_extract_html_decodes_entities() {
        let html = "<p>A &amp; B &lt; C</p>";
        let (_, content) = extract_html_content(html);
        assert!(content.contains("A & B < C"));
    }

    #[test]
    fn test_extract_tag_content() {
        assert_eq!(extract_tag_content("<title>Hello</title>", "title"), Some("Hello".into()));
        assert_eq!(extract_tag_content("<p>no title</p>", "title"), None);
    }
}
