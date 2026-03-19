use crate::db::Database;
use crate::error::AppError;
use crate::models::todo::{
    CreateTodoRequest, ReorderTodosRequest, TodoItem, TodoSummary, UpdateTodoRequest,
};
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Inner (testable) functions
// ---------------------------------------------------------------------------

pub(crate) fn add_todo_inner(
    db: &Database,
    request: CreateTodoRequest,
) -> Result<TodoItem, AppError> {
    let sort_order = db.get_next_sort_order(&request.workspace_id)?;
    let todo = TodoItem {
        id: Uuid::new_v4(),
        workspace_id: request.workspace_id,
        text: request.text,
        completed: false,
        sort_order,
    };
    db.insert_todo(&todo)?;
    Ok(todo)
}

pub(crate) fn update_todo_inner(
    db: &Database,
    request: UpdateTodoRequest,
) -> Result<(), AppError> {
    db.update_todo(&request.id, request.text.as_deref(), request.completed)?;
    Ok(())
}

pub(crate) fn delete_todo_inner(db: &Database, todo_id: &str) -> Result<(), AppError> {
    let id: Uuid = todo_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid todo ID".into()))?;
    db.delete_todo(&id)?;
    Ok(())
}

pub(crate) fn list_todos_inner(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<TodoItem>, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    db.list_todos(&ws_id)
}

pub(crate) fn toggle_todo_inner(db: &Database, todo_id: &str) -> Result<bool, AppError> {
    let id: Uuid = todo_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid todo ID".into()))?;
    db.toggle_todo(&id)
}

pub(crate) fn reorder_todos_inner(
    db: &Database,
    request: ReorderTodosRequest,
) -> Result<(), AppError> {
    db.reorder_todos(&request.workspace_id, &request.todo_ids)?;
    Ok(())
}

