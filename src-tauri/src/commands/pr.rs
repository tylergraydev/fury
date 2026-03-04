use crate::error::AppError;
use crate::models::pr::{
    CreatePrRequest, IssueDetail, IssueListItem, MergeResult, PrCheck, PrComment, PrDetail,
    PrFullData, PrInfo, PrListItem, PrReview, ReviewsAndComments, RunLogsResult, WorkflowJob,
    WorkflowRun,
};
use crate::services::gh as gh_svc;
use crate::state::AppState;
use tauri::{Emitter, State};
use uuid::Uuid;

#[tauri::command]
pub async fn create_pr(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: CreatePrRequest,
) -> Result<PrInfo, AppError> {
    let ws_id = request.workspace_id;

    let (worktree_path, branch, default_branch) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?;
        (
            ws.worktree_path.clone(),
            ws.branch.clone(),
            repo.default_branch.clone(),
        )
    };

    let draft = request.draft.unwrap_or(false);
    let title = request.title;
    let body = request.body;

    tokio::task::spawn_blocking(move || {
        gh_svc::check_gh_auth()?;

        // Auto-commit uncommitted changes before pushing
        if gh_svc::has_uncommitted_changes(&worktree_path)? {
            gh_svc::stage_and_commit(&worktree_path, &title)?;
        }

        gh_svc::push_branch(&worktree_path, &branch)?;

        let mut pr_info = gh_svc::create_pr(
            &worktree_path,
            &title,
            &body,
            &default_branch,
            draft,
        )?;
        pr_info.workspace_id = ws_id;

        let _ = app.emit(&format!("pr-updated:{}", ws_id), &pr_info);

        Ok(pr_info)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_pr_info(state: State<'_, AppState>, workspace_id: String) -> Result<PrInfo, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        // Parallelize PR info + checks fetch
        let (info_result, checks_result) = std::thread::scope(|s| {
            let path = &worktree_path;
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

#[tauri::command]
pub async fn get_pr_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrCheck>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_pr_checks(&worktree_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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

    let (worktree_path, branch) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        (ws.worktree_path.clone(), ws.branch.clone())
    };

    tokio::task::spawn_blocking(move || {
        // Auto-commit uncommitted changes before pushing
        if gh_svc::has_uncommitted_changes(&worktree_path)? {
            gh_svc::stage_and_commit(&worktree_path, "Update changes")?;
        }

        gh_svc::push_branch(&worktree_path, &branch)?;

        // Parallelize PR info + checks fetch after push
        let (info_result, checks_result) = std::thread::scope(|s| {
            let path = &worktree_path;
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

#[tauri::command]
pub async fn fix_failing_checks(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let checks = gh_svc::get_pr_checks(&worktree_path)?;

        let failing: Vec<_> = checks
            .iter()
            .filter(|c| {
                c.conclusion.as_deref() == Some("FAILURE") || c.conclusion.as_deref() == Some("failure")
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let method = merge_method.unwrap_or_else(|| "squash".to_string());

    tokio::task::spawn_blocking(move || {
        let result = gh_svc::merge_pr(&worktree_path, &method)?;

        let _ = app.emit(&format!("pr-merged:{}", ws_id), &result);

        Ok(result)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_pr_reviews(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrReview>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_pr_reviews(&worktree_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_pr_review_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<PrComment>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_pr_review_comments(&worktree_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

/// Optimized: fetches PR info, checks, reviews, and comments in minimal CLI calls.
/// Uses thread::scope to parallelize (gh pr view --json all_fields) || (gh pr checks),
/// then fetches review comments using the PR metadata from the first call.
/// Reduces 5 CLI spawns to 3, with 2 running in parallel.
#[tauri::command]
pub fn get_pr_full_data(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PrFullData, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    // Phase 1: Parallel — combined pr view (info + reviews) alongside pr checks
    let (info_reviews_result, checks_result) = std::thread::scope(|s| {
        let path = &worktree_path;
        let t1 = s.spawn(|| gh_svc::get_pr_info_with_reviews(path));
        let t2 = s.spawn(|| gh_svc::get_pr_checks(path));
        (t1.join().unwrap(), t2.join().unwrap())
    });

    match info_reviews_result? {
        Some((mut info, reviews)) => {
            info.workspace_id = ws_id;
            info.checks = checks_result.unwrap_or_default();

            // Phase 2: Fetch review comments using PR metadata (no redundant gh pr view)
            let review_comments =
                if let (Some(number), Some(url)) = (info.pr_number, info.pr_url.as_ref()) {
                    gh_svc::get_pr_review_comments_for_pr(&worktree_path, number, url)
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

/// Optimized: fetches reviews and comments in a single flow.
/// Uses one `gh pr view` to get both reviews and PR metadata,
/// then uses that metadata for the comments API call (no redundant gh pr view).
#[tauri::command]
pub fn get_reviews_and_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ReviewsAndComments, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    let (reviews, review_comments) = gh_svc::get_reviews_and_comments(&worktree_path)?;

    Ok(ReviewsAndComments {
        reviews,
        review_comments,
    })
}

#[tauri::command]
pub async fn list_repo_prs(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<PrListItem>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::list_repo_prs(&repo_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_repo_issues(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<IssueListItem>, AppError> {
    let id: Uuid = repo_id
        .parse()
        .map_err(|_| AppError::RepoNotFound(Uuid::nil()))?;

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::list_repo_issues(&repo_path)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_pr_detail(&repo_path, pr_number)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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

    let repo_path = {
        let repos = state.repositories.read().unwrap();
        let repo = repos.get(&id).ok_or(AppError::RepoNotFound(id))?;
        repo.path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_issue_detail(&repo_path, issue_number)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_workflow_runs(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkflowRun>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let (worktree_path, branch) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        (ws.worktree_path.clone(), ws.branch.clone())
    };

    tokio::task::spawn_blocking(move || gh_svc::get_workflow_runs(&worktree_path, &branch))
        .await
        .map_err(|e| AppError::PrError(format!("task failed: {}", e)))?
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

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_run_jobs(&worktree_path, run_id)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::get_run_logs(&worktree_path, run_id, failed_only)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
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

    let worktree_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        ws.worktree_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        gh_svc::rerun_workflow(&worktree_path, run_id, failed_only)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}
