use crate::commands::pr::{
    build_pr_full_data, empty_pr_full_data, empty_reviews_and_comments, enrich_pr_info,
    get_ado_pat, merge_ado_reviews, parse_ado_url, parse_ws_id, ws_context,
};
use crate::error::AppError;
use crate::models::pr::{PrComment, PrFullData, PrReview, ReviewsAndComments};
use crate::models::repository::GitProvider;
use crate::services::ado as ado_svc;
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn get_pr_reviews(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrReview>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
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

            let info = ado_svc::get_pr_by_branch(
                &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
            )
            .await?;
            match info.and_then(|i| i.pr_number) {
                Some(pr_id) => {
                    ado_svc::get_pr_reviewers(&pat, &org, &project, &repo_name, pr_id).await
                }
                None => Ok(Vec::new()),
            }
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_pr_review_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrComment>, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
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

            let info = ado_svc::get_pr_by_branch(
                &pat, &org, &project, &repo_name, &ctx.branch, ws_id,
            )
            .await?;
            match info.and_then(|i| i.pr_number) {
                Some(pr_id) => {
                    let (_, comments) =
                        ado_svc::get_pr_threads(&pat, &org, &project, &repo_name, pr_id).await?;
                    Ok(comments)
                }
                None => Ok(Vec::new()),
            }
        }
        GitProvider::Unknown => Ok(Vec::new()),
    }
}

/// Fetches PR info, checks, reviews, and comments.
#[tauri::command]
#[specta::specta]
pub async fn get_pr_full_data(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PrFullData, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                let (info_reviews_result, checks_result) = std::thread::scope(|s| {
                    let path = &ctx.worktree_path;
                    let t1 = s.spawn(|| gh_svc::get_pr_info_with_reviews(path));
                    let t2 = s.spawn(|| gh_svc::get_pr_checks(path));
                    (t1.join().unwrap(), t2.join().unwrap())
                });

                match info_reviews_result? {
                    Some((mut info, reviews)) => {
                        enrich_pr_info(&mut info, ws_id, checks_result.unwrap_or_default());

                        let review_comments = if let (Some(number), Some(url)) =
                            (info.pr_number, info.pr_url.as_ref())
                        {
                            gh_svc::get_pr_review_comments_for_pr(&ctx.worktree_path, number, url)
                                .unwrap_or_default()
                        } else {
                            Vec::new()
                        };

                        Ok(build_pr_full_data(info, reviews, review_comments))
                    }
                    None => Ok(empty_pr_full_data(ws_id)),
                }
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let info =
                ado_svc::get_pr_by_branch(&pat, &org, &project, &repo_name, &ctx.branch, ws_id)
                    .await?;

            match info {
                Some(mut pr_info) => {
                    let pr_id = pr_info.pr_number.unwrap_or(0);

                    // Fetch checks, reviewer votes, and threads
                    let checks =
                        ado_svc::get_pr_checks(&pat, &org, &project, &repo_name, pr_id)
                            .await
                            .unwrap_or_default();
                    pr_info.checks = checks;

                    let reviewer_reviews =
                        ado_svc::get_pr_reviewers(&pat, &org, &project, &repo_name, pr_id)
                            .await
                            .unwrap_or_default();

                    let (thread_reviews, review_comments) =
                        ado_svc::get_pr_threads(&pat, &org, &project, &repo_name, pr_id)
                            .await
                            .unwrap_or_default();

                    let all_reviews = merge_ado_reviews(reviewer_reviews, thread_reviews);

                    Ok(build_pr_full_data(pr_info, all_reviews, review_comments))
                }
                None => Ok(empty_pr_full_data(ws_id)),
            }
        }
        GitProvider::Unknown => Ok(empty_pr_full_data(ws_id)),
    }
}

/// Fetches reviews and comments.
#[tauri::command]
#[specta::specta]
pub async fn get_reviews_and_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ReviewsAndComments, AppError> {
    let ws_id = parse_ws_id(&workspace_id)?;
    let ctx = ws_context(&state, ws_id)?;

    match ctx.provider {
        GitProvider::GitHub => {
            tokio::task::spawn_blocking(move || {
                let (reviews, review_comments) =
                    gh_svc::get_reviews_and_comments(&ctx.worktree_path)?;
                Ok(ReviewsAndComments {
                    reviews,
                    review_comments,
                })
            })
            .await
            .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
        }
        GitProvider::AzureDevOps => {
            let pat = get_ado_pat(&state)?;
            let (org, project, repo_name) = parse_ado_url(&ctx.remote_url)?;

            let info =
                ado_svc::get_pr_by_branch(&pat, &org, &project, &repo_name, &ctx.branch, ws_id)
                    .await?;

            match info.and_then(|i| i.pr_number) {
                Some(pr_id) => {
                    let reviewer_reviews =
                        ado_svc::get_pr_reviewers(&pat, &org, &project, &repo_name, pr_id)
                            .await
                            .unwrap_or_default();
                    let (thread_reviews, review_comments) =
                        ado_svc::get_pr_threads(&pat, &org, &project, &repo_name, pr_id)
                            .await
                            .unwrap_or_default();

                    let reviews = merge_ado_reviews(reviewer_reviews, thread_reviews);

                    Ok(ReviewsAndComments {
                        reviews,
                        review_comments,
                    })
                }
                None => Ok(empty_reviews_and_comments()),
            }
        }
        GitProvider::Unknown => Ok(empty_reviews_and_comments()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;
    use tauri::Manager;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_get_pr_full_data_workspace_not_found() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_pr_full_data(state, Uuid::new_v4().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_pr_full_data_invalid_id() {
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_pr_full_data(state, "bad-id".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_pr_full_data_unknown_provider_returns_empty() {
        let app = mock_app_with_state();
        let app_state = app.state::<crate::state::AppState>();
        let mut repo = test_repo();
        repo.provider = GitProvider::Unknown; // Default is GitHub, must override
        let repo_id = repo.id;
        app_state
            .repositories
            .write()
            .unwrap()
            .insert(repo_id, repo);
        let ws = test_workspace(repo_id);
        let ws_id = ws.id;
        app_state.workspaces.write().unwrap().insert(ws_id, ws);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_pr_full_data(state, ws_id.to_string()).await;
        assert!(result.is_ok(), "Expected Ok, got: {:?}", result.err());
        let data = result.unwrap();
        assert!(data.info.pr_number.is_none());
        assert!(data.reviews.is_empty());
        assert!(data.review_comments.is_empty());
    }

    #[tokio::test]
    async fn test_get_reviews_and_comments_unknown_provider() {
        let app = mock_app_with_state();
        let app_state = app.state::<crate::state::AppState>();
        let mut repo = test_repo();
        repo.provider = GitProvider::Unknown;
        let repo_id = repo.id;
        app_state
            .repositories
            .write()
            .unwrap()
            .insert(repo_id, repo);
        let ws = test_workspace(repo_id);
        let ws_id = ws.id;
        app_state.workspaces.write().unwrap().insert(ws_id, ws);

        let state: tauri::State<'_, crate::state::AppState> = app.state();
        let result = get_reviews_and_comments(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        let rac = result.unwrap();
        assert!(rac.reviews.is_empty());
        assert!(rac.review_comments.is_empty());
    }
}
