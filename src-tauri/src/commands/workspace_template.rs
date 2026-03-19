use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::error::AppError;
use crate::models::workspace_template::{
    CreateWorkspaceTemplateRequest, UpdateWorkspaceTemplateRequest, WorkspaceTemplate,
};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

pub(crate) fn create_workspace_template_inner(
    db: &Database,
    request: CreateWorkspaceTemplateRequest,
) -> Result<WorkspaceTemplate, AppError> {
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
    db.insert_workspace_template(&template)?;
    Ok(template)
}

pub(crate) fn list_workspace_templates_inner(
    db: &Database,
    repo_id: &str,
) -> Result<Vec<WorkspaceTemplate>, AppError> {
    let repo_uuid = Uuid::parse_str(repo_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.list_workspace_templates(&repo_uuid)
}

pub(crate) fn update_workspace_template_inner(
    db: &Database,
    template_id: &str,
    request: UpdateWorkspaceTemplateRequest,
) -> Result<WorkspaceTemplate, AppError> {
    let id = Uuid::parse_str(template_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;

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
    Ok(template)
}

pub(crate) fn delete_workspace_template_inner(
    db: &Database,
    template_id: &str,
) -> Result<(), AppError> {
    let id = Uuid::parse_str(template_id)
        .map_err(|e| AppError::DbError(format!("Invalid UUID: {}", e)))?;
    db.delete_workspace_template(&id)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_workspace_template(
    state: State<'_, AppState>,
    request: CreateWorkspaceTemplateRequest,
) -> Result<WorkspaceTemplate, AppError> {
    let template = {
        let db = state.db.lock().unwrap();
        let db = db
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        create_workspace_template_inner(db, request)?
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
    let templates = {
        let db = state.db.lock().unwrap();
        let db = db
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        list_workspace_templates_inner(db, &repo_id)?
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
    let template = {
        let db = state.db.lock().unwrap();
        let db = db
            .as_ref()
            .ok_or_else(|| AppError::DbError("Database not initialized".to_string()))?;
        update_workspace_template_inner(db, &template_id, request)?
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
    {
        let db = state.db.lock().unwrap();
        let db = db
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        delete_workspace_template_inner(db, &template_id)?;
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::workspace_template::{
        CreateWorkspaceTemplateRequest, UpdateWorkspaceTemplateRequest,
    };
    use crate::test_helpers::*;
    use std::collections::HashMap;

    fn make_create_request(repo_id: Uuid) -> CreateWorkspaceTemplateRequest {
        CreateWorkspaceTemplateRequest {
            repo_id,
            name: "my-template".to_string(),
            description: Some("A template".to_string()),
            setup_script: Some("npm install".to_string()),
            run_script: Some("npm start".to_string()),
            archive_script: None,
            run_script_mode: None,
            env_vars: None,
            sparse_dirs: None,
            auto_commit: None,
        }
    }

    #[test]
    fn test_create_workspace_template_inner() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        let req = make_create_request(repo.id);
        let template = create_workspace_template_inner(&db, req).unwrap();

        assert_eq!(template.name, "my-template");
        assert_eq!(template.repo_id, repo.id);
        assert_eq!(template.run_script_mode, "nonconcurrent");
        assert!(template.auto_commit);
        assert!(template.env_vars.is_empty());
    }

    #[test]
    fn test_create_workspace_template_with_options() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        let req = CreateWorkspaceTemplateRequest {
            repo_id: repo.id,
            name: "custom".to_string(),
            description: None,
            setup_script: None,
            run_script: None,
            archive_script: Some("cleanup.sh".to_string()),
            run_script_mode: Some("concurrent".to_string()),
            env_vars: Some(HashMap::from([("KEY".to_string(), "VAL".to_string())])),
            sparse_dirs: Some(vec!["src".to_string()]),
            auto_commit: Some(false),
        };
        let template = create_workspace_template_inner(&db, req).unwrap();

        assert_eq!(template.run_script_mode, "concurrent");
        assert!(!template.auto_commit);
        assert_eq!(template.env_vars.get("KEY").unwrap(), "VAL");
        assert_eq!(template.sparse_dirs.as_ref().unwrap(), &vec!["src".to_string()]);
        assert_eq!(template.archive_script.as_deref(), Some("cleanup.sh"));
    }

    #[test]
    fn test_list_workspace_templates_inner_empty() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        let templates = list_workspace_templates_inner(&db, &repo.id.to_string()).unwrap();
        assert!(templates.is_empty());
    }

    #[test]
    fn test_list_workspace_templates_inner() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        create_workspace_template_inner(&db, make_create_request(repo.id)).unwrap();
        create_workspace_template_inner(
            &db,
            CreateWorkspaceTemplateRequest {
                repo_id: repo.id,
                name: "second".to_string(),
                description: None,
                setup_script: None,
                run_script: None,
                archive_script: None,
                run_script_mode: None,
                env_vars: None,
                sparse_dirs: None,
                auto_commit: None,
            },
        )
        .unwrap();

        let templates = list_workspace_templates_inner(&db, &repo.id.to_string()).unwrap();
        assert_eq!(templates.len(), 2);
    }

    #[test]
    fn test_list_workspace_templates_inner_invalid_uuid() {
        let db = test_db();
        let result = list_workspace_templates_inner(&db, "bad-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_update_workspace_template_inner() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        let template = create_workspace_template_inner(&db, make_create_request(repo.id)).unwrap();

        let updated = update_workspace_template_inner(
            &db,
            &template.id.to_string(),
            UpdateWorkspaceTemplateRequest {
                name: Some("renamed".to_string()),
                description: Some("new desc".to_string()),
                setup_script: None,
                run_script: None,
                archive_script: None,
                run_script_mode: None,
                env_vars: None,
                sparse_dirs: None,
                auto_commit: Some(false),
            },
        )
        .unwrap();

        assert_eq!(updated.name, "renamed");
        assert_eq!(updated.description.as_deref(), Some("new desc"));
        assert!(!updated.auto_commit);
        // Unchanged fields preserved
        assert_eq!(updated.setup_script.as_deref(), Some("npm install"));
    }

    #[test]
    fn test_update_workspace_template_inner_not_found() {
        let db = test_db();
        let fake_id = Uuid::new_v4();
        let result = update_workspace_template_inner(
            &db,
            &fake_id.to_string(),
            UpdateWorkspaceTemplateRequest {
                name: Some("x".to_string()),
                description: None,
                setup_script: None,
                run_script: None,
                archive_script: None,
                run_script_mode: None,
                env_vars: None,
                sparse_dirs: None,
                auto_commit: None,
            },
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_update_workspace_template_inner_invalid_uuid() {
        let db = test_db();
        let result = update_workspace_template_inner(
            &db,
            "not-uuid",
            UpdateWorkspaceTemplateRequest {
                name: None,
                description: None,
                setup_script: None,
                run_script: None,
                archive_script: None,
                run_script_mode: None,
                env_vars: None,
                sparse_dirs: None,
                auto_commit: None,
            },
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_workspace_template_inner() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        let template = create_workspace_template_inner(&db, make_create_request(repo.id)).unwrap();
        delete_workspace_template_inner(&db, &template.id.to_string()).unwrap();

        let templates = list_workspace_templates_inner(&db, &repo.id.to_string()).unwrap();
        assert!(templates.is_empty());
    }

    #[test]
    fn test_delete_workspace_template_inner_invalid_uuid() {
        let db = test_db();
        let result = delete_workspace_template_inner(&db, "nope");
        assert!(result.is_err());
    }

    #[test]
    fn test_full_crud_lifecycle() {
        let db = test_db();
        let (repo, _ws) = insert_test_repo_and_workspace(&db);

        // Create
        let template = create_workspace_template_inner(&db, make_create_request(repo.id)).unwrap();
        assert_eq!(template.name, "my-template");

        // Read
        let list = list_workspace_templates_inner(&db, &repo.id.to_string()).unwrap();
        assert_eq!(list.len(), 1);

        // Update
        let updated = update_workspace_template_inner(
            &db,
            &template.id.to_string(),
            UpdateWorkspaceTemplateRequest {
                name: Some("updated-name".to_string()),
                description: None,
                setup_script: None,
                run_script: None,
                archive_script: None,
                run_script_mode: None,
                env_vars: None,
                sparse_dirs: None,
                auto_commit: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "updated-name");

        // Delete
        delete_workspace_template_inner(&db, &template.id.to_string()).unwrap();
        let list = list_workspace_templates_inner(&db, &repo.id.to_string()).unwrap();
        assert!(list.is_empty());
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    fn setup_app_with_repo() -> (tauri::App<tauri::test::MockRuntime>, Uuid) {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let repo_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (repo, _ws) = insert_test_repo_and_workspace(db);
            repo.id
        };
        (app, repo_id)
    }

    #[tokio::test]
    async fn test_create_workspace_template_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();
        let request = make_create_request(repo_id);
        let result = create_workspace_template(state, request).await;
        assert!(result.is_ok());
        let template = result.unwrap();
        assert_eq!(template.name, "my-template");
        assert_eq!(template.repo_id, repo_id);
    }

    #[tokio::test]
    async fn test_list_workspace_templates_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();

        let list = list_workspace_templates(state.clone(), repo_id.to_string())
            .await
            .unwrap();
        assert!(list.is_empty());

        create_workspace_template(state.clone(), make_create_request(repo_id))
            .await
            .unwrap();

        let list = list_workspace_templates(state, repo_id.to_string())
            .await
            .unwrap();
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_update_workspace_template_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();
        let created = create_workspace_template(state.clone(), make_create_request(repo_id))
            .await
            .unwrap();

        let updated = update_workspace_template(
            state,
            created.id.to_string(),
            UpdateWorkspaceTemplateRequest {
                name: Some("renamed".into()),
                description: None,
                setup_script: None,
                run_script: None,
                archive_script: None,
                run_script_mode: None,
                env_vars: None,
                sparse_dirs: None,
                auto_commit: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.name, "renamed");
        assert_eq!(updated.setup_script.as_deref(), Some("npm install"));
    }

    #[tokio::test]
    async fn test_delete_workspace_template_command() {
        let (app, repo_id) = setup_app_with_repo();
        let state = app.state::<AppState>();
        let created = create_workspace_template(state.clone(), make_create_request(repo_id))
            .await
            .unwrap();

        let result = delete_workspace_template(state.clone(), created.id.to_string()).await;
        assert!(result.is_ok());

        let list = list_workspace_templates(state, repo_id.to_string())
            .await
            .unwrap();
        assert!(list.is_empty());
    }
}