pub(crate) fn get_todo_summary_inner(
    db: &Database,
    workspace_id: &str,
) -> Result<TodoSummary, AppError> {
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;
    let items = db.list_todos(&ws_id)?;
    let total = items.len();
    let completed = items.iter().filter(|t| t.completed).count();
    Ok(TodoSummary {
        total,
        completed,
        all_completed: total > 0 && completed == total,
        items,
    })
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn add_todo(
    state: State<'_, AppState>,
    request: CreateTodoRequest,
) -> Result<TodoItem, AppError> {
    let todo = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        add_todo_inner(db, request)?
    };

    tokio::task::spawn_blocking(move || Ok(todo))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn update_todo(
    state: State<'_, AppState>,
    request: UpdateTodoRequest,
) -> Result<(), AppError> {
    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        update_todo_inner(db, request)?;
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_todo(state: State<'_, AppState>, todo_id: String) -> Result<(), AppError> {
    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        delete_todo_inner(db, &todo_id)?;
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_todos(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<TodoItem>, AppError> {
    let todos = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        list_todos_inner(db, &workspace_id)?
    };

    tokio::task::spawn_blocking(move || Ok(todos))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn toggle_todo(state: State<'_, AppState>, todo_id: String) -> Result<bool, AppError> {
    let result = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        toggle_todo_inner(db, &todo_id)?
    };

    tokio::task::spawn_blocking(move || Ok(result))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn reorder_todos(
    state: State<'_, AppState>,
    request: ReorderTodosRequest,
) -> Result<(), AppError> {
    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        reorder_todos_inner(db, request)?;
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_todo_summary(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TodoSummary, AppError> {
    let summary = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        get_todo_summary_inner(db, &workspace_id)?
    };

    tokio::task::spawn_blocking(move || Ok(summary))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::todo::{CreateTodoRequest, ReorderTodosRequest, UpdateTodoRequest};
    use crate::test_helpers::*;

    #[test]
    fn test_add_todo_inner() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let req = CreateTodoRequest {
            workspace_id: ws.id,
            text: "Buy milk".to_string(),
        };
        let todo = add_todo_inner(&db, req).unwrap();
        assert_eq!(todo.text, "Buy milk");
        assert!(!todo.completed);
        assert_eq!(todo.workspace_id, ws.id);
        assert_eq!(todo.sort_order, 0);
    }

    #[test]
    fn test_add_todo_auto_increments_sort_order() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let t1 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "First".to_string(),
            },
        )
        .unwrap();
        let t2 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "Second".to_string(),
            },
        )
        .unwrap();

        assert_eq!(t1.sort_order, 0);
        assert_eq!(t2.sort_order, 1);
    }

    #[test]
    fn test_update_todo_inner_text() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let todo = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "Old text".to_string(),
            },
        )
        .unwrap();

        update_todo_inner(
            &db,
            UpdateTodoRequest {
                id: todo.id,
                workspace_id: ws.id,
                text: Some("New text".to_string()),
                completed: None,
            },
        )
        .unwrap();

        let items = list_todos_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(items[0].text, "New text");
    }

    #[test]
    fn test_update_todo_inner_completed() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let todo = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "Task".to_string(),
            },
        )
        .unwrap();

        update_todo_inner(
            &db,
            UpdateTodoRequest {
                id: todo.id,
                workspace_id: ws.id,
                text: None,
                completed: Some(true),
            },
        )
        .unwrap();

        let items = list_todos_inner(&db, &ws.id.to_string()).unwrap();
        assert!(items[0].completed);
    }

    #[test]
    fn test_delete_todo_inner() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let todo = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "Delete me".to_string(),
            },
        )
        .unwrap();

        delete_todo_inner(&db, &todo.id.to_string()).unwrap();

        let items = list_todos_inner(&db, &ws.id.to_string()).unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn test_delete_todo_inner_invalid_uuid() {
        let db = test_db();
        let result = delete_todo_inner(&db, "not-a-uuid");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_todos_inner_empty() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);
        let items = list_todos_inner(&db, &ws.id.to_string()).unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn test_list_todos_inner_invalid_uuid() {
        let db = test_db();
        let result = list_todos_inner(&db, "bad-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_toggle_todo_inner() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let todo = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "Toggle me".to_string(),
            },
        )
        .unwrap();
        assert!(!todo.completed);

        let new_state = toggle_todo_inner(&db, &todo.id.to_string()).unwrap();
        assert!(new_state);

        let new_state2 = toggle_todo_inner(&db, &todo.id.to_string()).unwrap();
        assert!(!new_state2);
    }

    #[test]
    fn test_toggle_todo_inner_invalid_uuid() {
        let db = test_db();
        let result = toggle_todo_inner(&db, "nope");
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder_todos_inner() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let t1 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "First".to_string(),
            },
        )
        .unwrap();
        let t2 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "Second".to_string(),
            },
        )
        .unwrap();

        // Reverse the order
        reorder_todos_inner(
            &db,
            ReorderTodosRequest {
                workspace_id: ws.id,
                todo_ids: vec![t2.id, t1.id],
            },
        )
        .unwrap();

        let items = list_todos_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(items[0].id, t2.id);
        assert_eq!(items[1].id, t1.id);
    }

    #[test]
    fn test_get_todo_summary_inner_empty() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let summary = get_todo_summary_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(summary.total, 0);
        assert_eq!(summary.completed, 0);
        assert!(!summary.all_completed);
        assert!(summary.items.is_empty());
    }

    #[test]
    fn test_get_todo_summary_inner_partial() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let t1 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "A".to_string(),
            },
        )
        .unwrap();
        add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "B".to_string(),
            },
        )
        .unwrap();

        // Complete only one
        toggle_todo_inner(&db, &t1.id.to_string()).unwrap();

        let summary = get_todo_summary_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.completed, 1);
        assert!(!summary.all_completed);
    }

    #[test]
    fn test_get_todo_summary_inner_all_completed() {
        let db = test_db();
        let (_repo, ws) = insert_test_repo_and_workspace(&db);

        let t1 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "A".to_string(),
            },
        )
        .unwrap();
        let t2 = add_todo_inner(
            &db,
            CreateTodoRequest {
                workspace_id: ws.id,
                text: "B".to_string(),
            },
        )
        .unwrap();

        toggle_todo_inner(&db, &t1.id.to_string()).unwrap();
        toggle_todo_inner(&db, &t2.id.to_string()).unwrap();

        let summary = get_todo_summary_inner(&db, &ws.id.to_string()).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(summary.completed, 2);
        assert!(summary.all_completed);
    }

    #[test]
    fn test_get_todo_summary_inner_invalid_uuid() {
        let db = test_db();
        let result = get_todo_summary_inner(&db, "garbage");
        assert!(result.is_err());
    }

    // ── Command wrapper tests ──

    use tauri::Manager;

    fn setup_app_with_workspace() -> (tauri::App<tauri::test::MockRuntime>, Uuid) {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        let ws_id = {
            let db_lock = state.db.lock().unwrap();
            let db = db_lock.as_ref().unwrap();
            let (_repo, ws) = insert_test_repo_and_workspace(db);
            ws.id
        };
        (app, ws_id)
    }

    #[tokio::test]
    async fn test_add_todo_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();
        let request = CreateTodoRequest {
            workspace_id: ws_id,
            text: "Buy milk".into(),
        };
        let result = add_todo(state, request).await;
        assert!(result.is_ok());
        let todo = result.unwrap();
        assert_eq!(todo.text, "Buy milk");
        assert!(!todo.completed);
    }

    #[tokio::test]
    async fn test_list_todos_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();

        let list = list_todos(state.clone(), ws_id.to_string()).await.unwrap();
        assert!(list.is_empty());

        add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "Task 1".into(),
            },
        )
        .await
        .unwrap();

        let list = list_todos(state, ws_id.to_string()).await.unwrap();
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_update_todo_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();
        let todo = add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "Old text".into(),
            },
        )
        .await
        .unwrap();

        let result = update_todo(
            state.clone(),
            UpdateTodoRequest {
                id: todo.id,
                workspace_id: ws_id,
                text: Some("New text".into()),
                completed: None,
            },
        )
        .await;
        assert!(result.is_ok());

        let items = list_todos(state, ws_id.to_string()).await.unwrap();
        assert_eq!(items[0].text, "New text");
    }

    #[tokio::test]
    async fn test_delete_todo_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();
        let todo = add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "Delete me".into(),
            },
        )
        .await
        .unwrap();

        let result = delete_todo(state.clone(), todo.id.to_string()).await;
        assert!(result.is_ok());

        let items = list_todos(state, ws_id.to_string()).await.unwrap();
        assert!(items.is_empty());
    }

    #[tokio::test]
    async fn test_toggle_todo_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();
        let todo = add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "Toggle me".into(),
            },
        )
        .await
        .unwrap();

        let new_state = toggle_todo(state.clone(), todo.id.to_string()).await.unwrap();
        assert!(new_state);

        let new_state2 = toggle_todo(state, todo.id.to_string()).await.unwrap();
        assert!(!new_state2);
    }

    #[tokio::test]
    async fn test_reorder_todos_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();
        let t1 = add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "First".into(),
            },
        )
        .await
        .unwrap();
        let t2 = add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "Second".into(),
            },
        )
        .await
        .unwrap();

        let result = reorder_todos(
            state.clone(),
            ReorderTodosRequest {
                workspace_id: ws_id,
                todo_ids: vec![t2.id, t1.id],
            },
        )
        .await;
        assert!(result.is_ok());

        let items = list_todos(state, ws_id.to_string()).await.unwrap();
        assert_eq!(items[0].id, t2.id);
        assert_eq!(items[1].id, t1.id);
    }

    #[tokio::test]
    async fn test_get_todo_summary_command() {
        let (app, ws_id) = setup_app_with_workspace();
        let state = app.state::<AppState>();

        let summary = get_todo_summary(state.clone(), ws_id.to_string()).await.unwrap();
        assert_eq!(summary.total, 0);
        assert!(!summary.all_completed);

        let todo = add_todo(
            state.clone(),
            CreateTodoRequest {
                workspace_id: ws_id,
                text: "A".into(),
            },
        )
        .await
        .unwrap();
        toggle_todo(state.clone(), todo.id.to_string()).await.unwrap();

        let summary = get_todo_summary(state, ws_id.to_string()).await.unwrap();
        assert_eq!(summary.total, 1);
        assert_eq!(summary.completed, 1);
        assert!(summary.all_completed);
    }
}
