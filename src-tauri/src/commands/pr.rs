use std::path::PathBuf;

use crate::error::AppError;
use crate::models::pr::{
    CreatePrRequest, IssueDetail, IssueListItem, MergeResult, PrCheck, PrComment, PrDetail,
    PrFullData, PrInfo, PrListItem, PrReview, ReviewsAndComments, RunLogsResult, WorkflowJob,
    WorkflowRun,
};
use crate::models::repository::GitProvider;
use crate::services::ado as ado_svc;
use crate::services::gh as gh_svc;
use crate::services::provider as provider_svc;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

/// Context extracted from workspace + repository state for provider dispatch.
struct WsContext {
    worktree_path: PathBuf,
    branch: String,
    default_branch: String,
    provider: GitProvider,
    remote_url: Option<String>,
}

/// Extract workspace context (drops locks before returning).
fn ws_context(state: &State<'_, AppState>, ws_id: Uuid) -> Result<WsContext, AppError> {
    let workspaces = state.workspaces.read().unwrap();
    let ws = workspaces
        .get(&ws_id)
        .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    let repos = state.repositories.read().unwrap();
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

/// Context extracted from a repository for repo-level commands.
struct RepoContext {
    path: PathBuf,
    provider: GitProvider,
    remote_url: Option<String>,
}

fn repo_context(state: &State<'_, AppState>, repo_id: Uuid) -> Result<RepoContext, AppError> {
    let repos = state.repositories.read().unwrap();
    let repo = repos
        .get(&repo_id)
        .ok_or(AppError::RepoNotFound(repo_id))?;
    Ok(RepoContext {
        path: repo.path.clone(),
        provider: repo.provider.clone(),
        remote_url: repo.remote_url.clone(),
    })
}

/// Extract ADO PAT from app settings.
fn get_ado_pat(state: &State<'_, AppState>) -> Result<String, AppError> {
    let settings = state.settings.read().unwrap();
    settings
        .azure_devops
        .pat
        .clone()
        .filter(|p| !p.is_empty())
        .ok_or_else(|| {
            AppError::AzureDevOpsError(
                "Azure DevOps PAT not configured. Set it in Settings > Azure DevOps.".to_string(),
            )
        })
}

/// Parse ADO remote URL into (org, project, repo) or return error.
fn parse_ado_url(remote_url: &Option<String>) -> Result<(String, String, String), AppError> {
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

#[tauri::command]
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

            tokio::task::spawn_blocking(move || {
                if gh_svc::has_uncommitted_changes(&ctx.worktree_path)? {
                    gh_svc::stage_and_commit(&ctx.worktree_path, &title)?;
                }

                gh_svc::push_branch(&ctx.worktree_path, &ctx.branch)?;

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
                )?;

                let _ = app.emit(&format!("pr-updated:{}", ws_id), &pr_info);
                Ok(pr_info)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected. Cannot create PR.".into(),
        )),
    }
}

#[tauri::command]
pub async fn get_pr_info(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PrInfo, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
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
                        info.workspace_id = ws_id;
                        info.checks = checks_result.unwrap_or_default();
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

            tokio::task::spawn_blocking(move || {
                let info = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                )?;
                match info {
                    Some(mut pr_info) => {
                        if let Some(pr_id) = pr_info.pr_number {
                            pr_info.checks = ado_svc::get_pr_checks(
                                &pat, &org, &project, &repo_name, pr_id,
                            )
                            .unwrap_or_default();
                        }
                        Ok(pr_info)
                    }
                    None => Ok(PrInfo::empty(ws_id)),
                }
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(PrInfo::empty(ws_id)),
    }
}

