use crate::error::AppError;
use crate::models::todo::{
    CreateTodoRequest, ReorderTodosRequest, TodoItem, TodoSummary, UpdateTodoRequest,
};
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

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

        let sort_order = db.get_next_sort_order(&request.workspace_id)?;
        let todo = TodoItem {
            id: Uuid::new_v4(),
            workspace_id: request.workspace_id,
            text: request.text,
            completed: false,
            sort_order,
        };
        db.insert_todo(&todo)?;
        todo
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
        db.update_todo(&request.id, request.text.as_deref(), request.completed)?;
    }

    tokio::task::spawn_blocking(move || Ok(()))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_todo(state: State<'_, AppState>, todo_id: String) -> Result<(), AppError> {
    let id: Uuid = todo_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid todo ID".into()))?;

    {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        db.delete_todo(&id)?;
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
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let todos = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        db.list_todos(&ws_id)?
    };

    tokio::task::spawn_blocking(move || Ok(todos))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn toggle_todo(state: State<'_, AppState>, todo_id: String) -> Result<bool, AppError> {
    let id: Uuid = todo_id
        .parse()
        .map_err(|_| AppError::DbError("Invalid todo ID".into()))?;

    let result = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        db.toggle_todo(&id)?
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
        db.reorder_todos(&request.workspace_id, &request.todo_ids)?;
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
    let ws_id: Uuid = workspace_id
        .parse()
        .map_err(|_| AppError::WorkspaceNotFound(Uuid::nil()))?;

    let summary = {
        let db_lock = state.db.lock().unwrap();
        let db = db_lock
            .as_ref()
            .ok_or(AppError::DbError("DB not initialized".into()))?;
        let items = db.list_todos(&ws_id)?;
        let total = items.len();
        let completed = items.iter().filter(|t| t.completed).count();
        TodoSummary {
            total,
            completed,
            all_completed: total > 0 && completed == total,
            items,
        }
    };

    tokio::task::spawn_blocking(move || Ok(summary))
        .await
        .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}
