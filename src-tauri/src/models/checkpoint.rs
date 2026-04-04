use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub session_id: String,
    pub turn_index: u32,
    pub ref_name: String,
    pub tree_sha: String,
    pub commit_sha: String,
    pub created_at: String,
    pub user_message: String,
}
