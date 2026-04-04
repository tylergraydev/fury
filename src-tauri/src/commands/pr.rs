use std::collections::HashMap;
use std::path::PathBuf;

use crate::error::AppError;
use crate::models::pr::{
    CreatePrRequest, MergeResult, PrCheck, PrComment, PrFullData, PrInfo, PrReview,
    ReviewsAndComments,
};
use crate::models::repository::{GitProvider, Repository};
use crate::models::workspace::Workspace;
use crate::services::ado as ado_svc;
use crate::services::gh as gh_svc;
use crate::services::provider as provider_svc;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

/// Context extracted from workspace + repository state for provider dispatch.
pub(crate) struct WsContext {
    pub worktree_path: PathBuf,
    pub branch: String,
    pub default_branch: String,
    pub provider: GitProvider,
    pub remote_url: Option<String>,
}

/// Context extracted from a repository for repo-level commands.
pub(crate) struct RepoContext {
    pub path: PathBuf,
    pub provider: GitProvider,
    pub remote_url: Option<String>,
}

/// Extract workspace context from in-memory maps (no Tauri State needed).
pub(crate) fn resolve_ws_context(
    workspaces: &HashMap<Uuid, Workspace>,
    repos: &HashMap<Uuid, Repository>,
    ws_id: Uuid,
) -> Result<WsContext, AppError> {
    let ws = workspaces
        .get(&ws_id)
        .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    let repo = repos
        .get(&ws.repo_id)
        .ok_or(AppError::RepoNotFound(ws.repo_id))?;
    Ok(WsContext {
        worktree_path: ws.worktree_path.clone(),
        branch: ws.branch.clone(),
        default_branch: repo.default_branch.clone(),
        provider: repo.provider.clone(),
        remote_url: repo.remote_url.clone(),
    })
}

/// Extract repo context from in-memory map (no Tauri State needed).
pub(crate) fn resolve_repo_context(
    repos: &HashMap<Uuid, Repository>,
    repo_id: Uuid,
) -> Result<RepoContext, AppError> {
    let repo = repos
        .get(&repo_id)
        .ok_or(AppError::RepoNotFound(repo_id))?;
    Ok(RepoContext {
        path: repo.path.clone(),
        provider: repo.provider.clone(),
        remote_url: repo.remote_url.clone(),
    })
}

/// Extract workspace context via Tauri State (convenience wrapper).
pub(crate) fn ws_context(state: &State<'_, AppState>, ws_id: Uuid) -> Result<WsContext, AppError> {
    let workspaces = state.workspaces.read().unwrap();
    let repos = state.repositories.read().unwrap();
    resolve_ws_context(&workspaces, &repos, ws_id)
}

/// Extract repo context via Tauri State (convenience wrapper).
pub(crate) fn repo_context(state: &State<'_, AppState>, repo_id: Uuid) -> Result<RepoContext, AppError> {
    let repos = state.repositories.read().unwrap();
    resolve_repo_context(&repos, repo_id)
}

/// Extract ADO PAT from app settings.
pub(crate) fn get_ado_pat(state: &State<'_, AppState>) -> Result<String, AppError> {
    let settings = state.settings.read().unwrap();
    extract_ado_pat(settings.azure_devops.pat.as_deref())
}

/// Extract and validate ADO PAT string.
pub(crate) fn extract_ado_pat(pat: Option<&str>) -> Result<String, AppError> {
    pat.filter(|p| !p.is_empty())
        .map(|p| p.to_string())
        .ok_or_else(|| {
            AppError::AzureDevOpsError(
                "Azure DevOps PAT not configured. Set it in Settings > Azure DevOps.".to_string(),
            )
        })
}

/// Parse ADO remote URL into (org, project, repo) or return error.
pub(crate) fn parse_ado_url(
    remote_url: &Option<String>,
) -> Result<(String, String, String), AppError> {
    let url = remote_url
        .as_deref()
        .ok_or_else(|| AppError::AzureDevOpsError("No remote URL found for repository.".into()))?;
    provider_svc::parse_ado_remote(url).ok_or_else(|| {
        AppError::AzureDevOpsError(format!(
            "Could not parse Azure DevOps remote URL: {}",
            url
        ))
    })
}

