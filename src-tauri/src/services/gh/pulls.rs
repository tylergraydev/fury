use std::path::Path;

use crate::error::AppError;
use crate::models::pr::{MergeResult, PrDetail, PrInfo, PrListItem, PrReview};
use crate::platform;

use super::{find_gh_binary, parse_reviews_from_json};

/// Build the argument list for `gh pr create`.
pub fn build_create_pr_args(
    title: &str,
    body: &str,
    base_branch: &str,
    draft: bool,
) -> Vec<String> {
    let mut args = vec![
        "pr".to_string(),
        "create".to_string(),
        "--title".to_string(),
        title.to_string(),
        "--body".to_string(),
        body.to_string(),
        "--base".to_string(),
        base_branch.to_string(),
    ];
    if draft {
        args.push("--draft".to_string());
    }
    args
}

pub fn create_pr(
    worktree_path: &Path,
    title: &str,
    body: &str,
    base_branch: &str,
    draft: bool,
) -> Result<PrInfo, AppError> {
    let gh = find_gh_binary()?;
    let args = build_create_pr_args(title, body, base_branch, draft);

    let output = platform::command(&gh)
        .args(&args)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr create: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh pr create failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    // Fetch full PR info now that it's created
    get_pr_info(worktree_path)?
        .ok_or_else(|| AppError::PrError("PR was created but could not be fetched".to_string()))
}

/// Parse a `PrInfo` from the JSON returned by `gh pr view --json number,url,title,state,mergeable`.
/// The `workspace_id` is set to `Uuid::nil()` — callers should replace it.
pub fn parse_pr_info_from_json(raw: &serde_json::Value) -> PrInfo {
    PrInfo {
        workspace_id: uuid::Uuid::nil(),
        pr_number: raw.get("number").and_then(|v| v.as_u64()),
        pr_url: raw.get("url").and_then(|v| v.as_str()).map(String::from),
        title: raw.get("title").and_then(|v| v.as_str()).map(String::from),
        state: raw.get("state").and_then(|v| v.as_str()).map(String::from),
        checks: Vec::new(),
        mergeable: raw
            .get("mergeable")
            .and_then(|v| v.as_str())
            .map(String::from),
    }
}

pub fn get_pr_info(worktree_path: &Path) -> Result<Option<PrInfo>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args(["pr", "view", "--json", "number,url,title,state,mergeable"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        // No PR exists for this branch
        return Ok(None);
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh output: {}", e)))?;

    Ok(Some(parse_pr_info_from_json(&raw)))
}

/// Map a merge method string to the corresponding `gh pr merge` flag.
pub fn merge_method_to_flag(method: &str) -> &'static str {
    match method {
        "squash" => "--squash",
        "rebase" => "--rebase",
        _ => "--merge",
    }
}

/// Build a `MergeResult` from the outcome of a merge command.
pub fn build_merge_result(success: bool, output_text: &str, method: &str) -> MergeResult {
    MergeResult {
        success,
        message: output_text.trim().to_string(),
        merge_method: method.to_string(),
    }
}

pub fn merge_pr(worktree_path: &Path, method: &str) -> Result<MergeResult, AppError> {
    let gh = find_gh_binary()?;
    let merge_flag = merge_method_to_flag(method);

    let output = platform::command(&gh)
        .args(["pr", "merge", merge_flag, "--delete-branch"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr merge: {}", e)))?;

    let success = output.status.success();
    let text = if success {
        String::from_utf8_lossy(&output.stdout)
    } else {
        String::from_utf8_lossy(&output.stderr)
    };

    Ok(build_merge_result(success, &text, method))
}

/// Combined `gh pr view` that fetches both PR info and reviews in a single CLI call.
/// Returns (PrInfo, Vec<PrReview>) or None if no PR exists.
pub fn get_pr_info_with_reviews(
    worktree_path: &Path,
) -> Result<Option<(PrInfo, Vec<PrReview>)>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "pr",
            "view",
            "--json",
            "number,url,title,state,mergeable,latestReviews",
        ])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Ok(None);
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh output: {}", e)))?;

    let info = parse_pr_info_from_json(&raw);
    let reviews = parse_reviews_from_json(&raw);

    Ok(Some((info, reviews)))
}

