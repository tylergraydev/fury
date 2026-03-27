use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use uuid::Uuid;

use crate::models::agent::{AgentInfo, FrontendStreamEvent};
#[allow(unused_imports)]
use crate::services::perf_server::{SharedPerfMetrics, StreamEventMetric};
#[allow(unused_imports)]
use crate::services::utils::{safe_truncate, safe_truncate_end};

/// Try to capture session_id from a stream event and save it to agent info.
/// Returns true if a session_id was found and stored.
pub(crate) fn try_capture_session_id(
    event: &FrontendStreamEvent,
    agents: &Mutex<HashMap<Uuid, AgentInfo>>,
    workspace_id: Uuid,
) -> bool {
    let sid = match event {
        FrontendStreamEvent::System { session_id, .. } => session_id.clone(),
        FrontendStreamEvent::Result { session_id, .. } => session_id.clone(),
        _ => None,
    };
    if let Some(sid) = sid {
        let mut lock = agents.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(agent) = lock.get_mut(&workspace_id) {
            agent.session_id = Some(sid);
        }
        true
    } else {
        false
    }
}

/// Log a stream event to the perf metrics ring buffer (if monitoring is enabled).
#[allow(dead_code)]
pub(crate) fn log_stream_event(
    perf_metrics: &SharedPerfMetrics,
    workspace_id: Uuid,
    event_type: &str,
    details: Option<String>,
) {
    let mut lock = perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    if !lock.enabled {
        return;
    }
    lock.push_stream_event(StreamEventMetric {
        workspace_id: workspace_id.to_string(),
        event_type: event_type.to_string(),
        details,
        source: "backend".to_string(),
        timestamp: chrono::Utc::now().timestamp_millis() as f64,
    });
}

/// Return a detail string for the frontend stream event type.
/// For result events, includes error status and truncated result text.
#[allow(dead_code)]
pub(crate) fn stream_event_detail(event: &FrontendStreamEvent) -> String {
    match event {
        FrontendStreamEvent::System { .. } => "system".to_string(),
        FrontendStreamEvent::AssistantText { .. } => "assistantText".to_string(),
        FrontendStreamEvent::ToolUse { name, .. } => format!("toolUse:{}", name),
        FrontendStreamEvent::ToolResult { .. } => "toolResult".to_string(),
        FrontendStreamEvent::Result {
            is_error, result, ..
        } => {
            if *is_error {
                let msg = result.as_deref().unwrap_or("(no message)");
                let truncated = safe_truncate(msg, 150);
                format!("result:ERROR — {}", truncated)
            } else {
                "result:ok".to_string()
            }
        }
        FrontendStreamEvent::PermissionRequest { tool_name, .. } => {
            format!("permissionRequest:{}", tool_name)
        }
        FrontendStreamEvent::AssistantImage { media_type, .. } => {
            format!("assistantImage:{}", media_type)
        }
    }
}

/// Check if a JSON line has a known event type that we intentionally don't convert
/// to a frontend event (e.g. echoed user messages, rate limit info, metadata-only
/// assistant messages). These should not be logged as parse failures.
#[allow(dead_code)]
pub(crate) fn is_known_skippable_line(line: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|raw| raw.get("type").and_then(|v| v.as_str()).map(String::from))
        .map(|t| {
            matches!(
                t.as_str(),
                "user" | "rate_limit_event" | "assistant" | "stream_event"
            )
        })
        .unwrap_or(false)
}

/// If a result event has `is_error: true` but no `result` message,
/// pull recent stderr lines into the result so the error reason reaches the frontend.
#[allow(dead_code)]
pub(crate) fn enrich_error_from_stderr(
    event: &mut FrontendStreamEvent,
    stderr_buffer: &std::sync::Arc<Mutex<VecDeque<String>>>,
) {
    if let FrontendStreamEvent::Result {
        is_error: true,
        ref mut result,
        ..
    } = event
    {
        if result.is_none() {
            let buf = stderr_buffer.lock().unwrap_or_else(|e| e.into_inner());
            if !buf.is_empty() {
                let joined: String = buf.iter().cloned().collect::<Vec<_>>().join("\n");
                let truncated = safe_truncate_end(&joined, 497);
                *result = Some(truncated);
            }
        }
    }
}

