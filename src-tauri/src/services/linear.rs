use crate::error::AppError;
use crate::models::linear::LinearIssue;

pub fn search_issues(api_key: &str, query: &str) -> Result<Vec<LinearIssue>, AppError> {
    let client = reqwest::blocking::Client::new();

    let graphql_query = r#"
        query SearchIssues($query: String!) {
            issueSearch(query: $query, first: 50) {
                nodes {
                    id
                    identifier
                    title
                    url
                    priority
                    description
                    state { name }
                    team { name }
                }
            }
        }
    "#;

    let body = serde_json::json!({
        "query": graphql_query,
        "variables": { "query": query }
    });

    let response = client
        .post("https://api.linear.app/graphql")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| AppError::LinearError(format!("Failed to call Linear API: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(AppError::LinearError(format!(
            "Linear API returned {}: {}",
            status, text
        )));
    }

    let raw: serde_json::Value = response
        .json()
        .map_err(|e| AppError::LinearError(format!("Failed to parse Linear response: {}", e)))?;

    if let Some(errors) = raw.get("errors").and_then(|e| e.as_array()) {
        if let Some(first) = errors.first() {
            let msg = first
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(AppError::LinearError(format!("GraphQL error: {}", msg)));
        }
    }

    let nodes = raw
        .get("data")
        .and_then(|d| d.get("issueSearch"))
        .and_then(|s| s.get("nodes"))
        .and_then(|n| n.as_array())
        .cloned()
        .ok_or_else(|| {
            AppError::LinearError(
                "Unexpected Linear API response: missing data.issueSearch.nodes".to_string(),
            )
        })?;

    Ok(nodes
        .iter()
        .filter_map(|node| {
            Some(LinearIssue {
                id: node.get("id")?.as_str()?.to_string(),
                identifier: node.get("identifier")?.as_str()?.to_string(),
                title: node.get("title")?.as_str()?.to_string(),
                url: node.get("url")?.as_str()?.to_string(),
                state_name: node
                    .get("state")
                    .and_then(|s| s.get("name"))
                    .and_then(|n| n.as_str())
                    .map(String::from),
                priority: node
                    .get("priority")
                    .and_then(|p| p.as_i64())
                    .map(|p| p as i32),
                team_name: node
                    .get("team")
                    .and_then(|t| t.get("name"))
                    .and_then(|n| n.as_str())
                    .map(String::from),
                description: node
                    .get("description")
                    .and_then(|d| d.as_str())
                    .map(String::from),
            })
        })
        .collect())
}

pub fn get_issue(api_key: &str, issue_id: &str) -> Result<LinearIssue, AppError> {
    let client = reqwest::blocking::Client::new();

    let graphql_query = r#"
        query GetIssue($id: String!) {
            issue(id: $id) {
                id
                identifier
                title
                url
                priority
                description
                state { name }
                team { name }
            }
        }
    "#;

    let body = serde_json::json!({
        "query": graphql_query,
        "variables": { "id": issue_id }
    });

    let response = client
        .post("https://api.linear.app/graphql")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| AppError::LinearError(format!("Failed to call Linear API: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(AppError::LinearError(format!(
            "Linear API returned {}: {}",
            status, text
        )));
    }

    let raw: serde_json::Value = response
        .json()
        .map_err(|e| AppError::LinearError(format!("Failed to parse Linear response: {}", e)))?;

    if let Some(errors) = raw.get("errors").and_then(|e| e.as_array()) {
        if let Some(first) = errors.first() {
            let msg = first
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(AppError::LinearError(format!("GraphQL error: {}", msg)));
        }
    }

    let node = raw
        .get("data")
        .and_then(|d| d.get("issue"))
        .ok_or_else(|| AppError::LinearError("Issue not found".to_string()))?;

    let id = node
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::LinearError("Missing required field: id".to_string()))?;
    let identifier = node
        .get("identifier")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::LinearError("Missing required field: identifier".to_string()))?;
    let title = node
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::LinearError("Missing required field: title".to_string()))?;
    let url = node
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::LinearError("Missing required field: url".to_string()))?;

    Ok(LinearIssue {
        id: id.to_string(),
        identifier: identifier.to_string(),
        title: title.to_string(),
        url: url.to_string(),
        state_name: node
            .get("state")
            .and_then(|s| s.get("name"))
            .and_then(|n| n.as_str())
            .map(String::from),
        priority: node
            .get("priority")
            .and_then(|p| p.as_i64())
            .map(|p| p as i32),
        team_name: node
            .get("team")
            .and_then(|t| t.get("name"))
            .and_then(|n| n.as_str())
            .map(String::from),
        description: node
            .get("description")
            .and_then(|d| d.as_str())
            .map(String::from),
    })
}