/// Parse a list of `PrListItem` from the JSON array returned by `gh pr list`.
pub fn parse_pr_list_from_json(raw: &[serde_json::Value]) -> Vec<PrListItem> {
    raw.iter()
        .filter_map(|pr| {
            let number = pr.get("number").and_then(|v| v.as_u64())? as u32;
            Some(PrListItem {
                number,
                title: pr
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                head_branch: pr
                    .get("headRefName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                base_branch: pr
                    .get("baseRefName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                state: pr
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                author: pr
                    .get("author")
                    .and_then(|v| v.get("login"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: pr
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

pub fn list_repo_prs(repo_path: &Path) -> Result<Vec<PrListItem>, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "pr",
            "list",
            "--json",
            "number,title,headRefName,baseRefName,state,author,url",
            "--limit",
            "50",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr list: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh pr list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh pr list output: {}", e)))?;

    Ok(parse_pr_list_from_json(&raw))
}

/// Parse a `PrDetail` from the JSON returned by `gh pr view --json ...`.
pub fn parse_pr_detail_from_json(raw: &serde_json::Value) -> PrDetail {
    PrDetail {
        number: raw.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        title: raw
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        head_branch: raw
            .get("headRefName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        base_branch: raw
            .get("baseRefName")
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
        url: raw
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    }
}

pub fn get_pr_detail(repo_path: &Path, number: u32) -> Result<PrDetail, AppError> {
    let gh = find_gh_binary()?;
    let output = platform::command(&gh)
        .args([
            "pr",
            "view",
            &number.to_string(),
            "--json",
            "number,title,headRefName,baseRefName,body,state,url",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::PrError(format!("Failed to run gh pr view: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::PrError(format!(
            "gh pr view failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::PrError(format!("Failed to parse gh pr view output: {}", e)))?;

    Ok(parse_pr_detail_from_json(&raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- build_create_pr_args tests ---

    #[test]
    fn test_build_create_pr_args_no_draft() {
        let args = build_create_pr_args("My PR", "Description here", "main", false);
        assert_eq!(
            args,
            vec![
                "pr",
                "create",
                "--title",
                "My PR",
                "--body",
                "Description here",
                "--base",
                "main"
            ]
        );
    }

    #[test]
    fn test_build_create_pr_args_with_draft() {
        let args = build_create_pr_args("Draft PR", "WIP", "develop", true);
        assert_eq!(
            args,
            vec![
                "pr", "create", "--title", "Draft PR", "--body", "WIP", "--base", "develop",
                "--draft"
            ]
        );
    }

    #[test]
    fn test_build_create_pr_args_empty_strings() {
        let args = build_create_pr_args("", "", "", false);
        assert_eq!(
            args,
            vec!["pr", "create", "--title", "", "--body", "", "--base", ""]
        );
    }

    #[test]
    fn test_build_create_pr_args_special_characters() {
        let args = build_create_pr_args(
            "feat: add \"quotes\" & <brackets>",
            "Body with\nnewlines",
            "main",
            false,
        );
        assert_eq!(args[3], "feat: add \"quotes\" & <brackets>");
        assert_eq!(args[5], "Body with\nnewlines");
    }

    // --- merge_method_to_flag tests ---

    #[test]
    fn test_merge_method_to_flag_squash() {
        assert_eq!(merge_method_to_flag("squash"), "--squash");
    }

    #[test]
    fn test_merge_method_to_flag_rebase() {
        assert_eq!(merge_method_to_flag("rebase"), "--rebase");
    }

    #[test]
    fn test_merge_method_to_flag_merge() {
        assert_eq!(merge_method_to_flag("merge"), "--merge");
    }

    #[test]
    fn test_merge_method_to_flag_unknown_defaults_to_merge() {
        assert_eq!(merge_method_to_flag("anything"), "--merge");
        assert_eq!(merge_method_to_flag(""), "--merge");
    }

    // --- parse_pr_info_from_json tests ---

    #[test]
    fn test_parse_pr_info_from_json_full() {
        let raw = serde_json::json!({
            "number": 42,
            "url": "https://github.com/owner/repo/pull/42",
            "title": "Add feature X",
            "state": "OPEN",
            "mergeable": "MERGEABLE"
        });
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, Some(42));
        assert_eq!(
            info.pr_url,
            Some("https://github.com/owner/repo/pull/42".to_string())
        );
        assert_eq!(info.title, Some("Add feature X".to_string()));
        assert_eq!(info.state, Some("OPEN".to_string()));
        assert_eq!(info.mergeable, Some("MERGEABLE".to_string()));
        assert!(info.checks.is_empty());
        assert_eq!(info.workspace_id, uuid::Uuid::nil());
    }

    #[test]
    fn test_parse_pr_info_from_json_minimal() {
        let raw = serde_json::json!({});
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, None);
        assert_eq!(info.pr_url, None);
        assert_eq!(info.title, None);
        assert_eq!(info.state, None);
        assert_eq!(info.mergeable, None);
    }

    #[test]
    fn test_parse_pr_info_from_json_partial() {
        let raw = serde_json::json!({
            "number": 7,
            "state": "CLOSED"
        });
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, Some(7));
        assert_eq!(info.pr_url, None);
        assert_eq!(info.title, None);
        assert_eq!(info.state, Some("CLOSED".to_string()));
        assert_eq!(info.mergeable, None);
    }

    // --- parse_pr_list_from_json tests ---

    #[test]
    fn test_parse_pr_list_from_json_full() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "number": 10,
                "title": "Feature A",
                "headRefName": "feature-a",
                "baseRefName": "main",
                "state": "OPEN",
                "author": {"login": "dev1"},
                "url": "https://github.com/org/repo/pull/10"
            },
            {
                "number": 11,
                "title": "Feature B",
                "headRefName": "feature-b",
                "baseRefName": "develop",
                "state": "MERGED",
                "author": {"login": "dev2"},
                "url": "https://github.com/org/repo/pull/11"
            }
        ]"#,
        )
        .unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].number, 10);
        assert_eq!(prs[0].title, "Feature A");
        assert_eq!(prs[0].head_branch, "feature-a");
        assert_eq!(prs[0].base_branch, "main");
        assert_eq!(prs[0].state, "OPEN");
        assert_eq!(prs[0].author, "dev1");
        assert_eq!(prs[0].url, "https://github.com/org/repo/pull/10");
        assert_eq!(prs[1].number, 11);
        assert_eq!(prs[1].state, "MERGED");
    }

    #[test]
    fn test_parse_pr_list_from_json_empty() {
        let raw: Vec<serde_json::Value> = vec![];
        let prs = parse_pr_list_from_json(&raw);
        assert!(prs.is_empty());
    }

    #[test]
    fn test_parse_pr_list_from_json_skips_missing_number() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {"title": "No number PR"},
            {"number": 5, "title": "Valid PR"}
        ]"#,
        )
        .unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 5);
    }

    #[test]
    fn test_parse_pr_list_from_json_defaults_on_missing_fields() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(r#"[{"number": 1}]"#).unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 1);
        assert_eq!(prs[0].title, "");
        assert_eq!(prs[0].head_branch, "");
        assert_eq!(prs[0].base_branch, "");
        assert_eq!(prs[0].state, "");
        assert_eq!(prs[0].author, "");
        assert_eq!(prs[0].url, "");
    }

    // --- parse_pr_detail_from_json tests ---

    #[test]
    fn test_parse_pr_detail_from_json_full() {
        let raw = serde_json::json!({
            "number": 42,
            "title": "Big refactor",
            "headRefName": "refactor/big",
            "baseRefName": "main",
            "body": "This PR refactors everything.\n\n## Changes\n- A\n- B",
            "state": "OPEN",
            "url": "https://github.com/org/repo/pull/42"
        });
        let detail = parse_pr_detail_from_json(&raw);
        assert_eq!(detail.number, 42);
        assert_eq!(detail.title, "Big refactor");
        assert_eq!(detail.head_branch, "refactor/big");
        assert_eq!(detail.base_branch, "main");
        assert!(detail.body.contains("refactors everything"));
        assert_eq!(detail.state, "OPEN");
        assert_eq!(detail.url, "https://github.com/org/repo/pull/42");
    }

    #[test]
    fn test_parse_pr_detail_from_json_empty() {
        let raw = serde_json::json!({});
        let detail = parse_pr_detail_from_json(&raw);
        assert_eq!(detail.number, 0);
        assert_eq!(detail.title, "");
        assert_eq!(detail.head_branch, "");
        assert_eq!(detail.base_branch, "");
        assert_eq!(detail.body, "");
        assert_eq!(detail.state, "");
        assert_eq!(detail.url, "");
    }

    // --- build_merge_result tests ---

    #[test]
    fn test_build_merge_result_success() {
        let result = build_merge_result(true, "  Pull request #42 merged  \n", "squash");
        assert!(result.success);
        assert_eq!(result.message, "Pull request #42 merged");
        assert_eq!(result.merge_method, "squash");
    }

    #[test]
    fn test_build_merge_result_failure() {
        let result = build_merge_result(false, "  Not mergeable: conflicts exist  ", "merge");
        assert!(!result.success);
        assert_eq!(result.message, "Not mergeable: conflicts exist");
        assert_eq!(result.merge_method, "merge");
    }

    #[test]
    fn test_build_merge_result_empty_message() {
        let result = build_merge_result(true, "", "rebase");
        assert!(result.success);
        assert_eq!(result.message, "");
        assert_eq!(result.merge_method, "rebase");
    }

    #[test]
    fn test_build_merge_result_preserves_method() {
        let result = build_merge_result(true, "ok", "custom-method");
        assert_eq!(result.merge_method, "custom-method");
    }

    // --- Realistic end-to-end parsing fixture tests ---

    #[test]
    fn test_parse_pr_info_with_reviews_realistic() {
        let raw = serde_json::json!({
            "number": 128,
            "url": "https://github.com/acme/project/pull/128",
            "title": "feat: Auto-update system with popup and signing",
            "state": "MERGED",
            "mergeable": "UNKNOWN",
            "latestReviews": [
                {
                    "id": 2001,
                    "author": {"login": "senior-dev"},
                    "state": "APPROVED",
                    "body": "LGTM!",
                    "submittedAt": "2025-06-15T14:30:00Z"
                }
            ]
        });
        let info = parse_pr_info_from_json(&raw);
        assert_eq!(info.pr_number, Some(128));
        assert_eq!(info.state, Some("MERGED".to_string()));

        let reviews = parse_reviews_from_json(&raw);
        assert_eq!(reviews.len(), 1);
        assert_eq!(reviews[0].author, "senior-dev");
        assert_eq!(reviews[0].state, "APPROVED");
    }

    #[test]
    fn test_parse_pr_list_realistic_mixed_states() {
        let raw: Vec<serde_json::Value> = serde_json::from_str(
            r#"[
            {
                "number": 100,
                "title": "WIP: New feature",
                "headRefName": "feat/new-thing",
                "baseRefName": "main",
                "state": "OPEN",
                "author": {"login": "junior-dev"},
                "url": "https://github.com/org/repo/pull/100"
            },
            {
                "number": 99,
                "title": "Hotfix: crash on login",
                "headRefName": "hotfix/login-crash",
                "baseRefName": "main",
                "state": "MERGED",
                "author": {"login": "senior-dev"},
                "url": "https://github.com/org/repo/pull/99"
            },
            {
                "number": 98,
                "title": "Abandoned experiment",
                "headRefName": "experiment/x",
                "baseRefName": "main",
                "state": "CLOSED",
                "author": {"login": "researcher"},
                "url": "https://github.com/org/repo/pull/98"
            }
        ]"#,
        )
        .unwrap();
        let prs = parse_pr_list_from_json(&raw);
        assert_eq!(prs.len(), 3);
        assert_eq!(prs[0].state, "OPEN");
        assert_eq!(prs[1].state, "MERGED");
        assert_eq!(prs[2].state, "CLOSED");
    }
}
