use serde::{Deserialize, Serialize};

/// A single observation extracted from an agent session via hooks.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryObservation {
    pub id: String,
    pub workspace_id: String,
    pub repo_id: String,
    pub session_id: Option<String>,
    pub observation_type: String,
    pub content: String,
    pub compressed_content: Option<String>,
    pub source_tool: Option<String>,
    pub file_paths: Vec<String>,
    pub tokens_raw: Option<i64>,
    pub tokens_compressed: Option<i64>,
    pub created_at: String,
    pub accessed_at: Option<String>,
}

/// A compressed memory snapshot used for context injection (Layer 1).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub id: String,
    pub scope: String,
    pub scope_id: Option<String>,
    pub category: String,
    pub content: String,
    pub observation_ids: Vec<String>,
    pub created_at: String,
    pub supersedes: Option<String>,
}

/// Event emitted from the sidecar when an observation is extracted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryObservationEvent {
    pub observation_type: String,
    pub content: String,
    pub source_tool: Option<String>,
    pub file_paths: Vec<String>,
    pub session_id: Option<String>,
}

/// Request to save a learning via the MCP tool or Tauri command.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveLearningRequest {
    pub workspace_id: String,
    pub repo_id: String,
    pub content: String,
    pub category: String,
    pub scope: String,
}
