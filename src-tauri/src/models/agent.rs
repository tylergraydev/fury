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
    pub pid: Option<u32>,
}

impl AgentInfo {
    pub fn new(workspace_id: Uuid) -> Self {
        Self {
            workspace_id,
            session_id: None,
            status: AgentStatus::Idle,
            started_at: None,
            pid: None,
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
    /// Optional model override (e.g. "sonnet", "opus", "haiku", or a full model ID).
    pub model: Option<String>,
    /// When true, disable extended thinking for this message.
    pub disable_thinking: Option<bool>,
    /// When true, disable plan mode for this message.
    pub disable_plan_mode: Option<bool>,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_api_ms: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        total_cost_usd: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        num_turns: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        input_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_read_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_creation_tokens: Option<u64>,
    },
    PermissionRequest {
        tool_name: String,
        input: serde_json::Value,
    },
}

/// Agent status change event emitted to frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusEvent {
    pub workspace_id: Uuid,
    pub status: AgentStatus,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_status_default_is_idle() {
        assert_eq!(AgentStatus::default(), AgentStatus::Idle);
    }

    #[test]
    fn test_agent_info_new() {
        let ws_id = Uuid::new_v4();
        let info = AgentInfo::new(ws_id);
        assert_eq!(info.workspace_id, ws_id);
        assert_eq!(info.status, AgentStatus::Idle);
        assert!(info.session_id.is_none());
        assert!(info.started_at.is_none());
        assert!(info.pid.is_none());
    }

    #[test]
    fn test_agent_status_serde_roundtrip() {
        let statuses = vec![
            AgentStatus::Idle,
            AgentStatus::Running,
            AgentStatus::Stopping,
            AgentStatus::Error("test error".to_string()),
        ];
        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            let deserialized: AgentStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized, status);
        }
    }

    #[test]
    fn test_frontend_stream_event_system_serde() {
        let event = FrontendStreamEvent::System {
            session_id: Some("sess-123".to_string()),
            message: Some("hello".to_string()),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"system\""));
        let _: FrontendStreamEvent = serde_json::from_str(&json).unwrap();
    }

    #[test]
    fn test_frontend_stream_event_assistant_text_serde() {
        let event = FrontendStreamEvent::AssistantText {
            text: "Hello world".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"assistantText\""));
        let _: FrontendStreamEvent = serde_json::from_str(&json).unwrap();
    }
}
