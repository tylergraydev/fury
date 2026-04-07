use crate::error::AppError;
use crate::models::pr::{AiReviewComment, AiReviewResult, ReviewInlineComment, SubmitReviewRequest};
use crate::models::repository::GitProvider;
use crate::services::ado as ado_svc;
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::{Emitter, State};

use super::pr::{get_ado_pat, parse_ado_url, parse_ws_id, ws_context};

/// Fetch the unified diff for the current branch's PR.
#[tauri::command]
#[specta::specta]
pub async fn get_pr_diff(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            let worktree_path = ctx.worktree_path.clone();
            tokio::task::spawn_blocking(move || gh_svc::get_pr_diff(&worktree_path))
                .await
                .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => Err(AppError::AzureDevOpsError(
            "PR diff fetch not yet supported for Azure DevOps".to_string(),
        )),
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected".to_string(),
        )),
    }
}

/// Build the review prompt that instructs the AI to analyze the diff.
pub(crate) fn build_review_prompt(
    diff: &str,
    pr_title: Option<&str>,
    custom_instructions: Option<&str>,
) -> String {
    let mut prompt = String::from(
        "You are reviewing a pull request. Analyze the diff below for bugs, logic errors, \
         security issues, and performance problems. Focus on substantive issues — ignore \
         formatting and style unless it introduces a bug.\n\n",
    );

    if let Some(title) = pr_title {
        prompt.push_str(&format!("**PR Title:** {}\n\n", title));
    }

    if let Some(instructions) = custom_instructions {
        prompt.push_str(&format!(
            "**Additional review instructions:** {}\n\n",
            instructions
        ));
    }

    prompt.push_str(&format!(
        "**Diff:**\n```diff\n{}\n```\n\n",
        diff
    ));

    prompt.push_str(
        "Respond with a JSON object matching this exact schema (no markdown fencing, use camelCase keys):\n\
         {\n\
         \x20 \"summary\": \"Brief overall assessment of the PR\",\n\
         \x20 \"overallAssessment\": \"approve\" | \"request_changes\" | \"comment\",\n\
         \x20 \"comments\": [\n\
         \x20   {\n\
         \x20     \"path\": \"file/path.rs\",\n\
         \x20     \"line\": 42,\n\
         \x20     \"body\": \"Description of the issue\",\n\
         \x20     \"severity\": \"error\" | \"warning\" | \"info\",\n\
         \x20     \"category\": \"bug\" | \"security\" | \"performance\" | \"style\" | \"logic\",\n\
         \x20     \"suggestedFix\": \"Optional code suggestion or null\"\n\
         \x20   }\n\
         \x20 ]\n\
         }\n\n\
         Rules:\n\
         - Only include comments for genuine issues found in the diff\n\
         - Use \"error\" severity for bugs and security issues\n\
         - Use \"warning\" for potential problems and performance issues\n\
         - Use \"info\" for minor suggestions\n\
         - The \"line\" must reference a line number from the new side of the diff\n\
         - If no issues found, return an empty comments array and \"approve\" assessment\n\
         - For suggestedFix, provide the corrected code snippet or null\n",
    );

    prompt
}

/// Parse the AI response text into a structured AiReviewResult.
pub(crate) fn parse_review_response(response: &str) -> Result<AiReviewResult, AppError> {
    // Try to extract JSON from the response — it may be wrapped in markdown fencing
    let json_str = extract_json_block(response);

    serde_json::from_str::<AiReviewResult>(json_str).map_err(|e| {
        let preview: String = response.chars().take(500).collect();
        AppError::PrError(format!(
            "Failed to parse AI review response as JSON: {}. Response: {}",
            e, preview
        ))
    })
}

/// Extract JSON from a response that may have markdown code fences.
fn extract_json_block(text: &str) -> &str {
    // Try to find ```json ... ``` blocks
    if let Some(start) = text.find("```json") {
        let json_start = start + 7;
        if let Some(end) = text[json_start..].find("```") {
            return text[json_start..json_start + end].trim();
        }
    }
    // Try ``` ... ``` blocks
    if let Some(start) = text.find("```") {
        let block_start = start + 3;
        if let Some(end) = text[block_start..].find("```") {
            let inner = text[block_start..block_start + end].trim();
            if inner.starts_with('{') {
                return inner;
            }
        }
    }
    // Try to find raw JSON object
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            return &text[start..=end];
        }
    }
    text.trim()
}

/// Convert AI review comments to inline comments for GitHub/ADO submission.
/// Uses GitHub suggestion syntax for suggested fixes.
pub(crate) fn to_inline_comments(comments: &[AiReviewComment]) -> Vec<ReviewInlineComment> {
    comments
        .iter()
        .map(|c| {
            let body = if let Some(ref fix) = c.suggested_fix {
                format!(
                    "**{:?} ({:?}):** {}\n\n```suggestion\n{}\n```",
                    c.severity, c.category, c.body, fix
                )
            } else {
                format!("**{:?} ({:?}):** {}", c.severity, c.category, c.body)
            };

            ReviewInlineComment {
                path: c.path.clone(),
                line: c.line,
                body,
            }
        })
        .collect()
}

