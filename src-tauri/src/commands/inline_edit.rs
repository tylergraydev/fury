use std::sync::Arc;

use crate::error::AppError;
use crate::services::claude_process;
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

/// Send a one-shot inline edit request to the sidecar.
///
/// Uses a dedicated `edit_id` (not the workspace UUID) so the sidecar routes
/// response events to `agent-stream:{edit_id}`, keeping the main agent session
/// untouched. Tools are disabled and thinking is off for fast, focused edits.
#[tauri::command]
#[specta::specta]
pub async fn inline_edit(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: Uuid,
    edit_id: Uuid,
    file_path: String,
    language: String,
    selected_code: String,
    full_file_content: String,
    instruction: String,
) -> Result<(), AppError> {
    // Resolve workspace cwd and env vars
    let (working_dir, env_vars) = {
        let workspaces = state.workspaces.read().unwrap();
        let ws = workspaces
            .get(&workspace_id)
            .ok_or(AppError::WorkspaceNotFound(workspace_id))?
            .clone();
        let repos = state.repositories.read().unwrap();
        let repo = repos
            .get(&ws.repo_id)
            .ok_or(AppError::RepoNotFound(ws.repo_id))?
            .clone();
        let settings = state.settings.read().unwrap().clone();
        let repo_settings =
            crate::commands::script::resolve_settings(&state, &repo.id).ok();
        let provider_override = repo_settings
            .as_ref()
            .and_then(|s| s.provider_override.as_ref());
        let env =
            claude_process::build_env_vars(&ws, &repo, &settings, provider_override);
        (ws.worktree_path.clone(), env)
    };

    let system_prompt = format!(
        "You are a precise code editor. The user has selected code from `{}` ({}).\n\
         Replace the selected code according to the user's instruction.\n\
         Respond with ONLY the replacement code. No markdown fences, no explanation, no comments about what you changed.",
        file_path, language
    );

    let prompt = format!(
        "Selected code:\n{}\n\nFull file for context:\n{}\n\nInstruction: {}",
        selected_code, full_file_content, instruction
    );

    let cmd = claude_process::SidecarCommand::Query {
        id: edit_id.to_string(),
        prompt,
        cwd: working_dir.to_string_lossy().to_string(),
        session_id: None,
        model: None,
        system_prompt: Some(system_prompt),
        permission_mode: "bypassPermissions".to_string(),
        env_vars: Some(env_vars),
        additional_dirs: None,
        disable_thinking: Some(true),
    };

    let mut guard = state.agent_sidecar.lock().await;
    if guard.is_none() {
        *guard = Some(claude_process::start_sidecar(
            &app,
            Arc::clone(&state.agents),
            Arc::clone(&state.db),
        )?);
    }
    let handle = guard.as_mut().ok_or_else(|| {
        AppError::AgentError("Sidecar not running".to_string())
    })?;
    claude_process::send_command(handle, &cmd).await?;
    drop(guard);

    Ok(())
}

/// Cancel an in-progress inline edit by sending an interrupt to the sidecar.
#[tauri::command]
#[specta::specta]
pub async fn cancel_inline_edit(
    state: State<'_, AppState>,
    edit_id: Uuid,
) -> Result<(), AppError> {
    let cmd = claude_process::SidecarCommand::Interrupt {
        id: edit_id.to_string(),
    };

    let mut guard = state.agent_sidecar.lock().await;
    if let Some(handle) = guard.as_mut() {
        claude_process::send_command(handle, &cmd).await?;
    }
    Ok(())
}
