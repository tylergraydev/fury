use crate::error::AppError;
use crate::models::slash_command::SlashCommand;
use crate::services::slash_commands as slash_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

/// Inner: resolve the repo path from state for a given context (workspace or repo).
pub(crate) fn resolve_repo_path(
    state: &State<'_, AppState>,
    context_id: &str,
    context_type: &str,
) -> Result<Option<std::path::PathBuf>, AppError> {
    let id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    if context_type == "repo" {
        let repos = state.repositories.read().unwrap();
        Ok(repos.get(&id).map(|r| r.path.clone()))
    } else {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        let repos = state.repositories.read().unwrap();
        Ok(repos.get(&ws.repo_id).map(|r| r.path.clone()))
    }
}

/// Inner: discover slash commands at an optional repo path.
pub(crate) fn list_slash_commands_inner(
    repo_path: Option<&std::path::Path>,
) -> Result<Vec<SlashCommand>, AppError> {
    slash_svc::discover_commands(repo_path)
}

/// Inner: find a specific slash command by name.
pub(crate) fn get_slash_command_content_inner(
    repo_path: Option<&std::path::Path>,
    name: &str,
) -> Result<Option<SlashCommand>, AppError> {
    let commands = slash_svc::discover_commands(repo_path)?;
    Ok(commands.into_iter().find(|c| c.name == name))
}

#[tauri::command]
#[specta::specta]
pub async fn list_slash_commands(
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
) -> Result<Vec<SlashCommand>, AppError> {
    let repo_path = resolve_repo_path(&state, &context_id, &context_type)?;

    tokio::task::spawn_blocking(move || list_slash_commands_inner(repo_path.as_deref()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_slash_command_content(
    state: State<'_, AppState>,
    workspace_id: String,
    name: String,
) -> Result<Option<SlashCommand>, AppError> {
    let repo_path = resolve_repo_path(&state, &workspace_id, "workspace")?;

    tokio::task::spawn_blocking(move || get_slash_command_content_inner(repo_path.as_deref(), &name))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_slash_commands_inner_no_repo() {
        let result = list_slash_commands_inner(None);
        assert!(result.is_ok());
        // With no repo path, should return global commands (or empty)
        let commands = result.unwrap();
        // All returned commands should have valid names
        for cmd in &commands {
            assert!(!cmd.name.is_empty());
        }
    }

    #[test]
    fn test_list_slash_commands_inner_nonexistent_path() {
        let path = std::path::Path::new("/tmp/nonexistent-slash-cmd-test");
        let result = list_slash_commands_inner(Some(path));
        // Should still succeed (just returns global commands, no project ones)
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_slash_command_content_inner_not_found() {
        let result = get_slash_command_content_inner(None, "nonexistent-command-xyz");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_get_slash_command_content_inner_empty_name() {
        let result = get_slash_command_content_inner(None, "");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_list_and_find_command() {
        // List commands, then try to find one by name
        let commands = list_slash_commands_inner(None).unwrap();
        if let Some(first) = commands.first() {
            let found = get_slash_command_content_inner(None, &first.name).unwrap();
            assert!(found.is_some());
            assert_eq!(found.unwrap().name, first.name);
        }
    }

    // ── Command wrapper tests ──

    #[tokio::test]
    async fn test_list_slash_commands_command_with_repo_context() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let repo = test_repo();
        state.repositories.write().unwrap().insert(repo.id, repo.clone());

        let result = list_slash_commands(state, repo.id.to_string(), "repo".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_list_slash_commands_command_with_workspace_context() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let repo = test_repo();
        let ws = test_workspace(repo.id);
        state.repositories.write().unwrap().insert(repo.id, repo.clone());
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());

        let result = list_slash_commands(state, ws.id.to_string(), "workspace".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_get_slash_command_content_command_not_found() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let repo = test_repo();
        let ws = test_workspace(repo.id);
        state.repositories.write().unwrap().insert(repo.id, repo.clone());
        state.workspaces.write().unwrap().insert(ws.id, ws.clone());

        let result = get_slash_command_content(
            state,
            ws.id.to_string(),
            "nonexistent-command-xyz".to_string(),
        )
        .await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_list_slash_commands_command_invalid_context_id() {
        use crate::test_helpers::*;
        use tauri::Manager;
        let app = mock_app_with_state();
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let result = list_slash_commands(state, "bad-uuid".to_string(), "repo".to_string()).await;
        assert!(result.is_err());
    }
}
