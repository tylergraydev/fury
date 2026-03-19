use crate::error::AppError;
use crate::models::linear::{LinearIssue, LinkIssueRequest, UnlinkIssueRequest, WorkspaceIssue};
use crate::services::linear as linear_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

/// Inner: extract API key from settings. Returns the key string or an error.
pub(crate) fn extract_linear_api_key(
    state: &State<'_, AppState>,
) -> Result<String, AppError> {
    let settings = state.settings.read().unwrap();
    settings.linear.api_key.clone().ok_or_else(|| {
        AppError::LinearError(
            "Linear API key not configured. Set it in Settings > Linear.".to_string(),
        )
    })
}

/// Inner: parse workspace_id and link an issue in the database.
pub(crate) fn link_issue_inner(
    db: &crate::db::Database,
    workspace_id: &str,
    issue_id: &str,
    identifier: &str,
    title: &str,
    url: &str,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    db.link_workspace_issue(&ws_id, issue_id, identifier, title, url)
}

/// Inner: parse workspace_id and unlink an issue in the database.
pub(crate) fn unlink_issue_inner(
    db: &crate::db::Database,
    workspace_id: &str,
    issue_id: &str,
) -> Result<(), AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    db.unlink_workspace_issue(&ws_id, issue_id)
}

/// Inner: parse workspace_id and get all linked issues.
pub(crate) fn get_workspace_issues_inner(
    db: &crate::db::Database,
    workspace_id: &str,
) -> Result<Vec<WorkspaceIssue>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    db.get_workspace_issues(&ws_id)
}

