use crate::error::AppError;
use crate::services::perf_server::{
    AgentTurnMetric, FrameMetric, IpcMetric, PerfMetrics, StreamEventMetric,
};
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IpcMetricPayload {
    pub command: String,
    pub duration_ms: f64,
    pub success: bool,
    pub error: Option<String>,
    pub timestamp: f64,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FrameMetricPayload {
    pub duration_ms: f64,
    pub timestamp: f64,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnPayload {
    pub workspace_id: String,
    pub duration_ms: f64,
    pub duration_api_ms: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub total_cost_usd: f64,
    pub num_turns: u32,
    pub timestamp: f64,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StreamEventPayload {
    pub workspace_id: String,
    pub event_type: String,
    pub details: Option<String>,
    pub source: String,
    pub timestamp: f64,
}

/// Inner: push IPC metrics into PerfMetrics. Returns early if disabled.
pub(crate) fn push_ipc_metrics_inner(
    perf: &mut PerfMetrics,
    metrics: Vec<IpcMetricPayload>,
) -> Result<(), AppError> {
    if !perf.enabled {
        return Ok(());
    }
    for m in metrics {
        perf.push_ipc(IpcMetric {
            command: m.command,
            duration_ms: m.duration_ms,
            success: m.success,
            error: m.error,
            timestamp: m.timestamp,
        });
    }
    Ok(())
}

/// Inner: push frame metrics into PerfMetrics. Returns early if disabled.
pub(crate) fn push_frame_metrics_inner(
    perf: &mut PerfMetrics,
    metrics: Vec<FrameMetricPayload>,
) -> Result<(), AppError> {
    if !perf.enabled {
        return Ok(());
    }
    for m in metrics {
        perf.push_frame(FrameMetric {
            duration_ms: m.duration_ms,
            timestamp: m.timestamp,
        });
    }
    Ok(())
}

/// Inner: push stream events into PerfMetrics. Returns early if disabled.
pub(crate) fn push_stream_events_inner(
    perf: &mut PerfMetrics,
    events: Vec<StreamEventPayload>,
) -> Result<(), AppError> {
    if !perf.enabled {
        return Ok(());
    }
    for e in events {
        perf.push_stream_event(StreamEventMetric {
            workspace_id: e.workspace_id,
            event_type: e.event_type,
            details: e.details,
            source: e.source,
            timestamp: e.timestamp,
        });
    }
    Ok(())
}

/// Inner: push a single agent turn metric. Returns early if disabled.
pub(crate) fn push_agent_turn_metric_inner(
    perf: &mut PerfMetrics,
    metric: AgentTurnPayload,
) -> Result<(), AppError> {
    if !perf.enabled {
        return Ok(());
    }
    perf.push_agent_turn(AgentTurnMetric {
        workspace_id: metric.workspace_id,
        duration_ms: metric.duration_ms,
        duration_api_ms: metric.duration_api_ms,
        input_tokens: metric.input_tokens,
        output_tokens: metric.output_tokens,
        cache_read_tokens: metric.cache_read_tokens,
        cache_creation_tokens: metric.cache_creation_tokens,
        total_cost_usd: metric.total_cost_usd,
        num_turns: metric.num_turns,
        timestamp: metric.timestamp,
    });
    Ok(())
}

/// Inner: toggle the perf monitor enabled state. Returns the new state.
pub(crate) fn toggle_perf_monitor_inner(
    perf: &mut PerfMetrics,
    enabled: bool,
) -> Result<bool, AppError> {
    perf.enabled = enabled;
    Ok(perf.enabled)
}

/// Inner: get perf monitor enabled status.
pub(crate) fn get_perf_status_inner(perf: &PerfMetrics) -> Result<bool, AppError> {
    Ok(perf.enabled)
}

#[tauri::command]
#[specta::specta]
pub async fn push_ipc_metrics(
    state: State<'_, AppState>,
    metrics: Vec<IpcMetricPayload>,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    push_ipc_metrics_inner(&mut lock, metrics)
}

#[tauri::command]
#[specta::specta]
pub async fn push_frame_metrics(
    state: State<'_, AppState>,
    metrics: Vec<FrameMetricPayload>,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    push_frame_metrics_inner(&mut lock, metrics)
}

#[tauri::command]
#[specta::specta]
pub async fn push_stream_events(
    state: State<'_, AppState>,
    events: Vec<StreamEventPayload>,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    push_stream_events_inner(&mut lock, events)
}

#[tauri::command]
#[specta::specta]
pub async fn push_agent_turn_metric(
    state: State<'_, AppState>,
    metric: AgentTurnPayload,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    push_agent_turn_metric_inner(&mut lock, metric)
}

#[tauri::command]
#[specta::specta]
pub async fn toggle_perf_monitor(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, AppError> {
    let mut lock = state.perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    toggle_perf_monitor_inner(&mut lock, enabled)
}

#[tauri::command]
#[specta::specta]
pub async fn get_perf_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    let lock = state.perf_metrics.lock().unwrap_or_else(|e| e.into_inner());
    get_perf_status_inner(&lock)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ipc_payload(command: &str, duration: f64, success: bool) -> IpcMetricPayload {
        IpcMetricPayload {
            command: command.to_string(),
            duration_ms: duration,
            success,
            error: None,
            timestamp: 1000.0,
        }
    }

    fn make_frame_payload(duration: f64) -> FrameMetricPayload {
        FrameMetricPayload {
            duration_ms: duration,
            timestamp: 1000.0,
        }
    }

    fn make_stream_payload(event_type: &str) -> StreamEventPayload {
        StreamEventPayload {
            workspace_id: "ws-1".to_string(),
            event_type: event_type.to_string(),
            details: None,
            source: "test".to_string(),
            timestamp: 1000.0,
        }
    }

    fn make_agent_turn_payload() -> AgentTurnPayload {
        AgentTurnPayload {
            workspace_id: "ws-1".to_string(),
            duration_ms: 5000.0,
            duration_api_ms: 4000.0,
            input_tokens: 100,
            output_tokens: 200,
            cache_read_tokens: 50,
            cache_creation_tokens: 25,
            total_cost_usd: 0.05,
            num_turns: 3,
            timestamp: 1000.0,
        }
    }

    // --- push_ipc_metrics_inner ---

    #[test]
    fn test_push_ipc_metrics_inner_disabled() {
        let mut perf = PerfMetrics::new();
        assert!(!perf.enabled);
        let metrics = vec![make_ipc_payload("get_status", 10.0, true)];
        let result = push_ipc_metrics_inner(&mut perf, metrics);
        assert!(result.is_ok());
        assert!(perf.ipc_calls.is_empty());
    }

    #[test]
    fn test_push_ipc_metrics_inner_enabled() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let metrics = vec![
            make_ipc_payload("cmd_a", 5.0, true),
            make_ipc_payload("cmd_b", 15.0, false),
        ];
        let result = push_ipc_metrics_inner(&mut perf, metrics);
        assert!(result.is_ok());
        assert_eq!(perf.ipc_calls.len(), 2);
        assert_eq!(perf.ipc_calls[0].command, "cmd_a");
        assert!(perf.ipc_calls[0].success);
        assert_eq!(perf.ipc_calls[1].command, "cmd_b");
        assert!(!perf.ipc_calls[1].success);
    }

    #[test]
    fn test_push_ipc_metrics_inner_empty_vec() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let result = push_ipc_metrics_inner(&mut perf, vec![]);
        assert!(result.is_ok());
        assert!(perf.ipc_calls.is_empty());
    }

    #[test]
    fn test_push_ipc_metrics_inner_with_error() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let metrics = vec![IpcMetricPayload {
            command: "failing_cmd".to_string(),
            duration_ms: 100.0,
            success: false,
            error: Some("timeout".to_string()),
            timestamp: 2000.0,
        }];
        push_ipc_metrics_inner(&mut perf, metrics).unwrap();
        assert_eq!(perf.ipc_calls[0].error.as_deref(), Some("timeout"));
    }

    // --- push_frame_metrics_inner ---

    #[test]
    fn test_push_frame_metrics_inner_disabled() {
        let mut perf = PerfMetrics::new();
        let metrics = vec![make_frame_payload(33.0)];
        let result = push_frame_metrics_inner(&mut perf, metrics);
        assert!(result.is_ok());
        assert!(perf.long_frames.is_empty());
    }

    #[test]
    fn test_push_frame_metrics_inner_enabled() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let metrics = vec![make_frame_payload(33.0), make_frame_payload(50.0)];
        push_frame_metrics_inner(&mut perf, metrics).unwrap();
        assert_eq!(perf.long_frames.len(), 2);
        assert_eq!(perf.long_frames[0].duration_ms, 33.0);
        assert_eq!(perf.long_frames[1].duration_ms, 50.0);
    }

    #[test]
    fn test_push_frame_metrics_inner_empty() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        push_frame_metrics_inner(&mut perf, vec![]).unwrap();
        assert!(perf.long_frames.is_empty());
    }

    // --- push_stream_events_inner ---

    #[test]
    fn test_push_stream_events_inner_disabled() {
        let mut perf = PerfMetrics::new();
        let events = vec![make_stream_payload("start")];
        push_stream_events_inner(&mut perf, events).unwrap();
        assert!(perf.stream_events.is_empty());
    }

    #[test]
    fn test_push_stream_events_inner_enabled() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let events = vec![
            make_stream_payload("start"),
            make_stream_payload("chunk"),
            make_stream_payload("end"),
        ];
        push_stream_events_inner(&mut perf, events).unwrap();
        assert_eq!(perf.stream_events.len(), 3);
        assert_eq!(perf.stream_events[0].event_type, "start");
        assert_eq!(perf.stream_events[2].event_type, "end");
    }

    #[test]
    fn test_push_stream_events_inner_with_details() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let events = vec![StreamEventPayload {
            workspace_id: "ws-1".to_string(),
            event_type: "error".to_string(),
            details: Some("connection lost".to_string()),
            source: "api".to_string(),
            timestamp: 3000.0,
        }];
        push_stream_events_inner(&mut perf, events).unwrap();
        assert_eq!(
            perf.stream_events[0].details.as_deref(),
            Some("connection lost")
        );
    }

    // --- push_agent_turn_metric_inner ---

    #[test]
    fn test_push_agent_turn_metric_inner_disabled() {
        let mut perf = PerfMetrics::new();
        push_agent_turn_metric_inner(&mut perf, make_agent_turn_payload()).unwrap();
        assert!(perf.agent_turns.is_empty());
    }

    #[test]
    fn test_push_agent_turn_metric_inner_enabled() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        push_agent_turn_metric_inner(&mut perf, make_agent_turn_payload()).unwrap();
        assert_eq!(perf.agent_turns.len(), 1);
        let turn = &perf.agent_turns[0];
        assert_eq!(turn.workspace_id, "ws-1");
        assert_eq!(turn.input_tokens, 100);
        assert_eq!(turn.output_tokens, 200);
        assert_eq!(turn.num_turns, 3);
        assert!((turn.total_cost_usd - 0.05).abs() < f64::EPSILON);
    }

    // --- toggle_perf_monitor_inner ---

    #[test]
    fn test_toggle_perf_monitor_inner_enable() {
        let mut perf = PerfMetrics::new();
        assert!(!perf.enabled);
        let result = toggle_perf_monitor_inner(&mut perf, true).unwrap();
        assert!(result);
        assert!(perf.enabled);
    }

    #[test]
    fn test_toggle_perf_monitor_inner_disable() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        let result = toggle_perf_monitor_inner(&mut perf, false).unwrap();
        assert!(!result);
        assert!(!perf.enabled);
    }

    #[test]
    fn test_toggle_perf_monitor_inner_idempotent() {
        let mut perf = PerfMetrics::new();
        toggle_perf_monitor_inner(&mut perf, true).unwrap();
        toggle_perf_monitor_inner(&mut perf, true).unwrap();
        assert!(perf.enabled);
    }

    // --- get_perf_status_inner ---

    #[test]
    fn test_get_perf_status_inner_default() {
        let perf = PerfMetrics::new();
        assert!(!get_perf_status_inner(&perf).unwrap());
    }

    #[test]
    fn test_get_perf_status_inner_after_toggle() {
        let mut perf = PerfMetrics::new();
        perf.enabled = true;
        assert!(get_perf_status_inner(&perf).unwrap());
    }

    // --- Integration-style: toggle then push ---

    #[test]
    fn test_toggle_then_push_metrics() {
        let mut perf = PerfMetrics::new();

        // Initially disabled — push should be no-op
        push_ipc_metrics_inner(&mut perf, vec![make_ipc_payload("a", 1.0, true)]).unwrap();
        assert!(perf.ipc_calls.is_empty());

        // Enable
        toggle_perf_monitor_inner(&mut perf, true).unwrap();

        // Now push should work
        push_ipc_metrics_inner(&mut perf, vec![make_ipc_payload("b", 2.0, true)]).unwrap();
        assert_eq!(perf.ipc_calls.len(), 1);

        // Disable again
        toggle_perf_monitor_inner(&mut perf, false).unwrap();
        push_ipc_metrics_inner(&mut perf, vec![make_ipc_payload("c", 3.0, true)]).unwrap();
        // Still only 1 from before
        assert_eq!(perf.ipc_calls.len(), 1);
    }

    // ── Command wrapper tests ──

    use crate::test_helpers::mock_app_with_state;
    use tauri::Manager;

    #[tokio::test]
    async fn test_push_ipc_metrics_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        // Enable perf first
        toggle_perf_monitor(state.clone(), true).await.unwrap();

        let metrics = vec![make_ipc_payload("cmd_a", 5.0, true)];
        let result = push_ipc_metrics(state, metrics).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_push_frame_metrics_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        toggle_perf_monitor(state.clone(), true).await.unwrap();

        let metrics = vec![make_frame_payload(33.0)];
        let result = push_frame_metrics(state, metrics).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_push_stream_events_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        toggle_perf_monitor(state.clone(), true).await.unwrap();

        let events = vec![make_stream_payload("start")];
        let result = push_stream_events(state, events).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_push_agent_turn_metric_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();
        toggle_perf_monitor(state.clone(), true).await.unwrap();

        let metric = make_agent_turn_payload();
        let result = push_agent_turn_metric(state, metric).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_toggle_perf_monitor_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();

        let result = toggle_perf_monitor(state.clone(), true).await.unwrap();
        assert!(result);

        let result = toggle_perf_monitor(state, false).await.unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn test_get_perf_status_command() {
        let app = mock_app_with_state();
        let state = app.state::<AppState>();

        let status = get_perf_status(state.clone()).await.unwrap();
        assert!(!status);

        toggle_perf_monitor(state.clone(), true).await.unwrap();
        let status = get_perf_status(state).await.unwrap();
        assert!(status);
    }
}