/// Parse a single NDJSON line from Claude Code's stream output
/// into frontend-friendly events. Returns a Vec because a single
/// assistant message can contain multiple content blocks (text, tool_use, image, etc.).
pub fn parse_stream_line(line: &str) -> Vec<FrontendStreamEvent> {
    let raw: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let event_type = match raw.get("type").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return vec![],
    };

    match event_type {
        "system" => {
            let session_id = raw
                .get("session_id")
                .and_then(|v| v.as_str())
                .map(String::from);
            let message = raw
                .get("message")
                .and_then(|v| v.as_str())
                .map(String::from);
            vec![FrontendStreamEvent::System {
                session_id,
                message,
            }]
        }
        "assistant" => {
            // Extract content blocks from the message
            let content = match raw
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
            {
                Some(c) => c,
                None => return vec![],
            };

            // Process each content block — emit all of them
            let mut events = Vec::new();
            for block in content {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            events.push(FrontendStreamEvent::AssistantText {
                                text: text.to_string(),
                            });
                        }
                    }
                    "tool_use" => {
                        let id = block
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let name = block
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let input = block
                            .get("input")
                            .cloned()
                            .unwrap_or(serde_json::Value::Null);
                        events.push(FrontendStreamEvent::ToolUse { id, name, input });
                    }
                    "tool_result" => {
                        let tool_use_id = block
                            .get("tool_use_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let content = block
                            .get("content")
                            .map(|v| {
                                if let Some(s) = v.as_str() {
                                    s.to_string()
                                } else {
                                    v.to_string()
                                }
                            })
                            .unwrap_or_default();
                        events.push(FrontendStreamEvent::ToolResult {
                            tool_use_id,
                            content,
                        });
                    }
                    "image" => {
                        // Claude API image blocks: { type: "image", source: { type: "base64", media_type: "...", data: "..." } }
                        if let Some(source) = block.get("source") {
                            let media_type = source
                                .get("media_type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("image/png")
                                .to_string();
                            if let Some(data) = source.get("data").and_then(|v| v.as_str()) {
                                events.push(FrontendStreamEvent::AssistantImage {
                                    media_type,
                                    data: data.to_string(),
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }

            events
        }
        "result" => {
            let is_error = raw
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                || raw.get("subtype").and_then(|v| v.as_str()) == Some("error");
            // Try to extract result as string; fall back to stringified non-null value
            let result = raw.get("result").and_then(|v| {
                if let Some(s) = v.as_str() {
                    return Some(s.to_string());
                }
                if !v.is_null() {
                    return Some(v.to_string());
                }
                None
            });
            // For errors, also check fallback fields if result is still missing
            let result = result.or_else(|| {
                if !is_error {
                    return None;
                }
                raw.get("error")
                    .and_then(|v| {
                        v.as_str().map(String::from).or_else(|| {
                            if !v.is_null() {
                                Some(v.to_string())
                            } else {
                                None
                            }
                        })
                    })
                    .or_else(|| {
                        raw.get("error_message")
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
            });
            let session_id = raw
                .get("session_id")
                .and_then(|v| v.as_str())
                .map(String::from);
            let duration_ms = raw.get("duration_ms").and_then(|v| v.as_u64());
            let duration_api_ms = raw.get("duration_api_ms").and_then(|v| v.as_u64());
            let total_cost_usd = raw.get("total_cost_usd").and_then(|v| v.as_f64());
            let num_turns = raw
                .get("num_turns")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let usage = raw.get("usage");
            let input_tokens = usage
                .and_then(|u| u.get("input_tokens"))
                .and_then(|v| v.as_u64());
            let output_tokens = usage
                .and_then(|u| u.get("output_tokens"))
                .and_then(|v| v.as_u64());
            let cache_read_tokens = usage
                .and_then(|u| u.get("cache_read_input_tokens"))
                .and_then(|v| v.as_u64());
            let cache_creation_tokens = usage
                .and_then(|u| u.get("cache_creation_input_tokens"))
                .and_then(|v| v.as_u64());
            vec![FrontendStreamEvent::Result {
                is_error,
                result,
                session_id,
                duration_ms,
                duration_api_ms,
                total_cost_usd,
                num_turns,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_creation_tokens,
            }]
        }
        // SDK stream events: partial deltas for real-time text streaming
        "stream_event" => {
            let event = match raw.get("event") {
                Some(e) => e,
                None => return vec![],
            };
            let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match event_type {
                "content_block_delta" => {
                    let delta = match event.get("delta") {
                        Some(d) => d,
                        None => return vec![],
                    };
                    let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    match delta_type {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                                vec![FrontendStreamEvent::AssistantText {
                                    text: text.to_string(),
                                }]
                            } else {
                                vec![]
                            }
                        }
                        _ => vec![],
                    }
                }
                _ => vec![],
            }
        }
        // Permission request: emitted when sidecar needs user approval for a tool call
        "input_request" => {
            // Extract tool info from the permission request
            let tool_name = raw
                .get("tool")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .or_else(|| raw.get("tool_name").and_then(|v| v.as_str()))
                .unwrap_or("unknown")
                .to_string();
            let input = raw
                .get("tool")
                .and_then(|v| v.get("input"))
                .or_else(|| raw.get("input"))
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            let suggestions = raw.get("suggestions").cloned();
            vec![FrontendStreamEvent::PermissionRequest {
                tool_name,
                input,
                suggestions,
            }]
        }
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    // --- parse_stream_line tests ---

    #[test]
    fn test_parse_system_event() {
        let line = r#"{"type":"system","session_id":"sess-123","message":"Connected"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::System {
                session_id,
                message,
            } => {
                assert_eq!(session_id.as_deref(), Some("sess-123"));
                assert_eq!(message.as_deref(), Some("Connected"));
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn test_parse_assistant_text_event() {
        let line =
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::AssistantText { text } => {
                assert_eq!(text, "Hello world");
            }
            _ => panic!("Expected AssistantText event"),
        }
    }

    #[test]
    fn test_parse_tool_use_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tool-1","name":"read_file","input":{"path":"/tmp"}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::ToolUse { id, name, input } => {
                assert_eq!(id, "tool-1");
                assert_eq!(name, "read_file");
                assert_eq!(input["path"], "/tmp");
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn test_parse_tool_result_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"tool-1","content":"file contents"}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::ToolResult {
                tool_use_id,
                content,
            } => {
                assert_eq!(tool_use_id, "tool-1");
                assert_eq!(content, "file contents");
            }
            _ => panic!("Expected ToolResult event"),
        }
    }

    #[test]
    fn test_parse_assistant_image_event() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBOR..."}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::AssistantImage { media_type, data } => {
                assert_eq!(media_type, "image/png");
                assert_eq!(data, "iVBOR...");
            }
            _ => panic!("Expected AssistantImage event"),
        }
    }

    #[test]
    fn test_parse_multi_block_assistant_message() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Here is a screenshot:"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"abc123"}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 2);
        assert!(matches!(
            &events[0],
            FrontendStreamEvent::AssistantText { .. }
        ));
        assert!(matches!(
            &events[1],
            FrontendStreamEvent::AssistantImage { .. }
        ));
    }

    #[test]
    fn test_parse_result_event() {
        let line = r#"{"type":"result","is_error":false,"result":"Done","session_id":"sess-1","duration_ms":1000,"total_cost_usd":0.05,"num_turns":3,"usage":{"input_tokens":100,"output_tokens":200}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result {
                is_error,
                result,
                session_id,
                duration_ms,
                total_cost_usd,
                num_turns,
                input_tokens,
                output_tokens,
                ..
            } => {
                assert!(!is_error);
                assert_eq!(result.as_deref(), Some("Done"));
                assert_eq!(session_id.as_deref(), Some("sess-1"));
                assert_eq!(*duration_ms, Some(1000));
                assert_eq!(*total_cost_usd, Some(0.05));
                assert_eq!(*num_turns, Some(3));
                assert_eq!(*input_tokens, Some(100));
                assert_eq!(*output_tokens, Some(200));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_result_error_via_subtype() {
        let line = r#"{"type":"result","subtype":"error","result":"Something went wrong"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result { is_error, .. } => assert!(is_error),
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn test_parse_permission_request() {
        let line = r#"{"type":"input_request","tool":{"name":"bash","input":{"command":"ls"}}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::PermissionRequest {
                tool_name, input, ..
            } => {
                assert_eq!(tool_name, "bash");
                assert_eq!(input["command"], "ls");
            }
            _ => panic!("Expected PermissionRequest event"),
        }
    }

    #[test]
    fn test_parse_invalid_json_returns_empty() {
        assert!(parse_stream_line("not json").is_empty());
    }

    #[test]
    fn test_parse_unknown_type_returns_empty() {
        let line = r#"{"type":"unknown_event","data":"something"}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    // --- is_known_skippable_line tests ---

    #[test]
    fn test_skippable_user_event() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}"#;
        assert!(is_known_skippable_line(line));
    }

    #[test]
    fn test_skippable_rate_limit_event() {
        let line = r#"{"type":"rate_limit_event","retry_after":1.5}"#;
        assert!(is_known_skippable_line(line));
    }

    #[test]
    fn test_skippable_assistant_metadata() {
        // Assistant message without extractable content blocks (metadata-only)
        let line = r#"{"type":"assistant","message":{"model":"claude-sonnet-4-20250514","stop_reason":"end_turn"}}"#;
        assert!(parse_stream_line(line).is_empty()); // not a frontend event
        assert!(is_known_skippable_line(line)); // but known-skippable
    }

    #[test]
    fn test_not_skippable_invalid_json() {
        assert!(!is_known_skippable_line("not json"));
    }

    #[test]
    fn test_not_skippable_unknown_type() {
        let line = r#"{"type":"totally_unknown","data":"x"}"#;
        assert!(!is_known_skippable_line(line));
    }

    // --- stream_event_detail tests ---

    #[test]
    fn test_stream_event_detail_system() {
        let event = FrontendStreamEvent::System {
            session_id: None,
            message: None,
        };
        assert_eq!(stream_event_detail(&event), "system");
    }

    #[test]
    fn test_stream_event_detail_assistant_text() {
        let event = FrontendStreamEvent::AssistantText {
            text: "hi".to_string(),
        };
        assert_eq!(stream_event_detail(&event), "assistantText");
    }

    #[test]
    fn test_stream_event_detail_tool_use() {
        let event = FrontendStreamEvent::ToolUse {
            id: "1".to_string(),
            name: "bash".to_string(),
            input: serde_json::Value::Null,
        };
        assert_eq!(stream_event_detail(&event), "toolUse:bash");
    }

    #[test]
    fn test_stream_event_detail_tool_result() {
        let event = FrontendStreamEvent::ToolResult {
            tool_use_id: "1".to_string(),
            content: "ok".to_string(),
        };
        assert_eq!(stream_event_detail(&event), "toolResult");
    }

    #[test]
    fn test_stream_event_detail_result_ok() {
        let event = FrontendStreamEvent::Result {
            is_error: false,
            result: Some("done".to_string()),
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        assert_eq!(stream_event_detail(&event), "result:ok");
    }

    #[test]
    fn test_stream_event_detail_result_error_with_message() {
        let event = FrontendStreamEvent::Result {
            is_error: true,
            result: Some("rate limit".to_string()),
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        let detail = stream_event_detail(&event);
        assert!(detail.starts_with("result:ERROR"));
        assert!(detail.contains("rate limit"));
    }

    #[test]
    fn test_stream_event_detail_result_error_no_message() {
        let event = FrontendStreamEvent::Result {
            is_error: true,
            result: None,
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        let detail = stream_event_detail(&event);
        assert!(detail.contains("(no message)"));
    }

    #[test]
    fn test_stream_event_detail_result_error_long_message_truncated() {
        let long_msg = "x".repeat(300);
        let event = FrontendStreamEvent::Result {
            is_error: true,
            result: Some(long_msg),
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        let detail = stream_event_detail(&event);
        assert!(detail.ends_with("..."));
        assert!(detail.len() < 300);
    }

    #[test]
    fn test_stream_event_detail_permission_request() {
        let event = FrontendStreamEvent::PermissionRequest {
            tool_name: "write_file".to_string(),
            input: serde_json::Value::Null,
            suggestions: None,
        };
        assert_eq!(stream_event_detail(&event), "permissionRequest:write_file");
    }

    #[test]
    fn test_stream_event_detail_assistant_image() {
        let event = FrontendStreamEvent::AssistantImage {
            media_type: "image/jpeg".to_string(),
            data: "abc".to_string(),
        };
        assert_eq!(stream_event_detail(&event), "assistantImage:image/jpeg");
    }

    // --- enrich_error_from_stderr tests ---

    #[test]
    fn test_enrich_error_from_stderr_fills_empty_result() {
        let stderr_buf: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::from([
            "line1".to_string(),
            "line2".to_string(),
        ])));
        let mut event = FrontendStreamEvent::Result {
            is_error: true,
            result: None,
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        enrich_error_from_stderr(&mut event, &stderr_buf);
        match &event {
            FrontendStreamEvent::Result { result, .. } => {
                assert_eq!(result.as_deref(), Some("line1\nline2"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_enrich_error_from_stderr_does_not_overwrite_existing() {
        let stderr_buf: Arc<Mutex<VecDeque<String>>> =
            Arc::new(Mutex::new(VecDeque::from(["stderr noise".to_string()])));
        let mut event = FrontendStreamEvent::Result {
            is_error: true,
            result: Some("original error".to_string()),
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        enrich_error_from_stderr(&mut event, &stderr_buf);
        match &event {
            FrontendStreamEvent::Result { result, .. } => {
                assert_eq!(result.as_deref(), Some("original error"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_enrich_error_from_stderr_noop_for_success() {
        let stderr_buf: Arc<Mutex<VecDeque<String>>> =
            Arc::new(Mutex::new(VecDeque::from(["stderr noise".to_string()])));
        let mut event = FrontendStreamEvent::Result {
            is_error: false,
            result: None,
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        enrich_error_from_stderr(&mut event, &stderr_buf);
        match &event {
            FrontendStreamEvent::Result { result, .. } => {
                assert!(result.is_none());
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_enrich_error_from_stderr_noop_for_empty_buffer() {
        let stderr_buf: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
        let mut event = FrontendStreamEvent::Result {
            is_error: true,
            result: None,
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        enrich_error_from_stderr(&mut event, &stderr_buf);
        match &event {
            FrontendStreamEvent::Result { result, .. } => {
                assert!(result.is_none());
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_enrich_error_from_stderr_truncates_long_buffer() {
        let long_line = "x".repeat(600);
        let stderr_buf: Arc<Mutex<VecDeque<String>>> =
            Arc::new(Mutex::new(VecDeque::from([long_line])));
        let mut event = FrontendStreamEvent::Result {
            is_error: true,
            result: None,
            session_id: None,
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        enrich_error_from_stderr(&mut event, &stderr_buf);
        match &event {
            FrontendStreamEvent::Result { result, .. } => {
                let msg = result.as_ref().unwrap();
                assert!(msg.len() <= 500);
                assert!(msg.starts_with("..."));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_enrich_error_noop_for_non_result_event() {
        let stderr_buf: Arc<Mutex<VecDeque<String>>> =
            Arc::new(Mutex::new(VecDeque::from(["stderr".to_string()])));
        let mut event = FrontendStreamEvent::AssistantText {
            text: "hi".to_string(),
        };
        enrich_error_from_stderr(&mut event, &stderr_buf);
        // Should not panic or modify
        match &event {
            FrontendStreamEvent::AssistantText { text } => assert_eq!(text, "hi"),
            _ => panic!("Expected AssistantText"),
        }
    }

    // --- try_capture_session_id tests ---

    #[test]
    fn test_try_capture_session_id_from_system_event() {
        let agents: Mutex<HashMap<Uuid, AgentInfo>> = Mutex::new(HashMap::new());
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        let event = FrontendStreamEvent::System {
            session_id: Some("sess-abc".to_string()),
            message: None,
        };
        assert!(try_capture_session_id(&event, &agents, ws_id));
        assert_eq!(
            agents
                .lock()
                .unwrap()
                .get(&ws_id)
                .unwrap()
                .session_id
                .as_deref(),
            Some("sess-abc")
        );
    }

    #[test]
    fn test_try_capture_session_id_from_result_event() {
        let agents: Mutex<HashMap<Uuid, AgentInfo>> = Mutex::new(HashMap::new());
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        let event = FrontendStreamEvent::Result {
            is_error: false,
            result: None,
            session_id: Some("sess-result".to_string()),
            duration_ms: None,
            duration_api_ms: None,
            total_cost_usd: None,
            num_turns: None,
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_creation_tokens: None,
        };
        assert!(try_capture_session_id(&event, &agents, ws_id));
        assert_eq!(
            agents
                .lock()
                .unwrap()
                .get(&ws_id)
                .unwrap()
                .session_id
                .as_deref(),
            Some("sess-result")
        );
    }

    #[test]
    fn test_try_capture_session_id_returns_false_for_text_event() {
        let agents: Mutex<HashMap<Uuid, AgentInfo>> = Mutex::new(HashMap::new());
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        let event = FrontendStreamEvent::AssistantText {
            text: "hi".to_string(),
        };
        assert!(!try_capture_session_id(&event, &agents, ws_id));
        assert!(agents
            .lock()
            .unwrap()
            .get(&ws_id)
            .unwrap()
            .session_id
            .is_none());
    }

    #[test]
    fn test_try_capture_session_id_returns_false_when_no_session_id() {
        let agents: Mutex<HashMap<Uuid, AgentInfo>> = Mutex::new(HashMap::new());
        let ws_id = Uuid::new_v4();
        agents.lock().unwrap().insert(ws_id, AgentInfo::new(ws_id));

        let event = FrontendStreamEvent::System {
            session_id: None,
            message: Some("hi".to_string()),
        };
        assert!(!try_capture_session_id(&event, &agents, ws_id));
    }

    // --- Additional parse_stream_line edge case tests ---

    #[test]
    fn test_parse_stream_line_missing_type_field() {
        let line = r#"{"data":"something"}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    #[test]
    fn test_parse_stream_line_assistant_empty_content() {
        let line = r#"{"type":"assistant","message":{"content":[]}}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    #[test]
    fn test_parse_stream_line_assistant_no_content_key() {
        let line = r#"{"type":"assistant","message":{"role":"assistant"}}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    #[test]
    fn test_parse_stream_line_assistant_unknown_block_type() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"audio","data":"..."}]}}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    #[test]
    fn test_parse_stream_line_tool_result_with_json_content() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":{"exitCode":0}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::ToolResult {
                tool_use_id,
                content,
            } => {
                assert_eq!(tool_use_id, "t1");
                assert!(content.contains("exitCode"));
            }
            _ => panic!("Expected ToolResult"),
        }
    }

    #[test]
    fn test_parse_stream_line_result_with_error_field_fallback() {
        let line = r#"{"type":"result","is_error":true,"error":"API overloaded"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert_eq!(result.as_deref(), Some("API overloaded"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_stream_line_result_with_error_message_field_fallback() {
        let line = r#"{"type":"result","is_error":true,"error_message":"token limit"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                assert_eq!(result.as_deref(), Some("token limit"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_stream_line_result_non_string_result_value() {
        let line = r#"{"type":"result","is_error":false,"result":42}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result { result, .. } => {
                assert_eq!(result.as_deref(), Some("42"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_stream_line_result_null_result_value() {
        let line = r#"{"type":"result","is_error":false,"result":null}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result { result, .. } => {
                assert!(result.is_none());
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_stream_line_result_with_cache_tokens() {
        let line = r#"{"type":"result","is_error":false,"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":80,"cache_creation_input_tokens":20}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result {
                cache_read_tokens,
                cache_creation_tokens,
                ..
            } => {
                assert_eq!(*cache_read_tokens, Some(80));
                assert_eq!(*cache_creation_tokens, Some(20));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_stream_line_permission_request_flat_tool_name() {
        let line = r#"{"type":"input_request","tool_name":"bash","input":{"command":"ls"}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::PermissionRequest {
                tool_name, input, ..
            } => {
                assert_eq!(tool_name, "bash");
                assert_eq!(input["command"], "ls");
            }
            _ => panic!("Expected PermissionRequest"),
        }
    }

    #[test]
    fn test_parse_stream_line_permission_request_no_tool_info() {
        let line = r#"{"type":"input_request"}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::PermissionRequest { tool_name, .. } => {
                assert_eq!(tool_name, "unknown");
            }
            _ => panic!("Expected PermissionRequest"),
        }
    }

    #[test]
    fn test_parse_stream_line_image_without_source_ignored() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"image"}]}}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    #[test]
    fn test_parse_stream_line_image_source_without_data_ignored() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"image","source":{"type":"base64","media_type":"image/png"}}]}}"#;
        assert!(parse_stream_line(line).is_empty());
    }

    #[test]
    fn test_parse_stream_line_result_error_with_nested_error_object() {
        let line = r#"{"type":"result","is_error":true,"error":{"message":"nested","code":500}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            FrontendStreamEvent::Result {
                is_error, result, ..
            } => {
                assert!(is_error);
                // error is an object, not a string, so it falls through to stringified
                let r = result.as_ref().unwrap();
                assert!(r.contains("message") || r.contains("nested"));
            }
            _ => panic!("Expected Result"),
        }
    }

    #[test]
    fn test_parse_stream_line_multiple_tool_uses() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"read","input":{}},{"type":"tool_use","id":"t2","name":"write","input":{}}]}}"#;
        let events = parse_stream_line(line);
        assert_eq!(events.len(), 2);
        assert!(matches!(&events[0], FrontendStreamEvent::ToolUse { name, .. } if name == "read"));
        assert!(matches!(&events[1], FrontendStreamEvent::ToolUse { name, .. } if name == "write"));
    }

    // --- is_known_skippable_line additional tests ---

    #[test]
    fn test_skippable_result_is_not_skippable() {
        let line = r#"{"type":"result","is_error":false}"#;
        assert!(!is_known_skippable_line(line));
    }

    #[test]
    fn test_skippable_system_is_not_skippable() {
        let line = r#"{"type":"system","session_id":"s1"}"#;
        assert!(!is_known_skippable_line(line));
    }
}