#[tauri::command]
pub async fn search_linear_issues(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<LinearIssue>, AppError> {
    let api_key = extract_linear_api_key(&state)?;

    tokio::task::spawn_blocking(move || linear_svc::search_issues(&api_key, &query))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn link_issue_to_workspace(
    state: State<'_, AppState>,
    request: LinkIssueRequest,
) -> Result<(), AppError> {
    let ws_id: Uuid = request
        .workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    {
        let workspaces = state.workspaces.read().unwrap();
        workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
    }

    let db_guard = state.db.lock().unwrap();
    let db = db_guard
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    link_issue_inner(
        db,
        &request.workspace_id,
        &request.issue_id,
        &request.identifier,
        &request.title,
        &request.url,
    )
}

#[tauri::command]
pub async fn unlink_issue_from_workspace(
    state: State<'_, AppState>,
    request: UnlinkIssueRequest,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    unlink_issue_inner(db, &request.workspace_id, &request.issue_id)
}

#[tauri::command]
pub async fn get_workspace_issues(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceIssue>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard
        .as_ref()
        .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
    get_workspace_issues_inner(db, &workspace_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    #[test]
    fn test_link_issue_inner_success() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let result = link_issue_inner(
            &db,
            &ws.id.to_string(),
            "ISSUE-123",
            "ENG-42",
            "Fix the bug",
            "https://linear.app/team/ENG-42",
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_link_issue_inner_invalid_workspace_id() {
        let db = test_db();
        let result = link_issue_inner(
            &db,
            "not-a-uuid",
            "ISSUE-123",
            "ENG-42",
            "Fix the bug",
            "https://linear.app/team/ENG-42",
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_unlink_issue_inner_success() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        // Link first
        link_issue_inner(
            &db,
            &ws.id.to_string(),
            "ISSUE-123",
            "ENG-42",
            "Fix the bug",
            "https://linear.app/team/ENG-42",
        )
        .unwrap();

        // Unlink
        let result = unlink_issue_inner(&db, &ws.id.to_string(), "ISSUE-123");
        assert!(result.is_ok());
    }

    #[test]
    fn test_unlink_issue_inner_invalid_workspace_id() {
        let db = test_db();
        let result = unlink_issue_inner(&db, "garbage", "ISSUE-123");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_workspace_issues_inner_empty() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let result = get_workspace_issues_inner(&db, &ws.id.to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_get_workspace_issues_inner_after_link() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        link_issue_inner(
            &db,
            &ws.id.to_string(),
            "ISSUE-1",
            "ENG-1",
            "First issue",
            "https://linear.app/team/ENG-1",
        )
        .unwrap();
        link_issue_inner(
            &db,
            &ws.id.to_string(),
            "ISSUE-2",
            "ENG-2",
            "Second issue",
            "https://linear.app/team/ENG-2",
        )
        .unwrap();

        let issues = get_workspace_issues_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(issues.len(), 2);
    }

    #[test]
    fn test_get_workspace_issues_inner_invalid_workspace_id() {
        let db = test_db();
        let result = get_workspace_issues_inner(&db, "not-valid");
        assert!(result.is_err());
    }

    #[test]
    fn test_link_then_unlink_then_get() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let ws_id = ws.id.to_string();

        link_issue_inner(&db, &ws_id, "ISSUE-99", "ENG-99", "Bug", "https://url").unwrap();
        assert_eq!(get_workspace_issues_inner(&db, &ws_id).unwrap().len(), 1);

        unlink_issue_inner(&db, &ws_id, "ISSUE-99").unwrap();
        assert_eq!(get_workspace_issues_inner(&db, &ws_id).unwrap().len(), 0);
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    #[tokio::test]
    async fn test_link_issue_to_workspace_command() {
        let app = mock_app_with_state();
        let state: State<'_, AppState> = app.state();

        // Insert repo + workspace into DB and state
        let (repo, ws) = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            insert_test_repo_and_workspace(db)
        };
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());
        state.repositories.write().unwrap().insert(repo.id, repo.clone());

        let request = LinkIssueRequest {
            workspace_id: ws.id.to_string(),
            issue_id: "ISSUE-CMD-1".to_string(),
            identifier: "ENG-CMD-1".to_string(),
            title: "Command test issue".to_string(),
            url: "https://linear.app/team/ENG-CMD-1".to_string(),
        };

        let result = link_issue_to_workspace(state, request).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_link_issue_to_workspace_command_workspace_not_in_state() {
        let app = mock_app_with_state();
        let state: State<'_, AppState> = app.state();

        // Insert into DB but NOT into state.workspaces
        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            ws.id
        };

        let request = LinkIssueRequest {
            workspace_id: ws_id.to_string(),
            issue_id: "ISSUE-1".to_string(),
            identifier: "ENG-1".to_string(),
            title: "Title".to_string(),
            url: "https://url".to_string(),
        };

        let result = link_issue_to_workspace(state, request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_unlink_issue_from_workspace_command() {
        let app = mock_app_with_state();
        let state: State<'_, AppState> = app.state();

        let (repo, ws) = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let pair = insert_test_repo_and_workspace(db);
            // Link an issue first
            db.link_workspace_issue(&pair.1.id, "ISSUE-U1", "ENG-U1", "To unlink", "https://url")
                .unwrap();
            pair
        };
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());
        state.repositories.write().unwrap().insert(repo.id, repo.clone());

        let request = UnlinkIssueRequest {
            workspace_id: ws.id.to_string(),
            issue_id: "ISSUE-U1".to_string(),
        };

        let result = unlink_issue_from_workspace(state, request).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_get_workspace_issues_command_empty() {
        let app = mock_app_with_state();
        let state: State<'_, AppState> = app.state();

        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            ws.id
        };

        let result = get_workspace_issues(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_get_workspace_issues_command_with_linked() {
        let app = mock_app_with_state();
        let state: State<'_, AppState> = app.state();

        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            db.link_workspace_issue(&ws.id, "I1", "ENG-1", "First", "https://u1")
                .unwrap();
            db.link_workspace_issue(&ws.id, "I2", "ENG-2", "Second", "https://u2")
                .unwrap();
            ws.id
        };

        let result = get_workspace_issues(state, ws_id.to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 2);
    }
}