/// Build a human-readable message summarizing failing CI checks.
/// Returns None if no checks are failing.
pub(crate) fn build_failing_checks_message(checks: &[PrCheck]) -> Option<String> {
    let failing: Vec<_> = checks
        .iter()
        .filter(|c| {
            c.conclusion.as_deref() == Some("FAILURE")
                || c.conclusion.as_deref() == Some("failure")
        })
        .collect();

    if failing.is_empty() {
        return None;
    }

    let mut message = String::from(
        "The following CI checks are failing on the current PR. Please analyze and fix these issues:\n\n",
    );
    for check in &failing {
        message.push_str(&format!(
            "- **{}**: {}\n  URL: {}\n\n",
            check.name,
            check.description.as_deref().unwrap_or("No description"),
            check.details_url.as_deref().unwrap_or("N/A"),
        ));
    }
    message.push_str("Please investigate the failures, fix the code, and ensure the tests pass.");

    Some(message)
}

/// Parse a workspace ID string for PR commands.
pub(crate) fn parse_ws_id(workspace_id: &str) -> Result<Uuid, AppError> {
    workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))
}

/// Parse a repo ID string for PR commands.
pub(crate) fn parse_pr_repo_id(repo_id: &str) -> Result<Uuid, AppError> {
    repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))
}

/// Resolve the merge method to use, defaulting to "squash" when not specified.
pub(crate) fn resolve_merge_method(merge_method: Option<String>) -> String {
    merge_method.unwrap_or_else(|| "squash".to_string())
}

/// Validate that the provider supports PR creation (GitHub or ADO only).
#[allow(dead_code)]
pub(crate) fn validate_provider_for_pr_create(provider: &GitProvider) -> Result<(), AppError> {
    match provider {
        GitProvider::GitHub | GitProvider::AzureDevOps => Ok(()),
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected. Cannot create PR.".into(),
        )),
    }
}

/// Validate that the provider supports PR merging (GitHub or ADO only).
#[allow(dead_code)]
pub(crate) fn validate_provider_for_merge(provider: &GitProvider) -> Result<(), AppError> {
    match provider {
        GitProvider::GitHub | GitProvider::AzureDevOps => Ok(()),
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected. Cannot merge PR.".into(),
        )),
    }
}

/// Check if a provider supports issue listing (only GitHub).
#[allow(dead_code)]
pub(crate) fn provider_supports_issues(provider: &GitProvider) -> bool {
    matches!(provider, GitProvider::GitHub)
}

/// Check if a provider supports workflow/CI operations.
#[allow(dead_code)]
pub(crate) fn provider_supports_workflows(provider: &GitProvider) -> bool {
    matches!(provider, GitProvider::GitHub | GitProvider::AzureDevOps)
}

/// Build an empty PrFullData for a workspace with no PR.
pub(crate) fn empty_pr_full_data(ws_id: Uuid) -> PrFullData {
    PrFullData {
        info: PrInfo::empty(ws_id),
        reviews: Vec::new(),
        review_comments: Vec::new(),
    }
}

/// Build an empty ReviewsAndComments.
pub(crate) fn empty_reviews_and_comments() -> ReviewsAndComments {
    ReviewsAndComments {
        reviews: Vec::new(),
        review_comments: Vec::new(),
    }
}

/// Enrich a PrInfo with workspace_id and checks.
/// Commonly used after fetching PR info and checks in parallel.
pub(crate) fn enrich_pr_info(info: &mut PrInfo, ws_id: Uuid, checks: Vec<PrCheck>) {
    info.workspace_id = ws_id;
    info.checks = checks;
}

/// Build PrFullData from a PrInfo and separate review/comment lists.
pub(crate) fn build_pr_full_data(
    info: PrInfo,
    reviews: Vec<PrReview>,
    review_comments: Vec<PrComment>,
) -> PrFullData {
    PrFullData {
        info,
        reviews,
        review_comments,
    }
}

/// Merge ADO reviewer votes with thread-based reviews into a single list.
pub(crate) fn merge_ado_reviews(
    reviewer_reviews: Vec<PrReview>,
    thread_reviews: Vec<PrReview>,
) -> Vec<PrReview> {
    let mut all = reviewer_reviews;
    all.extend(thread_reviews);
    all
}

