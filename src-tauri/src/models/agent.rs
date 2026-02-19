use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Idle,
    Running,
    Stopping,
    Error(String),
}

impl Default for AgentStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub workspace_id: Uuid,
    pub session_id: Option<String>,
    pub status: AgentStatus,
    pub started_at: Option<DateTime<Utc>>,
}

impl AgentInfo {
    pub fn new(workspace_id: Uuid) -> Self {
        Self {
            workspace_id,
            session_id: None,
            status: AgentStatus::Idle,
            started_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    /// Either workspace_id or repo_id must be provided.
    pub workspace_id: Option<Uuid>,
    pub repo_id: Option<Uuid>,
    pub message: String,
}

/// A parsed event from Claude Code's NDJSON stream output.
/// Claude Code outputs one JSON object per line with a `type` field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    #[serde(rename = "system")]
    System {
        subtype: Option<String>,
        session_id: Option<String>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: AssistantMessageEvent,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "result")]
    Result {
        subtype: Option<String>,
        result: Option<String>,
        #[serde(default)]
        is_error: bool,
        session_id: Option<String>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantMessageEvent {
    pub role: Option<String>,
    #[serde(default)]
    pub content: Vec<ContentBlockEvent>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlockEvent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: serde_json::Value,
    },
}

/// Lightweight event emitted to the frontend via Tauri events.
/// We re-serialize from the raw stream to a simpler shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FrontendStreamEvent {
    System {
        session_id: Option<String>,
        message: Option<String>,
    },
    AssistantText {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
    },
    Result {
        is_error: bool,
        result: Option<String>,
        session_id: Option<String>,
    },
}

/// Agent status change event emitted to frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusEvent {
    pub workspace_id: Uuid,
    pub status: AgentStatus,
}
