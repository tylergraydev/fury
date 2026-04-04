use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub text: String,
    pub completed: bool,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoRequest {
    pub workspace_id: Uuid,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoRequest {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub text: Option<String>,
    pub completed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReorderTodosRequest {
    pub workspace_id: Uuid,
    pub todo_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TodoSummary {
    pub total: usize,
    pub completed: usize,
    pub all_completed: bool,
    pub items: Vec<TodoItem>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_todo_item_serde_roundtrip() {
        let todo = TodoItem {
            id: Uuid::new_v4(),
            workspace_id: Uuid::new_v4(),
            text: "Write tests".to_string(),
            completed: false,
            sort_order: 0,
        };
        let json = serde_json::to_string(&todo).unwrap();
        let deserialized: TodoItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.text, "Write tests");
        assert!(!deserialized.completed);
    }

    #[test]
    fn test_todo_summary_construction() {
        let summary = TodoSummary {
            total: 3,
            completed: 2,
            all_completed: false,
            items: Vec::new(),
        };
        assert_eq!(summary.total, 3);
        assert_eq!(summary.completed, 2);
        assert!(!summary.all_completed);
    }
}
