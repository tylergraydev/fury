use crate::error::AppError;
use crate::services::perf_server::{AgentTurnMetric, FrameMetric, IpcMetric};
use crate::state::AppState;
use serde::Deserialize;
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
pub fn push_ipc_metrics(
    state: State<'_, AppState>,
    metrics: Vec<IpcMetricPayload>,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap();
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
}

#[tauri::command]
pub fn push_frame_metrics(
    state: State<'_, AppState>,
    metrics: Vec<FrameMetricPayload>,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap();
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
}

#[tauri::command]
pub fn push_agent_turn_metric(
    state: State<'_, AppState>,
    metric: AgentTurnPayload,
) -> Result<(), AppError> {
    let mut lock = state.perf_metrics.lock().unwrap();
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
}

#[tauri::command]
pub fn toggle_perf_monitor(state: State<'_, AppState>, enabled: bool) -> Result<bool, AppError> {
    let mut lock = state.perf_metrics.lock().unwrap();
    lock.enabled = enabled;
    Ok(lock.enabled)
}

#[tauri::command]
pub fn get_perf_status(state: State<'_, AppState>) -> Result<bool, AppError> {
    let lock = state.perf_metrics.lock().unwrap();
    Ok(lock.enabled)
}