/// Count how many checks are failing.
#[allow(dead_code)]
pub(crate) fn count_failing_checks(checks: &[PrCheck]) -> usize {
    checks
        .iter()
        .filter(|c| {
            c.conclusion.as_deref() == Some("FAILURE")
                || c.conclusion.as_deref() == Some("failure")
        })
        .count()
}

#[tauri::command]
#[specta::specta]
pub async fn create_pr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreatePrRequest,
) -> Result<PrInfo, AppError> {
    let ws_id = request.workspace_id;
    let ctx = ws_context(&state, ws_id)?;

    let draft = request.draft.unwrap_or(false);
    let title = request.title;
    let body = request.body;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::check_gh_auth()?;

                if gh_svc::has_uncommitted_changes(&ctx.worktree_path)? {
                    gh_svc::stage_and_commit(&ctx.worktree_path, &title)?;
                }

                gh_svc::push_branch(&ctx.worktree_path, &ctx.branch)?;

                let mut pr_info = gh_svc::create_pr(
                    &ctx.worktree_path,
                    &title,
                    &body,
                    &ctx.default_branch,
                    draft,
                )?;
                pr_info.workspace_id = ws_id;

                let _ = app.emit(&format!("pr-updated:{}", ws_id), &pr_info);
                Ok(pr_info)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            // Git operations must run in a blocking context
            tokio::task::spawn_blocking({
                let worktree_path = ctx.worktree_path.clone();
                let branch = ctx.branch.clone();
                let title_clone = title.clone();
                move || {
                    if gh_svc::has_uncommitted_changes(&worktree_path)? {
                        gh_svc::stage_and_commit(&worktree_path, &title_clone)?;
                    }
                    gh_svc::push_branch(&worktree_path, &branch)?;
                    Ok::<(), AppError>(())
                }
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

            let pr_info = ado_svc::create_pr(
                &pat,
                &org,
                &project,
                &repo_name,
                &ctx.branch,
                &ctx.default_branch,
                &title,
                &body,
                draft,
                ws_id,
            )
            .await?;

            let _ = app.emit(&format!("pr-updated:{}", ws_id), &pr_info);
            Ok(pr_info)
        }
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected. Cannot create PR.".into(),
        )),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_pr_info(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PrInfo, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                let (info_result, checks_result) = std::thread::scope(|s| {
                    let path = &ctx.worktree_path;
                    let t1 = s.spawn(|| gh_svc::get_pr_info(path));
                    let t2 = s.spawn(|| gh_svc::get_pr_checks(path));
                    (t1.join().unwrap(), t2.join().unwrap())
                });

                match info_result? {
                    Some(mut info) => {
                        enrich_pr_info(&mut info, ws_id, checks_result.unwrap_or_default());
                        Ok(info)
                    }
                    None => Ok(PrInfo::empty(ws_id)),
                }
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let info = ado_svc::get_pr_by_branch(
                &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
            )
            .await?;
            match info {
                Some(mut pr_info) => {
                    if let Some(pr_id) = pr_info.pr_number {
                        pr_info.checks = ado_svc::get_pr_checks(
                            &pat, &org, &project, &repo_name, pr_id,
                        )
                        .await
                        .unwrap_or_default();
                    }
                    Ok(pr_info)
                }
                None => Ok(PrInfo::empty(ws_id)),
            }
        }
        GitProvider::Unknown => Ok(PrInfo::empty(ws_id)),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_pr_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrCheck>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::get_pr_checks(&ctx.worktree_path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            // Find the PR first to get its ID
            let info = ado_svc::get_pr_by_branch(
                &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
            )
            .await?;
            match info.and_then(|i| i.pr_number) {
                Some(pr_id) => {
                    ado_svc::get_pr_checks(&pat, &org, &project, &repo_name, pr_id).await
                }
                None => Ok(Vec::new()),
            }
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn push_changes(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                if gh_svc::has_uncommitted_changes(&ctx.worktree_path)? {
                    gh_svc::stage_and_commit(&ctx.worktree_path, "Update changes")?;
                }

                gh_svc::push_branch(&ctx.worktree_path, &ctx.branch)?;

                let (info_result, checks_result) = std::thread::scope(|s| {
                    let path = &ctx.worktree_path;
                    let t1 = s.spawn(|| gh_svc::get_pr_info(path));
                    let t2 = s.spawn(|| gh_svc::get_pr_checks(path));
                    (t1.join().unwrap(), t2.join().unwrap())
                });

                if let Ok(Some(mut info)) = info_result {
                    enrich_pr_info(&mut info, ws_id, checks_result.unwrap_or_default());
                    let _ = app.emit(&format!("pr-updated:{}", ws_id), &info);
                }

                Ok(())
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            // Git operations must run in a blocking context
            tokio::task::spawn_blocking({
                let worktree_path = ctx.worktree_path.clone();
                let branch = ctx.branch.clone();
                move || {
                    if gh_svc::has_uncommitted_changes(&worktree_path)? {
                        gh_svc::stage_and_commit(&worktree_path, "Update changes")?;
                    }
                    gh_svc::push_branch(&worktree_path, &branch)?;
                    Ok::<(), AppError>(())
                }
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??;

            // Fetch PR info after push (async)
            if let Ok(Some(mut info)) = ado_svc::get_pr_by_branch(
                &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
            )
            .await
            {
                if let Some(pr_id) = info.pr_number {
                    info.checks = ado_svc::get_pr_checks(
                        &pat, &org, &project, &repo_name, pr_id,
                    )
                    .await
                    .unwrap_or_default();
                }
                let _ = app.emit(&format!("pr-updated:{}", ws_id), &info);
            }

            Ok(())
        }
        GitProvider::Unknown => {
            // Still allow push for unknown providers (pure git operation)
            tokio::task::spawn_blocking(move || {
                if gh_svc::has_uncommitted_changes(&ctx.worktree_path)? {
                    gh_svc::stage_and_commit(&ctx.worktree_path, "Update changes")?;
                }
                gh_svc::push_branch(&ctx.worktree_path, &ctx.branch)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn fix_failing_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    let checks = match ctx.provider {
        GitProvider::GitHub => {
            let worktree_path = ctx.worktree_path.clone();
            tokio::task::spawn_blocking(move || gh_svc::get_pr_checks(&worktree_path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let info =
                ado_svc::get_pr_by_branch(&pat, &org, &project, &repo_name, &ctx.branch, ws_id)
                    .await?;
            match info.and_then(|i| i.pr_number) {
                Some(pr_id) => {
                    ado_svc::get_pr_checks(&pat, &org, &project, &repo_name, pr_id).await?
                }
                None => Vec::new(),
            }
        }
        GitProvider::Unknown => Vec::new(),
    };

    match build_failing_checks_message(&checks) {
        Some(message) => Ok(message),
        None => Ok("No failing checks found.".to_string()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn merge_pr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    merge_method: Option<String>,
) -> Result<MergeResult, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;
    let method = resolve_merge_method(merge_method);

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                let result = gh_svc::merge_pr(&ctx.worktree_path, &method)?;
                let _ = app.emit(&format!("pr-merged:{}", ws_id), &result);
                Ok(result)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            // Find the PR first
            let info = ado_svc::get_pr_by_branch(
                &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
            )
            .await?;
            let pr_id = info
                .and_then(|i| i.pr_number)
                .ok_or_else(|| AppError::PrError("No open PR found to merge.".into()))?;

            let result =
                ado_svc::merge_pr(&pat, &org, &project, &repo_name, pr_id, &method).await?;
            let _ = app.emit(&format!("pr-merged:{}", ws_id), &result);
            Ok(result)
        }
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected. Cannot merge PR.".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_parse_ws_id_valid() {
        let id = Uuid::new_v4();
        assert_eq!(parse_ws_id(&id.to_string()).unwrap(), id);
    }

    #[test]
    fn test_parse_ws_id_invalid() {
        assert!(parse_ws_id("nope").is_err());
    }

    #[test]
    fn test_parse_pr_repo_id_valid() {
        let id = Uuid::new_v4();
        assert_eq!(parse_pr_repo_id(&id.to_string()).unwrap(), id);
    }

    #[test]
    fn test_parse_pr_repo_id_invalid() {
        assert!(parse_pr_repo_id("nope").is_err());
    }

    #[test]
    fn test_extract_ado_pat_valid() {
        let pat = extract_ado_pat(Some("my-token")).unwrap();
        assert_eq!(pat, "my-token");
    }

    #[test]
    fn test_extract_ado_pat_empty() {
        assert!(extract_ado_pat(Some("")).is_err());
    }

    #[test]
    fn test_extract_ado_pat_none() {
        assert!(extract_ado_pat(None).is_err());
    }

    #[test]
    fn test_parse_ado_url_none() {
        let result = parse_ado_url(&None);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_ws_context_workspace_not_found() {
        let workspaces = HashMap::new();
        let repos = HashMap::new();
        let result = resolve_ws_context(&workspaces, &repos, Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_ws_context_repo_not_found() {
        let mut workspaces = HashMap::new();
        let repos = HashMap::new();
        let ws = test_workspace(Uuid::new_v4()); // repo_id doesn't exist in repos
        let ws_id = ws.id;
        workspaces.insert(ws_id, ws);

        let result = resolve_ws_context(&workspaces, &repos, ws_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_ws_context_success() {
        let repo = test_repo();
        let ws = test_workspace(repo.id);
        let ws_id = ws.id;

        let mut workspaces = HashMap::new();
        let mut repos = HashMap::new();
        workspaces.insert(ws_id, ws.clone());
        repos.insert(repo.id, repo.clone());

        let ctx = resolve_ws_context(&workspaces, &repos, ws_id).unwrap();
        assert_eq!(ctx.worktree_path, ws.worktree_path);
        assert_eq!(ctx.branch, ws.branch);
        assert_eq!(ctx.default_branch, repo.default_branch);
        assert_eq!(ctx.provider, repo.provider);
        assert_eq!(ctx.remote_url, repo.remote_url);
    }

    #[test]
    fn test_resolve_repo_context_not_found() {
        let repos = HashMap::new();
        let result = resolve_repo_context(&repos, Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_repo_context_success() {
        let repo = test_repo();
        let mut repos = HashMap::new();
        repos.insert(repo.id, repo.clone());

        let ctx = resolve_repo_context(&repos, repo.id).unwrap();
        assert_eq!(ctx.path, repo.path);
        assert_eq!(ctx.provider, repo.provider);
    }

    #[test]
    fn test_build_failing_checks_message_no_failures() {
        let checks = vec![
            PrCheck {
                name: "build".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("SUCCESS".to_string()),
                details_url: None,
                description: None,
            },
        ];
        assert!(build_failing_checks_message(&checks).is_none());
    }

    #[test]
    fn test_build_failing_checks_message_empty() {
        assert!(build_failing_checks_message(&[]).is_none());
    }

    #[test]
    fn test_build_failing_checks_message_with_failures() {
        let checks = vec![
            PrCheck {
                name: "build".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("SUCCESS".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "test".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("FAILURE".to_string()),
                details_url: Some("https://ci.example.com/123".to_string()),
                description: Some("Tests failed".to_string()),
            },
            PrCheck {
                name: "lint".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("failure".to_string()),
                details_url: None,
                description: None,
            },
        ];

        let msg = build_failing_checks_message(&checks).unwrap();
        assert!(msg.contains("**test**"));
        assert!(msg.contains("Tests failed"));
        assert!(msg.contains("https://ci.example.com/123"));
        assert!(msg.contains("**lint**"));
        assert!(msg.contains("No description"));
        assert!(!msg.contains("**build**"));
    }

    #[test]
    fn test_build_failing_checks_message_lowercase_failure() {
        let checks = vec![PrCheck {
            name: "ci".to_string(),
            status: "COMPLETED".to_string(),
            conclusion: Some("failure".to_string()),
            details_url: None,
            description: Some("CI failed".to_string()),
        }];

        let msg = build_failing_checks_message(&checks).unwrap();
        assert!(msg.contains("**ci**"));
        assert!(msg.contains("CI failed"));
    }

    // --- resolve_merge_method tests ---

    #[test]
    fn test_resolve_merge_method_default() {
        assert_eq!(resolve_merge_method(None), "squash");
    }

    #[test]
    fn test_resolve_merge_method_explicit() {
        assert_eq!(
            resolve_merge_method(Some("merge".to_string())),
            "merge"
        );
        assert_eq!(
            resolve_merge_method(Some("rebase".to_string())),
            "rebase"
        );
        assert_eq!(
            resolve_merge_method(Some("squash".to_string())),
            "squash"
        );
    }

    // --- validate_provider_for_pr_create tests ---

    #[test]
    fn test_validate_provider_github_create() {
        assert!(validate_provider_for_pr_create(&GitProvider::GitHub).is_ok());
    }

    #[test]
    fn test_validate_provider_ado_create() {
        assert!(validate_provider_for_pr_create(&GitProvider::AzureDevOps).is_ok());
    }

    #[test]
    fn test_validate_provider_unknown_create() {
        assert!(validate_provider_for_pr_create(&GitProvider::Unknown).is_err());
    }

    // --- validate_provider_for_merge tests ---

    #[test]
    fn test_validate_provider_github_merge() {
        assert!(validate_provider_for_merge(&GitProvider::GitHub).is_ok());
    }

    #[test]
    fn test_validate_provider_ado_merge() {
        assert!(validate_provider_for_merge(&GitProvider::AzureDevOps).is_ok());
    }

    #[test]
    fn test_validate_provider_unknown_merge() {
        assert!(validate_provider_for_merge(&GitProvider::Unknown).is_err());
    }

    // --- provider_supports_issues tests ---

    #[test]
    fn test_github_supports_issues() {
        assert!(provider_supports_issues(&GitProvider::GitHub));
    }

    #[test]
    fn test_ado_does_not_support_issues() {
        assert!(!provider_supports_issues(&GitProvider::AzureDevOps));
    }

    #[test]
    fn test_unknown_does_not_support_issues() {
        assert!(!provider_supports_issues(&GitProvider::Unknown));
    }

    // --- provider_supports_workflows tests ---

    #[test]
    fn test_github_supports_workflows() {
        assert!(provider_supports_workflows(&GitProvider::GitHub));
    }

    #[test]
    fn test_ado_supports_workflows() {
        assert!(provider_supports_workflows(&GitProvider::AzureDevOps));
    }

    #[test]
    fn test_unknown_does_not_support_workflows() {
        assert!(!provider_supports_workflows(&GitProvider::Unknown));
    }

    // --- empty_pr_full_data tests ---

    #[test]
    fn test_empty_pr_full_data() {
        let id = Uuid::new_v4();
        let data = empty_pr_full_data(id);
        assert_eq!(data.info.workspace_id, id);
        assert!(data.info.pr_number.is_none());
        assert!(data.reviews.is_empty());
        assert!(data.review_comments.is_empty());
    }

    // --- empty_reviews_and_comments tests ---

    #[test]
    fn test_empty_reviews_and_comments() {
        let rac = empty_reviews_and_comments();
        assert!(rac.reviews.is_empty());
        assert!(rac.review_comments.is_empty());
    }

    // --- count_failing_checks tests ---

    #[test]
    fn test_count_failing_checks_none() {
        assert_eq!(count_failing_checks(&[]), 0);
    }

    #[test]
    fn test_count_failing_checks_all_passing() {
        let checks = vec![
            PrCheck {
                name: "build".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("SUCCESS".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "lint".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("SUCCESS".to_string()),
                details_url: None,
                description: None,
            },
        ];
        assert_eq!(count_failing_checks(&checks), 0);
    }

    #[test]
    fn test_count_failing_checks_mixed() {
        let checks = vec![
            PrCheck {
                name: "build".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("SUCCESS".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "test".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("FAILURE".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "lint".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("failure".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "deploy".to_string(),
                status: "IN_PROGRESS".to_string(),
                conclusion: None,
                details_url: None,
                description: None,
            },
        ];
        assert_eq!(count_failing_checks(&checks), 2);
    }

    #[test]
    fn test_count_failing_checks_null_conclusion() {
        let checks = vec![PrCheck {
            name: "pending".to_string(),
            status: "IN_PROGRESS".to_string(),
            conclusion: None,
            details_url: None,
            description: None,
        }];
        assert_eq!(count_failing_checks(&checks), 0);
    }

    // --- parse_ado_url edge cases ---

    #[test]
    fn test_parse_ado_url_empty_string() {
        let result = parse_ado_url(&Some(String::new()));
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_ado_url_non_ado_url() {
        let result = parse_ado_url(&Some("https://github.com/user/repo".to_string()));
        assert!(result.is_err());
    }

    // --- WsContext and RepoContext field access ---

    #[test]
    fn test_ws_context_fields_match() {
        let repo = test_repo();
        let mut ws = test_workspace(repo.id);
        ws.branch = "my-feature".to_string();

        let mut workspaces = HashMap::new();
        let mut repos = HashMap::new();
        workspaces.insert(ws.id, ws.clone());
        repos.insert(repo.id, repo.clone());

        let ctx = resolve_ws_context(&workspaces, &repos, ws.id).unwrap();
        assert_eq!(ctx.worktree_path, ws.worktree_path);
        assert_eq!(ctx.branch, "my-feature");
        assert_eq!(ctx.default_branch, "main");
    }

    #[test]
    fn test_resolve_repo_context_with_remote_url() {
        let mut repo = test_repo();
        repo.remote_url = Some("https://github.com/org/repo".to_string());
        let mut repos = HashMap::new();
        repos.insert(repo.id, repo.clone());

        let ctx = resolve_repo_context(&repos, repo.id).unwrap();
        assert_eq!(ctx.remote_url, Some("https://github.com/org/repo".to_string()));
    }

    #[test]
    fn test_resolve_repo_context_no_remote_url() {
        let repo = test_repo();
        let mut repos = HashMap::new();
        repos.insert(repo.id, repo.clone());

        let ctx = resolve_repo_context(&repos, repo.id).unwrap();
        assert!(ctx.remote_url.is_none());
    }

    // --- build_failing_checks_message format details ---

    #[test]
    fn test_build_failing_checks_message_includes_fix_instruction() {
        let checks = vec![PrCheck {
            name: "test".to_string(),
            status: "COMPLETED".to_string(),
            conclusion: Some("FAILURE".to_string()),
            details_url: None,
            description: None,
        }];
        let msg = build_failing_checks_message(&checks).unwrap();
        assert!(msg.contains("fix"));
    }

    #[test]
    fn test_build_failing_checks_message_url_na_when_none() {
        let checks = vec![PrCheck {
            name: "test".to_string(),
            status: "COMPLETED".to_string(),
            conclusion: Some("FAILURE".to_string()),
            details_url: None,
            description: None,
        }];
        let msg = build_failing_checks_message(&checks).unwrap();
        assert!(msg.contains("N/A"));
    }

    #[test]
    fn test_build_failing_checks_skips_non_failure_conclusions() {
        let checks = vec![
            PrCheck {
                name: "cancelled".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("CANCELLED".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "neutral".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("NEUTRAL".to_string()),
                details_url: None,
                description: None,
            },
            PrCheck {
                name: "skipped".to_string(),
                status: "COMPLETED".to_string(),
                conclusion: Some("SKIPPED".to_string()),
                details_url: None,
                description: None,
            },
        ];
        assert!(build_failing_checks_message(&checks).is_none());
    }

    // --- extract_ado_pat edge cases ---

    #[test]
    fn test_extract_ado_pat_whitespace_only() {
        // Non-empty whitespace should still succeed (it's not empty)
        let pat = extract_ado_pat(Some("  ")).unwrap();
        assert_eq!(pat, "  ");
    }

    #[test]
    fn test_extract_ado_pat_long_token() {
        let long = "a".repeat(1000);
        let pat = extract_ado_pat(Some(&long)).unwrap();
        assert_eq!(pat.len(), 1000);
    }

    // -----------------------------------------------------------------------
    // enrich_pr_info tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_enrich_pr_info_sets_workspace_and_checks() {
        let ws_id = Uuid::new_v4();
        let mut info = PrInfo::empty(Uuid::nil());
        let checks = vec![PrCheck {
            name: "build".to_string(),
            status: "COMPLETED".to_string(),
            conclusion: Some("SUCCESS".to_string()),
            details_url: None,
            description: None,
        }];

        enrich_pr_info(&mut info, ws_id, checks);
        assert_eq!(info.workspace_id, ws_id);
        assert_eq!(info.checks.len(), 1);
        assert_eq!(info.checks[0].name, "build");
    }

    #[test]
    fn test_enrich_pr_info_empty_checks() {
        let ws_id = Uuid::new_v4();
        let mut info = PrInfo::empty(Uuid::nil());

        enrich_pr_info(&mut info, ws_id, Vec::new());
        assert_eq!(info.workspace_id, ws_id);
        assert!(info.checks.is_empty());
    }

    #[test]
    fn test_enrich_pr_info_replaces_existing_checks() {
        let ws_id = Uuid::new_v4();
        let mut info = PrInfo::empty(Uuid::nil());
        info.checks = vec![PrCheck {
            name: "old".to_string(),
            status: "COMPLETED".to_string(),
            conclusion: Some("SUCCESS".to_string()),
            details_url: None,
            description: None,
        }];

        let new_checks = vec![PrCheck {
            name: "new".to_string(),
            status: "COMPLETED".to_string(),
            conclusion: Some("FAILURE".to_string()),
            details_url: None,
            description: None,
        }];

        enrich_pr_info(&mut info, ws_id, new_checks);
        assert_eq!(info.checks.len(), 1);
        assert_eq!(info.checks[0].name, "new");
    }

    // -----------------------------------------------------------------------
    // build_pr_full_data tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_pr_full_data_assembles_correctly() {
        let ws_id = Uuid::new_v4();
        let info = PrInfo::empty(ws_id);
        let reviews = vec![PrReview {
            id: 1,
            author: "alice".to_string(),
            state: "APPROVED".to_string(),
            body: "LGTM".to_string(),
            submitted_at: "2024-01-01".to_string(),
        }];
        let comments = vec![PrComment {
            id: 10,
            author: "bob".to_string(),
            body: "nit".to_string(),
            path: Some("src/main.rs".to_string()),
            line: Some(42),
            created_at: "2024-01-01".to_string(),
        }];

        let data = build_pr_full_data(info, reviews.clone(), comments.clone());
        assert_eq!(data.info.workspace_id, ws_id);
        assert_eq!(data.reviews.len(), 1);
        assert_eq!(data.reviews[0].author, "alice");
        assert_eq!(data.review_comments.len(), 1);
        assert_eq!(data.review_comments[0].author, "bob");
    }

    #[test]
    fn test_build_pr_full_data_empty() {
        let data = build_pr_full_data(PrInfo::empty(Uuid::new_v4()), Vec::new(), Vec::new());
        assert!(data.reviews.is_empty());
        assert!(data.review_comments.is_empty());
    }

    // -----------------------------------------------------------------------
    // merge_ado_reviews tests
    // -----------------------------------------------------------------------

    fn make_review(id: u64, author: &str) -> PrReview {
        PrReview {
            id,
            author: author.to_string(),
            state: "APPROVED".to_string(),
            body: String::new(),
            submitted_at: "2024-01-01".to_string(),
        }
    }

    #[test]
    fn test_merge_ado_reviews_both_empty() {
        let merged = merge_ado_reviews(Vec::new(), Vec::new());
        assert!(merged.is_empty());
    }

    #[test]
    fn test_merge_ado_reviews_only_reviewer() {
        let reviewer = vec![make_review(1, "alice")];
        let merged = merge_ado_reviews(reviewer, Vec::new());
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].author, "alice");
    }

    #[test]
    fn test_merge_ado_reviews_only_thread() {
        let thread = vec![make_review(2, "bob")];
        let merged = merge_ado_reviews(Vec::new(), thread);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].author, "bob");
    }

    #[test]
    fn test_merge_ado_reviews_combined() {
        let reviewer = vec![make_review(1, "alice"), make_review(2, "charlie")];
        let thread = vec![make_review(3, "bob")];
        let merged = merge_ado_reviews(reviewer, thread);
        assert_eq!(merged.len(), 3);
        // reviewer reviews come first
        assert_eq!(merged[0].author, "alice");
        assert_eq!(merged[1].author, "charlie");
        assert_eq!(merged[2].author, "bob");
    }
}
