use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::workspace_template::{
    CreateWorkspaceTemplateRequest, UpdateWorkspaceTemplateRequest, WorkspaceTemplate,
};
use crate::state::AppState;

#[tauri::command]
pub async fn create_workspace_template(
    state: State<'_, AppState>,
    request: CreateWorkspaceTemplateRequest,
) -> Result<WorkspaceTemplate, AppError> {
    let template = {
        let now = Utc::now();
        let template = WorkspaceTemplate {
            id: Uuid::new_v4(),
            repo_id: request.repo_id,
            name: request.name,
            description: request.description,
            setup_script: request.setup_script,
            run_script: request.run_script,
            archive_script: request.archive_script,
            run_script_mode: request
                .run_script_mode
                .unwrap_or("nonconcurrent".to_string()),
            env_vars: request.env_vars.unwrap_or_default(),
            sparse_dirs: request.sparse_dirs,
            auto_commit: request.auto_commit.unwrap_or(true),
            created_at: now,
            updated_at: now,
        };

        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.insert_workspace_template(&template)?;
        }

        template
    };

    tokio::task::spawn_blocking(move || Ok(template))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_workspace_templates(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<Vec<WorkspaceTemplate>, AppError> {
    let repo_uuid =
        Uuid::parse_str(&repo_id).map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    let templates = {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.list_workspace_templates(&repo_uuid)?
        } else {
            vec![]
        }
    };

    tokio::task::spawn_blocking(move || Ok(templates))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn update_workspace_template(
    state: State<'_, AppState>,
    template_id: String,
    request: UpdateWorkspaceTemplateRequest,
) -> Result<WorkspaceTemplate, AppError> {
    let id = Uuid::parse_str(&template_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    let template = {
        let db = state.db.lock().unwrap();
        let db = db
            .as_ref()
            .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;

        let mut template = db
            .get_workspace_template(&id)?
            .ok_or_else(|| AppError::DbError(format!("Template not found: {}", id)))?;

        if let Some(name) = request.name {
            template.name = name;
        }
        if let Some(desc) = request.description {
            template.description = Some(desc);
        }
        if let Some(setup) = request.setup_script {
            template.setup_script = Some(setup);
        }
        if let Some(run) = request.run_script {
            template.run_script = Some(run);
        }
        if let Some(archive) = request.archive_script {
            template.archive_script = Some(archive);
        }
        if let Some(mode) = request.run_script_mode {
            template.run_script_mode = mode;
        }
        if let Some(env) = request.env_vars {
            template.env_vars = env;
        }
        if let Some(dirs) = request.sparse_dirs {
            template.sparse_dirs = Some(dirs);
        }
        if let Some(ac) = request.auto_commit {
            template.auto_commit = ac;
        }
        template.updated_at = Utc::now();

        db.update_workspace_template(&template)?;
        template
    };

    tokio::task::spawn_blocking(move || Ok(template))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_workspace_template(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<(), AppError> {
    let id = Uuid::parse_str(&template_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

    {
        let db = state.db.lock().unwrap();
        if let Some(db) = db.as_ref() {
            db.delete_workspace_template(&id)?;
        }
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}