#[tauri::command]
pub async fn get_pr_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrCheck>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
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

            tokio::task::spawn_blocking(move || {
                // Find the PR first to get its ID
                let info = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                )?;
                match info.and_then(|i| i.pr_number) {
                    Some(pr_id) => {
                        ado_svc::get_pr_checks(&pat, &org, &project, &repo_name, pr_id)
                    }
                    None => Ok(Vec::new()),
                }
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn push_changes(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
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
                    info.workspace_id = ws_id;
                    info.checks = checks_result.unwrap_or_default();
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

            tokio::task::spawn_blocking(move || {
                if gh_svc::has_uncommitted_changes(&ctx.worktree_path)? {
                    gh_svc::stage_and_commit(&ctx.worktree_path, "Update changes")?;
                }

                gh_svc::push_branch(&ctx.worktree_path, &ctx.branch)?;

                // Fetch PR info after push
                if let Ok(Some(mut info)) = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                ) {
                    if let Some(pr_id) = info.pr_number {
                        info.checks = ado_svc::get_pr_checks(
                            &pat, &org, &project, &repo_name, pr_id,
                        )
                        .unwrap_or_default();
                    }
                    let _ = app.emit(&format!("pr-updated:{}", ws_id), &info);
                }

                Ok(())
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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
pub async fn fix_failing_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
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
            let branch = ctx.branch.clone();

            tokio::task::spawn_blocking(move || {
                let info =
                    ado_svc::get_pr_by_branch(&pat, &org, &project, &repo_name, &branch, ws_id)?;
                match info.and_then(|i| i.pr_number) {
                    Some(pr_id) => {
                        ado_svc::get_pr_checks(&pat, &org, &project, &repo_name, pr_id)
                    }
                    None => Ok(Vec::new()),
                }
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))??
        }
        GitProvider::Unknown => Vec::new(),
    };

    let failing: Vec<_> = checks
        .iter()
        .filter(|c| {
            c.conclusion.as_deref() == Some("FAILURE")
                || c.conclusion.as_deref() == Some("failure")
        })
        .collect();

    if failing.is_empty() {
        return Ok("No failing checks found.".to_string());
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

    Ok(message)
}

#[tauri::command]
pub async fn merge_pr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    merge_method: Option<String>,
) -> Result<MergeResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;
    let method = merge_method.unwrap_or_else(|| "squash".to_string());

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

            tokio::task::spawn_blocking(move || {
                // Find the PR first
                let info = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                )?;
                let pr_id = info
                    .and_then(|i| i.pr_number)
                    .ok_or_else(|| AppError::PrError("No open PR found to merge.".into()))?;

                let result =
                    ado_svc::merge_pr(&pat, &org, &project, &repo_name, pr_id, &method)?;
                let _ = app.emit(&format!("pr-merged:{}", ws_id), &result);
                Ok(result)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Err(AppError::PrError(
            "Repository provider not detected. Cannot merge PR.".into(),
        )),
    }
}

#[tauri::command]
pub async fn get_pr_reviews(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrReview>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::get_pr_reviews(&ctx.worktree_path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            tokio::task::spawn_blocking(move || {
                let info = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                )?;
                match info.and_then(|i| i.pr_number) {
                    Some(pr_id) => {
                        ado_svc::get_pr_reviewers(&pat, &org, &project, &repo_name, pr_id)
                    }
                    None => Ok(Vec::new()),
                }
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn get_pr_review_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrComment>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_pr_review_comments(&ctx.worktree_path)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            tokio::task::spawn_blocking(move || {
                let info = ado_svc::get_pr_by_branch(
                    &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
                )?;
                match info.and_then(|i| i.pr_number) {
                    Some(pr_id) => {
                        let (_, comments) =
                            ado_svc::get_pr_threads(&pat, &org, &project, &repo_name, pr_id)?;
                        Ok(comments)
                    }
                    None => Ok(Vec::new()),
                }
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

/// Fetches PR info, checks, reviews, and comments.
#[tauri::command]
pub fn get_pr_full_data(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PrFullData, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            let (info_reviews_result, checks_result) = std::thread::scope(|s| {
                let path = &ctx.worktree_path;
                let t1 = s.spawn(|| gh_svc::get_pr_info_with_reviews(path));
                let t2 = s.spawn(|| gh_svc::get_pr_checks(path));
                (t1.join().unwrap(), t2.join().unwrap())
            });

            match info_reviews_result? {
                Some((mut info, reviews)) => {
                    info.workspace_id = ws_id;
                    info.checks = checks_result.unwrap_or_default();

                    let review_comments = if let (Some(number), Some(url)) =
                        (info.pr_number, info.pr_url.as_ref())
                    {
                        gh_svc::get_pr_review_comments_for_pr(&ctx.worktree_path, number, url)
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    };

                    Ok(PrFullData {
                        info,
                        reviews,
                        review_comments,
                    })
                }
                None => Ok(PrFullData {
                    info: PrInfo::empty(ws_id),
                    reviews: Vec::new(),
                    review_comments: Vec::new(),
                }),
            }
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let info =
                ado_svc::get_pr_by_branch(&pat, &org, &project, &repo_name, &ctx.branch, ws_id)?;

            match info {
                Some(mut pr_info) => {
                    let pr_id = pr_info.pr_number.unwrap_or(0);

                    // Fetch checks, reviewer votes, and threads
                    let checks =
                        ado_svc::get_pr_checks(&pat, &org, &project, &repo_name, pr_id)
                            .unwrap_or_default();
                    pr_info.checks = checks;

                    let reviewer_reviews =
                        ado_svc::get_pr_reviewers(&pat, &org, &project, &repo_name, pr_id)
                            .unwrap_or_default();

                    let (thread_reviews, review_comments) =
                        ado_svc::get_pr_threads(&pat, &org, &project, &repo_name, pr_id)
                            .unwrap_or_default();

                    let mut all_reviews = reviewer_reviews;
                    all_reviews.extend(thread_reviews);

                    Ok(PrFullData {
                        info: pr_info,
                        reviews: all_reviews,
                        review_comments,
                    })
                }
                None => Ok(PrFullData {
                    info: PrInfo::empty(ws_id),
                    reviews: Vec::new(),
                    review_comments: Vec::new(),
                }),
            }
        }
        GitProvider::Unknown => Ok(PrFullData {
            info: PrInfo::empty(ws_id),
            reviews: Vec::new(),
            review_comments: Vec::new(),
        }),
    }
}

/// Fetches reviews and comments.
#[tauri::command]
pub fn get_reviews_and_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ReviewsAndComments, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            let (reviews, review_comments) =
                gh_svc::get_reviews_and_comments(&ctx.worktree_path)?;
            Ok(ReviewsAndComments {
                reviews,
                review_comments,
            })
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let info =
                ado_svc::get_pr_by_branch(&pat, &org, &project, &repo_name, &ctx.branch, ws_id)?;

            match info.and_then(|i| i.pr_number) {
                Some(pr_id) => {
                    let reviewer_reviews =
                        ado_svc::get_pr_reviewers(&pat, &org, &project, &repo_name, pr_id)
                            .unwrap_or_default();
                    let (thread_reviews, review_comments) =
                        ado_svc::get_pr_threads(&pat, &org, &project, &repo_name, pr_id)
                            .unwrap_or_default();

                    let mut reviews = reviewer_reviews;
                    reviews.extend(thread_reviews);

                    Ok(ReviewsAndComments {
                        reviews,
                        review_comments,
                    })
                }
                None => Ok(ReviewsAndComments {
                    reviews: Vec::new(),
                    review_comments: Vec::new(),
                }),
            }
        }
        GitProvider::Unknown => Ok(ReviewsAndComments {
            reviews: Vec::new(),
            review_comments: Vec::new(),
        }),
    }
}

