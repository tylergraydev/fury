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

#[allow(dead_code)]
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

// --- Extracted pure parsing logic for testability ---

/// Parse the search response JSON into a list of LinearIssue.
#[allow(dead_code)]
pub fn parse_search_response(raw: &serde_json::Value) -> Result<Vec<LinearIssue>, AppError> {
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

    Ok(nodes.iter().filter_map(parse_node_to_issue).collect())
}

/// Parse a single issue response JSON into a LinearIssue.
#[allow(dead_code)]
pub fn parse_issue_response(raw: &serde_json::Value) -> Result<LinearIssue, AppError> {
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

/// Parse a single JSON node into a LinearIssue. Returns None if required fields are missing.
#[allow(dead_code)]
fn parse_node_to_issue(node: &serde_json::Value) -> Option<LinearIssue> {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_search_response_full() {
        let raw = json!({
            "data": {
                "issueSearch": {
                    "nodes": [
                        {
                            "id": "id-1",
                            "identifier": "PROJ-1",
                            "title": "Fix login bug",
                            "url": "https://linear.app/proj/issue/PROJ-1",
                            "priority": 2,
                            "description": "Users can't log in",
                            "state": { "name": "In Progress" },
                            "team": { "name": "Backend" }
                        },
                        {
                            "id": "id-2",
                            "identifier": "PROJ-2",
                            "title": "Add search",
                            "url": "https://linear.app/proj/issue/PROJ-2",
                            "priority": 1,
                            "description": null,
                            "state": null,
                            "team": null
                        }
                    ]
                }
            }
        });

        let issues = parse_search_response(&raw).unwrap();
        assert_eq!(issues.len(), 2);

        assert_eq!(issues[0].id, "id-1");
        assert_eq!(issues[0].identifier, "PROJ-1");
        assert_eq!(issues[0].title, "Fix login bug");
        assert_eq!(issues[0].state_name.as_deref(), Some("In Progress"));
        assert_eq!(issues[0].priority, Some(2));
        assert_eq!(issues[0].team_name.as_deref(), Some("Backend"));
        assert_eq!(issues[0].description.as_deref(), Some("Users can't log in"));

        assert_eq!(issues[1].id, "id-2");
        assert!(issues[1].state_name.is_none());
        assert!(issues[1].team_name.is_none());
        assert!(issues[1].description.is_none());
    }

    #[test]
    fn test_parse_search_response_empty_nodes() {
        let raw = json!({
            "data": {
                "issueSearch": {
                    "nodes": []
                }
            }
        });
        let issues = parse_search_response(&raw).unwrap();
        assert!(issues.is_empty());
    }

    #[test]
    fn test_parse_search_response_missing_data() {
        let raw = json!({});
        let result = parse_search_response(&raw);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("missing data.issueSearch.nodes"));
    }

    #[test]
    fn test_parse_search_response_graphql_error() {
        let raw = json!({
            "errors": [
                { "message": "Not authorized" }
            ]
        });
        let result = parse_search_response(&raw);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("GraphQL error"));
        assert!(err.contains("Not authorized"));
    }

    #[test]
    fn test_parse_search_response_graphql_error_no_message() {
        let raw = json!({
            "errors": [
                { "code": "INTERNAL_ERROR" }
            ]
        });
        let result = parse_search_response(&raw);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unknown error"));
    }

    #[test]
    fn test_parse_search_response_empty_errors_array_still_parses() {
        let raw = json!({
            "errors": [],
            "data": {
                "issueSearch": {
                    "nodes": [
                        {
                            "id": "id-1",
                            "identifier": "X-1",
                            "title": "T",
                            "url": "http://example.com"
                        }
                    ]
                }
            }
        });
        let issues = parse_search_response(&raw).unwrap();
        assert_eq!(issues.len(), 1);
    }

    #[test]
    fn test_parse_search_response_skips_incomplete_nodes() {
        let raw = json!({
            "data": {
                "issueSearch": {
                    "nodes": [
                        { "id": "id-1" },
                        {
                            "id": "id-2",
                            "identifier": "P-2",
                            "title": "Valid",
                            "url": "http://valid.com"
                        }
                    ]
                }
            }
        });
        let issues = parse_search_response(&raw).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].identifier, "P-2");
    }

    #[test]
    fn test_parse_issue_response_full() {
        let raw = json!({
            "data": {
                "issue": {
                    "id": "issue-abc",
                    "identifier": "TEAM-42",
                    "title": "Implement feature",
                    "url": "https://linear.app/team/issue/TEAM-42",
                    "priority": 3,
                    "description": "Detailed description here",
                    "state": { "name": "Todo" },
                    "team": { "name": "Frontend" }
                }
            }
        });

        let issue = parse_issue_response(&raw).unwrap();
        assert_eq!(issue.id, "issue-abc");
        assert_eq!(issue.identifier, "TEAM-42");
        assert_eq!(issue.title, "Implement feature");
        assert_eq!(issue.url, "https://linear.app/team/issue/TEAM-42");
        assert_eq!(issue.priority, Some(3));
        assert_eq!(
            issue.description.as_deref(),
            Some("Detailed description here")
        );
        assert_eq!(issue.state_name.as_deref(), Some("Todo"));
        assert_eq!(issue.team_name.as_deref(), Some("Frontend"));
    }

    #[test]
    fn test_parse_issue_response_minimal() {
        let raw = json!({
            "data": {
                "issue": {
                    "id": "id-1",
                    "identifier": "X-1",
                    "title": "Minimal",
                    "url": "http://example.com"
                }
            }
        });
        let issue = parse_issue_response(&raw).unwrap();
        assert_eq!(issue.id, "id-1");
        assert!(issue.state_name.is_none());
        assert!(issue.priority.is_none());
        assert!(issue.team_name.is_none());
        assert!(issue.description.is_none());
    }

    #[test]
    fn test_parse_issue_response_missing_issue() {
        let raw = json!({ "data": {} });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Issue not found"));
    }

    #[test]
    fn test_parse_issue_response_missing_required_id() {
        let raw = json!({
            "data": {
                "issue": {
                    "identifier": "X-1",
                    "title": "T",
                    "url": "http://x.com"
                }
            }
        });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required field: id"));
    }

    #[test]
    fn test_parse_issue_response_missing_required_identifier() {
        let raw = json!({
            "data": {
                "issue": {
                    "id": "id-1",
                    "title": "T",
                    "url": "http://x.com"
                }
            }
        });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("identifier"));
    }

    #[test]
    fn test_parse_issue_response_missing_required_title() {
        let raw = json!({
            "data": {
                "issue": {
                    "id": "id-1",
                    "identifier": "X-1",
                    "url": "http://x.com"
                }
            }
        });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("title"));
    }

    #[test]
    fn test_parse_issue_response_missing_required_url() {
        let raw = json!({
            "data": {
                "issue": {
                    "id": "id-1",
                    "identifier": "X-1",
                    "title": "T"
                }
            }
        });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("url"));
    }

    #[test]
    fn test_parse_issue_response_graphql_error() {
        let raw = json!({
            "errors": [
                { "message": "Rate limited" }
            ]
        });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Rate limited"));
    }

    #[test]
    fn test_parse_node_to_issue_complete() {
        let node = json!({
            "id": "n1",
            "identifier": "P-1",
            "title": "Node test",
            "url": "http://n.com",
            "priority": 0,
            "state": { "name": "Done" },
            "team": { "name": "Ops" },
            "description": "desc"
        });
        let issue = parse_node_to_issue(&node).unwrap();
        assert_eq!(issue.priority, Some(0));
        assert_eq!(issue.state_name.as_deref(), Some("Done"));
    }

    #[test]
    fn test_parse_node_to_issue_missing_id_returns_none() {
        let node = json!({
            "identifier": "P-1",
            "title": "T",
            "url": "http://x.com"
        });
        assert!(parse_node_to_issue(&node).is_none());
    }

    #[test]
    fn test_parse_node_to_issue_null_optional_fields() {
        let node = json!({
            "id": "n1",
            "identifier": "P-1",
            "title": "T",
            "url": "http://x.com",
            "priority": null,
            "state": null,
            "team": null,
            "description": null
        });
        let issue = parse_node_to_issue(&node).unwrap();
        assert!(issue.priority.is_none());
        assert!(issue.state_name.is_none());
        assert!(issue.team_name.is_none());
        assert!(issue.description.is_none());
    }

    #[test]
    fn test_parse_node_to_issue_id_is_number_returns_none() {
        let node = json!({
            "id": 123,
            "identifier": "P-1",
            "title": "T",
            "url": "http://x.com"
        });
        assert!(parse_node_to_issue(&node).is_none());
    }

    // --- Additional edge case tests ---

    #[test]
    fn test_parse_search_response_missing_issue_search() {
        let raw = json!({"data": {}});
        let result = parse_search_response(&raw);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("missing data.issueSearch.nodes"));
    }

    #[test]
    fn test_parse_search_response_nodes_not_array() {
        let raw = json!({"data": {"issueSearch": {"nodes": "not an array"}}});
        let result = parse_search_response(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_search_response_missing_nodes() {
        let raw = json!({"data": {"issueSearch": {}}});
        let result = parse_search_response(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_issue_response_empty_errors_array_continues() {
        let raw = json!({
            "errors": [],
            "data": {
                "issue": {
                    "id": "id-1",
                    "identifier": "X-1",
                    "title": "T",
                    "url": "http://example.com"
                }
            }
        });
        let issue = parse_issue_response(&raw).unwrap();
        assert_eq!(issue.id, "id-1");
    }

    #[test]
    fn test_parse_issue_response_graphql_error_no_message() {
        let raw = json!({
            "errors": [
                { "code": "INTERNAL" }
            ]
        });
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown error"));
    }

    #[test]
    fn test_parse_node_to_issue_missing_identifier() {
        let node = json!({"id": "n1", "title": "T", "url": "http://x.com"});
        assert!(parse_node_to_issue(&node).is_none());
    }

    #[test]
    fn test_parse_node_to_issue_missing_title() {
        let node = json!({"id": "n1", "identifier": "P-1", "url": "http://x.com"});
        assert!(parse_node_to_issue(&node).is_none());
    }

    #[test]
    fn test_parse_node_to_issue_missing_url() {
        let node = json!({"id": "n1", "identifier": "P-1", "title": "T"});
        assert!(parse_node_to_issue(&node).is_none());
    }

    #[test]
    fn test_parse_node_to_issue_state_without_name() {
        let node = json!({
            "id": "n1", "identifier": "P-1", "title": "T", "url": "http://x.com",
            "state": {"id": "s1"}
        });
        let issue = parse_node_to_issue(&node).unwrap();
        assert!(issue.state_name.is_none());
    }

    #[test]
    fn test_parse_node_to_issue_team_without_name() {
        let node = json!({
            "id": "n1", "identifier": "P-1", "title": "T", "url": "http://x.com",
            "team": {"id": "t1"}
        });
        let issue = parse_node_to_issue(&node).unwrap();
        assert!(issue.team_name.is_none());
    }

    #[test]
    fn test_parse_node_to_issue_priority_not_number() {
        let node = json!({
            "id": "n1", "identifier": "P-1", "title": "T", "url": "http://x.com",
            "priority": "high"
        });
        let issue = parse_node_to_issue(&node).unwrap();
        assert!(issue.priority.is_none());
    }

    #[test]
    fn test_parse_search_response_data_null() {
        let raw = json!({"data": null});
        let result = parse_search_response(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_issue_response_data_null() {
        let raw = json!({"data": null});
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_issue_response_issue_node_empty_object() {
        let raw = json!({"data": {"issue": {}}});
        let result = parse_issue_response(&raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("id"));
    }
}
