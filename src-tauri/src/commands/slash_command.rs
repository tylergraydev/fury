use crate::error::AppError;
use crate::models::slash_command::SlashCommand;
use crate::services::slash_commands as slash_svc;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn list_slash_commands(
    state: State<'_, AppState>,
    context_id: String,
    context_type: String,
) -> Result<Vec<SlashCommand>, AppError> {
    let id: Uuid = context_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let repo_path = if context_type == "repo" {
        let repos = state.repositories.read().unwrap();
        repos.get(&id).map(|r| r.path.clone())
    } else {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces.get(&id).ok_or(AppError::WorkspaceNotFound(id))?;
        let repos = state.repositories.read().unwrap();
        repos.get(&ws.repo_id).map(|r| r.path.clone())
    };

    slash_svc::discover_commands(repo_path.as_deref())
}

#[tauri::command]
pub fn get_slash_command_content(
    state: State<'_, AppState>,
    workspace_id: String,
    name: String,
) -> Result<Option<SlashCommand>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let repo_path = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&ws_id)
            .ok_or(AppError::WorkspaceNotFound(ws_id))?;
        let repos = state.repositories.read().unwrap();
        repos.get(&ws.repo_id).map(|r| r.path.clone())
    };

    let commands = slash_svc::discover_commands(repo_path.as_deref())?;
    Ok(commands.into_iter().find(|c| c.name == name))
}
