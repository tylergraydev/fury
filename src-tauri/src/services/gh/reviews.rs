use std::path::Path;

use crate::error::AppError;
use crate::models::pr::{PrComment, PrReview, ReviewInlineComment};
use crate::platform;

use super::find_gh_binary;

/// Extract `(owner, repo)` from a GitHub PR URL like `https://github.com/owner/repo/pull/123`.
pub fn parse_owner_repo_from_url(pr_url: &str) -> Result<(&str, &str), AppError> {
    let parts: Vec<&str> = pr_url.split('/').collect();
    if parts.len() < 5 {
        return Err(AppError::PrError(format!(
            "Could not parse owner/repo from URL: {}",
            pr_url
        )));
    }
    Ok((parts[parts.len() - 4], parts[parts.len() - 3]))
}

/// Build the GitHub API path for PR review comments.
pub fn build_review_comments_api_path(owner: &str, repo: &str, pr_number: u64) -> String {
    format!("repos/{}/{}/pulls/{}/comments", owner, repo, pr_number)
}

/// Fetch review comments given known PR metadata, avoiding a redundant `gh pr view` call.
pub fn get_pr_review_comments_for_pr(
    worktree_path: &Path,
    pr_number: u64,
    pr_url: &str,
) -> Result<Vec<PrComment>, AppError> {
    let gh = find_gh_binary()?;

    let (owner, repo) = parse_owner_repo_from_url(pr_url)?;

    let api_path = build_review_comments_api_path(owner, repo, pr_number);
    let api_output = platform::command(&gh)
        .args(["api", &api_path, "--paginate"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh api: {}", e)))?;

    if !api_output.status.success() {
        let stderr = String::from_utf8_lossy(&api_output.stderr);
        return Err(AppError::PrError(format!("gh api failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&api_output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse review comments: {}", e)))?;

    Ok(parse_comments_from_json(&raw))
}

/// Fetch reviews and comments in an optimized way: single `gh pr view` for reviews + PR metadata,
/// then use that metadata to fetch comments without a redundant call.
pub fn get_reviews_and_comments(
    worktree_path: &Path,
) -> Result<(Vec<PrReview>, Vec<PrComment>), AppError> {
    let gh = find_gh_binary()?;

    let output = platform::command(&gh)
        .args(["pr", "view", "--json", "number,url,latestReviews"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Ok((Vec::new(), Vec::new()));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse reviews output: {}", e)))?;

    let reviews = parse_reviews_from_json(&raw);

    let pr_number = raw.get("number").and_then(|v| v.as_u64());
    let pr_url = raw.get("url").and_then(|v| v.as_str());

    let comments = match (pr_number, pr_url) {
        (Some(number), Some(url)) => get_pr_review_comments_for_pr(worktree_path, number, url)?,
        _ => Vec::new(),
    };

    Ok((reviews, comments))
}

pub(crate) fn parse_reviews_from_json(raw: &serde_json::Value) -> Vec<PrReview> {
    raw.get("latestReviews")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|r| PrReview {
                    id: r.get("id").and_then(|v| v.as_u64()).unwrap_or(0),
                    author: r
                        .get("author")
                        .and_then(|v| v.get("login"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    state: r
                        .get("state")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    body: r
                        .get("body")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    submitted_at: r
                        .get("submittedAt")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn parse_comments_from_json(raw: &[serde_json::Value]) -> Vec<PrComment> {
    raw.iter()
        .map(|c| PrComment {
            id: c.get("id").and_then(|v| v.as_u64()).unwrap_or(0),
            author: c
                .get("user")
                .and_then(|v| v.get("login"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            body: c
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: c
                .get("created_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            path: c.get("path").and_then(|v| v.as_str()).map(String::from),
            line: c
                .get("line")
                .and_then(|v| v.as_u64())
                .or_else(|| c.get("original_line").and_then(|v| v.as_u64()))
                .map(|v| v as u32),
        })
        .collect()
}

pub fn get_pr_reviews(worktree_path: &Path) -> Result<Vec<PrReview>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "view", "--json", "latestReviews"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse reviews output: {}", e)))?;

    Ok(parse_reviews_from_json(&raw))
}

pub fn get_pr_review_comments(worktree_path: &Path) -> Result<Vec<PrComment>, AppError> {
    let gh = find_gh_binary()?;

    // First get PR number and URL to extract owner/repo
    let pr_output = platform::command(&gh)
        .args(["pr", "view", "--json", "number,url"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !pr_output.status.success() {
        return Ok(Vec::new());
    }

    let pr_raw: serde_json::Value = serde_json::from_slice(&pr_output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse PR output: {}", e)))?;

    let pr_number = pr_raw
        .get("number")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| AppError::PrError("No PR number found".to_string()))?;

    let pr_url = pr_raw
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::PrError("No PR URL found".to_string()))?;

    // Extract owner/repo from URL like https://github.com/owner/repo/pull/123
    let (owner, repo) = parse_owner_repo_from_url(pr_url)?;

    // Fetch inline review comments via API
    let api_path = build_review_comments_api_path(owner, repo, pr_number);
    let api_output = platform::command(&gh)
        .args(["api", &api_path, "--paginate"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh api: {}", e)))?;

    if !api_output.status.success() {
        let stderr = String::from_utf8_lossy(&api_output.stderr);
        return Err(AppError::PrError(format!("gh api failed: {}", stderr)));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&api_output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse review comments: {}", e)))?;

    Ok(parse_comments_from_json(&raw))
}

/// Fetch the unified diff for the current branch's PR.
pub fn get_pr_diff(worktree_path: &Path) -> Result<String, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "diff"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr diff: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::PrError(format!("gh pr diff failed: {}", stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Submit a PR review with optional inline comments using the GitHub Reviews API.
/// `event` must be one of: COMMENT, APPROVE, REQUEST_CHANGES.
pub fn submit_pr_review(
    worktree_path: &Path,
    pr_number: u64,
    pr_url: &str,
    body: &str,
    event: &str,
    comments: &[ReviewInlineComment],
) -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let (owner, repo) = parse_owner_repo_from_url(pr_url)?;

    let api_path = format!("repos/{}/{}/pulls/{}/reviews", owner, repo, pr_number);

    let comments_json: Vec<serde_json::Value> = comments
        .iter()
        .map(|c| {
            serde_json::json!({
                "path": c.path,
                "line": c.line,
                "body": c.body,
            })
        })
        .collect();

    let payload = serde_json::json!({
        "body": body,
        "event": event,
        "comments": comments_json,
    });

    let payload_str = serde_json::to_string(&payload)
        .map_err(|e| AppError::PrError(format!("Failed to serialize review payload: {}", e)))?;

    let output = platform::command(&gh)
        .args(["api", &api_path, "--method", "POST", "--input", "-"])
        .current_dir(worktree_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin {
                stdin.write_all(payload_str.as_bytes())?;
            }
            child.wait_with_output()
        })
        .map_err(|e| AppError::PrError(format!("Failed to run gh api: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::PrError(format!(
            "Failed to submit PR review: {}",
            stderr
        )));
    }

    Ok(())
}

/// Post a top-level comment on a PR (not an inline review comment).
#[allow(dead_code)] // Reserved for the AI PR review feature wiring.
pub fn post_pr_comment(
    worktree_path: &Path,
    pr_number: u64,
    pr_url: &str,
    body: &str,
) -> Result<(), AppError> {
    let gh = find_gh_binary()?;
    let (owner, repo) = parse_owner_repo_from_url(pr_url)?;

    let api_path = format!("repos/{}/{}/issues/{}/comments", owner, repo, pr_number);

    let output = platform::command(&gh)
        .args([
            "api",
            &api_path,
            "--method",
            "POST",
            "-f",
            &format!("body={}", body),
        ])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh api: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::PrError(format!(
            "Failed to post PR comment: {}",
            stderr
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_reviews_from_json tests ---

    #[test]
    fn test_parse_reviews_from_json_with_reviews() {
        let raw = serde_json::json!({
            "latestReviews": [
                {
                    "id": 42,
                    "author": {"login": "octocat"},
                    "state": "APPROVED",
                    "body": "Looks good!",
                    "submittedAt": "2025-01-01T00:00:00Z"
                },
                {
                    "id": 43,
                    "author": {"login": "reviewer2"},
                    "state": "CHANGES_REQUESTED",
                    "body": "Needs work",
                    "submittedAt": "2025-01-02T00:00:00Z"
                }
            ]
        });
        let reviews = parse_reviews_from_json(&raw);
        assert_eq!(reviews.len(), 2);
        assert_eq!(reviews[0].id, 42);
        assert_eq!(reviews[0].author, "octocat");
        assert_eq!(reviews[0].state, "APPROVED");
        assert_eq!(reviews[0].body, "Looks good!");
        assert_eq!(reviews[0].submitted_at, "2025-01-01T00:00:00Z");
        assert_eq!(reviews[1].id, 43);
        assert_eq!(reviews[1].author, "reviewer2");
        assert_eq!(reviews[1].state, "CHANGES_REQUESTED");
    }

    #[test]
    fn test_parse_reviews_from_json_empty() {
        let raw = serde_json::json!({ "latestReviews": [] });
        let reviews = parse_reviews_from_json(&raw);
        assert!(reviews.is_empty());
    }

    #[test]
    fn test_parse_reviews_from_json_missing_field() {
        let raw = serde_json::json!({ "other": "data" });
        let reviews = parse_reviews_from_json(&raw);
        assert!(reviews.is_empty());
    }

    #[test]
    fn test_parse_reviews_from_json_defaults_on_missing_fields() {
        let raw = serde_json::json!({
            "latestReviews": [{ "id": 99 }]
        });
        let reviews = parse_reviews_from_json(&raw);
        assert_eq!(reviews.len(), 1);
        assert_eq!(reviews[0].id, 99);
        assert_eq!(reviews[0].author, "");
        assert_eq!(reviews[0].state, "");
        assert_eq!(reviews[0].body, "");
        assert_eq!(reviews[0].submitted_at, "");
    }

    // --- parse_comments_from_json tests ---

    #[test]
    fn test_parse_comments_from_json_with_comments() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "id": 100,
                "user": {"login": "commenter"},
                "body": "Nice change",
                "created_at": "2025-03-01T12:00:00Z",
                "path": "src/main.rs",
                "line": 42
            },
            {
                "id": 101,
                "user": {"login": "reviewer"},
                "body": "Fix this",
                "created_at": "2025-03-02T12:00:00Z",
                "path": null,
                "original_line": 10
            }
        ]"#,
        )
        .unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments.len(), 2);
        assert_eq!(comments[0].id, 100);
        assert_eq!(comments[0].author, "commenter");
        assert_eq!(comments[0].body, "Nice change");
        assert_eq!(comments[0].created_at, "2025-03-01T12:00:00Z");
        assert_eq!(comments[0].path, Some("src/main.rs".to_string()));
        assert_eq!(comments[0].line, Some(42));
        assert_eq!(comments[1].id, 101);
        assert_eq!(comments[1].path, None);
        assert_eq!(comments[1].line, Some(10)); // falls back to original_line
    }

    #[test]
    fn test_parse_comments_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        let comments = parse_comments_from_json(&raw);
        assert!(comments.is_empty());
    }

    #[test]
    fn test_parse_comments_from_json_defaults_on_missing_fields() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{"id": 200}]"#).unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, 200);
        assert_eq!(comments[0].author, "");
        assert_eq!(comments[0].body, "");
        assert_eq!(comments[0].created_at, "");
        assert_eq!(comments[0].path, None);
        assert_eq!(comments[0].line, None);
    }

    // --- parse_owner_repo_from_url tests ---

    #[test]
    fn test_parse_owner_repo_from_url_standard() {
        let (owner, repo) =
            parse_owner_repo_from_url("https://github.com/octocat/hello-world/pull/42").unwrap();
        assert_eq!(owner, "octocat");
        assert_eq!(repo, "hello-world");
    }

    #[test]
    fn test_parse_owner_repo_from_url_with_trailing_slash() {
        // Unusual but possible
        let (owner, repo) =
            parse_owner_repo_from_url("https://github.com/owner/repo/pull/1").unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn test_parse_owner_repo_from_url_too_short() {
        let result = parse_owner_repo_from_url("https://github.com");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_owner_repo_from_url_minimal_valid() {
        // Just enough parts: a/b/c/d/e gives 5 parts
        let (owner, repo) = parse_owner_repo_from_url("a/b/c/d/e").unwrap();
        assert_eq!(owner, "b");
        assert_eq!(repo, "c");
    }

    // --- build_review_comments_api_path tests ---

    #[test]
    fn test_build_review_comments_api_path() {
        let path = build_review_comments_api_path("octocat", "hello-world", 42);
        assert_eq!(path, "repos/octocat/hello-world/pulls/42/comments");
    }

    #[test]
    fn test_build_review_comments_api_path_large_number() {
        let path = build_review_comments_api_path("org", "repo", 99999);
        assert_eq!(path, "repos/org/repo/pulls/99999/comments");
    }

    #[test]
    fn test_parse_comments_line_fallback_to_original_line() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "id": 500,
                "user": {"login": "reviewer"},
                "body": "This line needs fixing",
                "created_at": "2025-01-01T00:00:00Z",
                "path": "src/lib.rs",
                "line": null,
                "original_line": 55
            }
        ]"#,
        )
        .unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments[0].line, Some(55));
        assert_eq!(comments[0].path, Some("src/lib.rs".to_string()));
    }

    #[test]
    fn test_parse_comments_line_prefers_line_over_original_line() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[{
                "id": 501,
                "user": {"login": "dev"},
                "body": "test",
                "created_at": "2025-01-01T00:00:00Z",
                "path": "file.rs",
                "line": 10,
                "original_line": 20
            }]"#,
        )
        .unwrap();
        let comments = parse_comments_from_json(&raw);
        assert_eq!(comments[0].line, Some(10));
    }
}
