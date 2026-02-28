use crate::error::AppError;
use crate::services::perf_server::{AgentTurnMetric, FrameMetric, IpcMetric, StreamEventMetric};
use crate::state::AppState;
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcMetricPayload {
    pub command: String,
    pub duration_ms: f64,
    pub success: bool,
    pub error: Option<String>,
    pub timestamp: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMetricPayload {
    pub duration_ms: f64,
    pub timestamp: f64,
}

#[derive(Debug, Deserialize)]
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

#[tauri::command]
pub async fn push_ipc_metrics(
    state: State<'_, AppState>,
    metrics: Vec<IpcMetricPayload>,
) -> Result<(), AppError> {
    let perf_metrics = Arc::clone(&state.perf_metrics);
    tokio::task::spawn_blocking(move || {
        let mut lock = perf_metrics.lock().unwrap();
        if !lock.enabled {
            return Ok(());
        }
        for m in metrics {
            lock.push_ipc(IpcMetric {
                command: m.command,
                duration_ms: m.duration_ms,
                success: m.success,
                error: m.error,
                timestamp: m.timestamp,
            });
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn push_frame_metrics(
    state: State<'_, AppState>,
    metrics: Vec<FrameMetricPayload>,
) -> Result<(), AppError> {
    let perf_metrics = Arc::clone(&state.perf_metrics);
    tokio::task::spawn_blocking(move || {
        let mut lock = perf_metrics.lock().unwrap();
        if !lock.enabled {
            return Ok(());
        }
        for m in metrics {
            lock.push_frame(FrameMetric {
                duration_ms: m.duration_ms,
                timestamp: m.timestamp,
            });
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEventPayload {
    pub workspace_id: String,
    pub event_type: String,
    pub details: Option<String>,
    pub source: String,
    pub timestamp: f64,
}

#[tauri::command]
pub async fn push_stream_events(
    state: State<'_, AppState>,
    events: Vec<StreamEventPayload>,
) -> Result<(), AppError> {
    let perf_metrics = Arc::clone(&state.perf_metrics);
    tokio::task::spawn_blocking(move || {
        let mut lock = perf_metrics.lock().unwrap();
        if !lock.enabled {
            return Ok(());
        }
        for e in events {
            lock.push_stream_event(StreamEventMetric {
                workspace_id: e.workspace_id,
                event_type: e.event_type,
                details: e.details,
                source: e.source,
                timestamp: e.timestamp,
            });
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn push_agent_turn_metric(
    state: State<'_, AppState>,
    metric: AgentTurnPayload,
) -> Result<(), AppError> {
    let perf_metrics = Arc::clone(&state.perf_metrics);
    tokio::task::spawn_blocking(move || {
        let mut lock = perf_metrics.lock().unwrap();
        if !lock.enabled {
            return Ok(());
        }
        lock.push_agent_turn(AgentTurnMetric {
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
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn toggle_perf_monitor(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, AppError> {
    let perf_metrics = Arc::clone(&state.perf_metrics);
    tokio::task::spawn_blocking(move || {
        let mut lock = perf_metrics.lock().unwrap();
        lock.enabled = enabled;
        Ok(lock.enabled)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_perf_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    let perf_metrics = Arc::clone(&state.perf_metrics);
    tokio::task::spawn_blocking(move || {
        let lock = perf_metrics.lock().unwrap();
        Ok(lock.enabled)
    })
    .await
    .map_err(|e| AppError::GitError(format!("task failed: {}", e)))?
}
