use std::path::Path;

use crate::error::AppError;
use crate::models::pr::{IssueDetail, IssueListItem};
use crate::platform;

use super::find_gh_binary;

/// Parse a list of `IssueListItem` from the JSON array returned by `gh issue list`.
pub fn parse_issue_list_from_json(raw: &[serde_json::Value]) -> Vec<IssueListItem> {
    raw.iter()
        .filter_map(|issue| {
            let number = issue.get("number").and_then(|v| v.as_u64())? as u32;
            Some(IssueListItem {
                number,
                title: issue
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                body: issue
                    .get("body")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                state: issue
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                labels: issue
                    .get("labels")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|l| {
                                l.get("name").and_then(|n| n.as_str()).map(String::from)
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            })
        })
        .collect()
}

pub fn list_repo_issues(repo_path: &Path) -> Result<Vec<IssueListItem>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "issue",
            "list",
            "--json",
            "number,title,body,labels,state",
            "--limit",
            "50",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh issue list: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh issue list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh issue list output: {}", e)))?;

    Ok(parse_issue_list_from_json(&raw))
}

/// Parse an `IssueDetail` from the JSON returned by `gh issue view --json ...`.
pub fn parse_issue_detail_from_json(raw: &serde_json::Value) -> IssueDetail {
    IssueDetail {
        number: raw.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        title: raw
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        body: raw
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        state: raw
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        labels: raw
            .get("labels")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

pub fn get_issue_detail(repo_path: &Path, number: u32) -> Result<IssueDetail, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "issue",
            "view",
            &number.to_string(),
            "--json",
            "number,title,body,state,labels",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh issue view: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh issue view failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh issue view output: {}", e)))?;

    Ok(parse_issue_detail_from_json(&raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_issue_list_from_json tests ---

    #[test]
    fn test_parse_issue_list_from_json_full() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "number": 1,
                "title": "Bug report",
                "body": "Something is broken",
                "state": "OPEN",
                "labels": [{"name": "bug"}, {"name": "priority:high"}]
            },
            {
                "number": 2,
                "title": "Feature request",
                "body": "Please add X",
                "state": "OPEN",
                "labels": []
            }
        ]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].number, 1);
        assert_eq!(issues[0].title, "Bug report");
        assert_eq!(issues[0].body, "Something is broken");
        assert_eq!(issues[0].state, "OPEN");
        assert_eq!(issues[0].labels, vec!["bug", "priority:high"]);
        assert_eq!(issues[1].number, 2);
        assert!(issues[1].labels.is_empty());
    }

    #[test]
    fn test_parse_issue_list_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        assert!(parse_issue_list_from_json(&raw).is_empty());
    }

    #[test]
    fn test_parse_issue_list_from_json_skips_missing_number() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {"title": "No number"},
            {"number": 5, "title": "Has number"}
        ]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 5);
    }

    #[test]
    fn test_parse_issue_list_from_json_no_labels_key() {
        let raw: Vec<serde_json::Value> =
            serde_json::from_str(r#"[{"number": 3, "title": "test"}]"#).unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues[0].labels, Vec::<String>::new());
    }

    #[test]
    fn test_parse_issue_list_from_json_labels_without_name() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{"number": 3, "labels": [{"name": "valid"}, {"color": "red"}]}]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues[0].labels, vec!["valid"]);
    }

    // --- parse_issue_detail_from_json tests ---

    #[test]
    fn test_parse_issue_detail_from_json_full() {
        let raw = serde_json::json!({
            "number": 99,
            "title": "Critical bug",
            "body": "The app crashes on startup",
            "state": "OPEN",
            "labels": [{"name": "bug"}, {"name": "critical"}]
        });
        let detail = parse_issue_detail_from_json(&raw);
        assert_eq!(detail.number, 99);
        assert_eq!(detail.title, "Critical bug");
        assert_eq!(detail.body, "The app crashes on startup");
        assert_eq!(detail.state, "OPEN");
        assert_eq!(detail.labels, vec!["bug", "critical"]);
    }

    #[test]
    fn test_parse_issue_detail_from_json_empty() {
        let raw = serde_json::json!({});
        let detail = parse_issue_detail_from_json(&raw);
        assert_eq!(detail.number, 0);
        assert_eq!(detail.title, "");
        assert_eq!(detail.body, "");
        assert_eq!(detail.state, "");
        assert!(detail.labels.is_empty());
    }

    #[test]
    fn test_parse_issue_list_with_many_labels() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{
            "number": 50,
            "title": "Complex issue",
            "body": "Detailed description",
            "state": "OPEN",
            "labels": [
                {"name": "bug"},
                {"name": "priority:critical"},
                {"name": "area:frontend"},
                {"name": "good first issue"}
            ]
        }]"#,
        )
        .unwrap();
        let issues = parse_issue_list_from_json(&raw);
        assert_eq!(issues[0].labels.len(), 4);
        assert!(issues[0].labels.contains(&"good first issue".to_string()));
    }
}