/// Submit an AI-generated review to the PR's hosting provider.
#[tauri::command]
#[specta::specta]
pub async fn submit_ai_review(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: SubmitReviewRequest,
) -> Result<(), AppError> {
    let ws_id = parse_ws_id(&request.workspace_id.to_string())?;
    let ctx = ws_context(&state, ws_id)?;

    let inline_comments: Vec<ReviewInlineComment> = request.comments;

    match ctx.provider {
        GitProvider::GitHub => {
            let worktree_path = ctx.worktree_path.clone();
            let body = request.body.clone();
            let event = request.event.clone();

            // First get PR number and URL
            let pr_info = tokio::task::spawn_blocking({
                let path = worktree_path.clone();
                move || gh_svc::get_pr_info(&path)
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))??;

            let pr_info = pr_info.ok_or_else(|| {
                AppError::PrError("No PR found for current branch".to_string())
            })?;

            let pr_number = pr_info.pr_number.ok_or_else(|| {
                AppError::PrError("PR has no number".to_string())
            })?;
            let pr_url = pr_info.pr_url.ok_or_else(|| {
                AppError::PrError("PR has no URL".to_string())
            })?;

            tokio::task::spawn_blocking(move || {
                gh_svc::submit_pr_review(
                    &worktree_path,
                    pr_number,
                    &pr_url,
                    &body,
                    &event,
                    &inline_comments,
                )
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))??;
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            // Get PR ID from branch
            let info = ado_svc::get_pr_by_branch(
                &pat,
                &org,
                &project,
                &repo_name,
                &ctx.branch,
                ws_id,
            )
            .await?;

            let pr_id = info
                .and_then(|i| i.pr_number)
                .ok_or_else(|| AppError::PrError("No PR found for current branch".to_string()))?;

            ado_svc::submit_pr_review(
                &pat,
                &org,
                &project,
                &repo_name,
                pr_id,
                &request.body,
                &inline_comments,
            )
            .await?;
        }
        GitProvider::Unknown => {
            return Err(AppError::PrError(
                "Repository provider not detected".to_string(),
            ));
        }
    }

    if let Err(e) = app.emit(&format!("pr-review-submitted:{}", ws_id), ()) {
        eprintln!(
            "[pr-review-ai] Failed to emit pr-review-submitted event for ws {}: {}",
            ws_id, e
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_review_prompt_basic() {
        let prompt = build_review_prompt("+ new line\n- old line", None, None);
        assert!(prompt.contains("+ new line"));
        assert!(prompt.contains("Respond with a JSON object"));
    }

    #[test]
    fn test_build_review_prompt_with_title_and_instructions() {
        let prompt = build_review_prompt(
            "+ code",
            Some("Fix auth bug"),
            Some("Focus on security"),
        );
        assert!(prompt.contains("Fix auth bug"));
        assert!(prompt.contains("Focus on security"));
    }

    #[test]
    fn test_parse_review_response_valid_json() {
        let response = r#"{"summary":"Looks good","overallAssessment":"approve","comments":[]}"#;
        let result = parse_review_response(response).unwrap();
        assert_eq!(result.summary, "Looks good");
        assert_eq!(result.overall_assessment, "approve");
        assert!(result.comments.is_empty());
    }

    #[test]
    fn test_parse_review_response_with_fenced_json() {
        let response = "Here is my review:\n```json\n{\"summary\":\"Found issues\",\"overallAssessment\":\"request_changes\",\"comments\":[{\"path\":\"src/main.rs\",\"line\":42,\"body\":\"Bug here\",\"severity\":\"error\",\"category\":\"bug\",\"suggestedFix\":null}]}\n```";
        let result = parse_review_response(response).unwrap();
        assert_eq!(result.summary, "Found issues");
        assert_eq!(result.comments.len(), 1);
        assert_eq!(result.comments[0].path, "src/main.rs");
    }

    #[test]
    fn test_parse_review_response_invalid_json() {
        let response = "This is not JSON at all";
        assert!(parse_review_response(response).is_err());
    }

    #[test]
    fn test_extract_json_block_raw() {
        let text = r#"{"key": "value"}"#;
        assert_eq!(extract_json_block(text), r#"{"key": "value"}"#);
    }

    #[test]
    fn test_extract_json_block_fenced() {
        let text = "Some text\n```json\n{\"key\": \"value\"}\n```\nMore text";
        assert_eq!(extract_json_block(text), r#"{"key": "value"}"#);
    }

    #[test]
    fn test_extract_json_block_generic_fence() {
        let text = "```\n{\"key\": \"value\"}\n```";
        assert_eq!(extract_json_block(text), r#"{"key": "value"}"#);
    }

    #[test]
    fn test_to_inline_comments_with_fix() {
        let comments = vec![AiReviewComment {
            path: "src/lib.rs".to_string(),
            line: 10,
            body: "Null check missing".to_string(),
            severity: crate::models::pr::ReviewIssueSeverity::Error,
            category: crate::models::pr::ReviewIssueCategory::Bug,
            suggested_fix: Some("if value.is_some() { ... }".to_string()),
        }];
        let inline = to_inline_comments(&comments);
        assert_eq!(inline.len(), 1);
        assert!(inline[0].body.contains("```suggestion"));
        assert!(inline[0].body.contains("if value.is_some()"));
    }

    #[test]
    fn test_to_inline_comments_without_fix() {
        let comments = vec![AiReviewComment {
            path: "src/main.rs".to_string(),
            line: 5,
            body: "Consider using a constant".to_string(),
            severity: crate::models::pr::ReviewIssueSeverity::Info,
            category: crate::models::pr::ReviewIssueCategory::Style,
            suggested_fix: None,
        }];
        let inline = to_inline_comments(&comments);
        assert_eq!(inline.len(), 1);
        assert!(!inline[0].body.contains("```suggestion"));
        assert!(inline[0].body.contains("Consider using a constant"));
    }
}