#[tauri::command]
pub async fn list_repo_prs(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<PrListItem>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::list_repo_prs(&ctx.path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            tokio::task::spawn_blocking(move || {
                ado_svc::list_prs(&pat, &org, &project, &repo_name)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn list_repo_issues(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<IssueListItem>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::list_repo_issues(&ctx.path))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO uses work items, not issues — not supported in MVP
        _ => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn get_pr_details(
    state: State<'_, AppState>,
    repo_id: String,
    pr_number: u32,
) -> Result<PrDetail, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::get_pr_detail(&ctx.path, pr_number))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO PR details not implemented yet — would need a dedicated ADO function
        _ => Err(AppError::PrError(
            "PR details not available for this provider.".into(),
        )),
    }
}

#[tauri::command]
pub async fn get_issue_details(
    state: State<'_, AppState>,
    repo_id: String,
    issue_number: u32,
) -> Result<IssueDetail, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;
    let ctx = repo_context(&state, id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || gh_svc::get_issue_detail(&ctx.path, issue_number))
                .await
                .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO uses work items, not issues
        _ => Err(AppError::PrError(
            "Issue details not available for this provider.".into(),
        )),
    }
}

#[tauri::command]
pub async fn get_workflow_runs(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkflowRun>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_workflow_runs(&ctx.worktree_path, &ctx.branch)
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            tokio::task::spawn_blocking(move || {
                ado_svc::get_pipeline_runs(&pat, &org, &project, &ctx.branch)
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn get_run_jobs(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
) -> Result<Vec<WorkflowJob>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_run_jobs(&ctx.worktree_path, run_id)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, _repo_name) = parse_ado_url(&ctx.remote_url)?;

            tokio::task::spawn_blocking(move || {
                ado_svc::get_build_timeline(&pat, &org, &project, run_id)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn get_run_logs(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
    failed_only: bool,
) -> Result<RunLogsResult, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::get_run_logs(&ctx.worktree_path, run_id, failed_only)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO log fetching not implemented in MVP
        _ => Ok(RunLogsResult {
            logs: String::new(),
            truncated: false,
        }),
    }
}

#[tauri::command]
pub async fn rerun_workflow(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: u64,
    failed_only: bool,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                gh_svc::rerun_workflow(&ctx.worktree_path, run_id, failed_only)
            })
            .await
            .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
        }
        // ADO rerun not implemented in MVP
        _ => Err(AppError::PrError(
            "Workflow rerun not available for this provider.".into(),
        )),
    }
}
