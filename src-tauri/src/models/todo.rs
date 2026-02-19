use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub text: String,
    pub completed: bool,
    pub sort_order: i32,
}
