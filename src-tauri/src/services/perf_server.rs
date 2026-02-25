use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

// --- Metric types ---

const MAX_IPC_METRICS: usize = 500;
const MAX_FRAME_METRICS: usize = 200;
const MAX_AGENT_TURN_METRICS: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcMetric {
    pub command: String,
    pub duration_ms: f64,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMetric {
    pub duration_ms: f64,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnMetric {
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

// --- Shared state ---

pub struct PerfMetrics {
    pub ipc_calls: VecDeque<IpcMetric>,
    pub long_frames: VecDeque<FrameMetric>,
    pub agent_turns: VecDeque<AgentTurnMetric>,
    pub enabled: bool,
}

impl PerfMetrics {
    pub fn new() -> Self {
        Self {
            ipc_calls: VecDeque::new(),
            long_frames: VecDeque::new(),
            agent_turns: VecDeque::new(),
            enabled: false,
        }
    }

    pub fn push_ipc(&mut self, metric: IpcMetric) {
        if self.ipc_calls.len() >= MAX_IPC_METRICS {
            self.ipc_calls.pop_front();
        }
        self.ipc_calls.push_back(metric);
    }

    pub fn push_frame(&mut self, metric: FrameMetric) {
        if self.long_frames.len() >= MAX_FRAME_METRICS {
            self.long_frames.pop_front();
        }
        self.long_frames.push_back(metric);
    }

    pub fn push_agent_turn(&mut self, metric: AgentTurnMetric) {
        if self.agent_turns.len() >= MAX_AGENT_TURN_METRICS {
            self.agent_turns.pop_front();
        }
        self.agent_turns.push_back(metric);
    }

    pub fn clear(&mut self) {
        self.ipc_calls.clear();
        self.long_frames.clear();
        self.agent_turns.clear();
    }
}

pub type SharedPerfMetrics = Arc<Mutex<PerfMetrics>>;

// --- JSON response types ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsSummary {
    total_ipc_calls: usize,
    slow_ipc_calls: usize,
    avg_ipc_duration_ms: f64,
    total_long_frames: usize,
    total_agent_turns: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsResponse {
    enabled: bool,
    summary: MetricsSummary,
    ipc_calls: Vec<IpcMetric>,
    long_frames: Vec<FrameMetric>,
    agent_turns: Vec<AgentTurnMetric>,
}

// --- HTTP handlers ---

async fn get_metrics(State(metrics): State<SharedPerfMetrics>) -> Json<MetricsResponse> {
    let lock = metrics.lock().unwrap_or_else(|e| e.into_inner());

    let total = lock.ipc_calls.len();
    let slow = lock
        .ipc_calls
        .iter()
        .filter(|m| m.duration_ms > 200.0)
        .count();
    let avg = if total > 0 {
        lock.ipc_calls.iter().map(|m| m.duration_ms).sum::<f64>() / total as f64
    } else {
        0.0
    };

    Json(MetricsResponse {
        enabled: lock.enabled,
        summary: MetricsSummary {
            total_ipc_calls: total,
            slow_ipc_calls: slow,
            avg_ipc_duration_ms: (avg * 100.0).round() / 100.0,
            total_long_frames: lock.long_frames.len(),
            total_agent_turns: lock.agent_turns.len(),
        },
        ipc_calls: lock.ipc_calls.iter().cloned().collect(),
        long_frames: lock.long_frames.iter().cloned().collect(),
        agent_turns: lock.agent_turns.iter().cloned().collect(),
    })
}

async fn clear_metrics(State(metrics): State<SharedPerfMetrics>) -> Json<serde_json::Value> {
    let mut lock = metrics.lock().unwrap_or_else(|e| e.into_inner());
    lock.clear();
    Json(serde_json::json!({ "ok": true }))
}

#[derive(Deserialize)]
struct ToggleBody {
    enabled: Option<bool>,
}

async fn toggle_metrics(
    State(metrics): State<SharedPerfMetrics>,
    body: Option<Json<ToggleBody>>,
) -> Json<serde_json::Value> {
    let mut lock = metrics.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(Json(body)) = body {
        if let Some(enabled) = body.enabled {
            lock.enabled = enabled;
        } else {
            lock.enabled = !lock.enabled;
        }
    } else {
        lock.enabled = !lock.enabled;
    }
    Json(serde_json::json!({ "enabled": lock.enabled }))
}

async fn dashboard() -> impl IntoResponse {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        Html(DASHBOARD_HTML),
    )
}

// --- Server startup ---

pub async fn start_perf_server(metrics: SharedPerfMetrics) {
    let app = Router::new()
        .route("/", get(dashboard))
        .route("/api/metrics", get(get_metrics))
        .route("/api/metrics/clear", post(clear_metrics))
        .route("/api/toggle", post(toggle_metrics))
        .with_state(metrics);

    let listener = match tokio::net::TcpListener::bind("127.0.0.1:9746").await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[perf-server] Failed to bind port 9746: {}", e);
            return;
        }
    };

    eprintln!("[perf-server] Dashboard available at http://localhost:9746");

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[perf-server] Server error: {}", e);
    }
}

// --- Embedded HTML dashboard ---

const DASHBOARD_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conductor — Performance Monitor</title>
<style>
  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #1c2128;
    --border: #30363d;
    --text: #e6edf3;
    --text2: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    --mono: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; }

  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
  }
  .header h1 { font-size: 15px; font-weight: 600; }
  .header .controls { display: flex; gap: 8px; align-items: center; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 500;
  }
  .badge.on { background: rgba(63,185,80,0.15); color: var(--green); }
  .badge.off { background: rgba(139,148,158,0.15); color: var(--text2); }

  button {
    background: var(--bg3); color: var(--text2); border: 1px solid var(--border);
    padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    transition: all 0.15s;
  }
  button:hover { background: var(--border); color: var(--text); }
  button.primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  button.primary:hover { opacity: 0.85; }
  button.danger { color: var(--red); }
  button.danger:hover { background: rgba(248,81,73,0.15); }

  .summary {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px; padding: 16px 20px;
  }
  .stat {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 16px;
  }
  .stat .label { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat .value { font-size: 22px; font-weight: 600; margin-top: 4px; font-family: var(--mono); }

  .tabs {
    display: flex; gap: 0; border-bottom: 1px solid var(--border);
    padding: 0 20px;
  }
  .tab {
    padding: 10px 16px; cursor: pointer; color: var(--text2);
    border-bottom: 2px solid transparent; font-size: 13px; font-weight: 500;
    transition: all 0.15s;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab .count {
    display: inline-block; padding: 0 6px; border-radius: 10px;
    background: var(--bg3); font-size: 11px; margin-left: 6px; font-weight: 400;
  }

  .content { padding: 0 20px 20px; }

  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; padding: 8px 12px; font-size: 11px; color: var(--text2);
       text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
  td { padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 12px;
       font-family: var(--mono); white-space: nowrap; }
  tr:hover td { background: var(--bg2); }

  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; }
  .dot.ok { background: var(--green); }
  .dot.warn { background: var(--yellow); }
  .dot.err { background: var(--red); }

  .dur-fast { color: var(--green); }
  .dur-med { color: var(--text); }
  .dur-slow { color: var(--yellow); }
  .dur-bad { color: var(--red); }

  .empty { padding: 40px; text-align: center; color: var(--text2); }
  .filter { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .filter label { font-size: 12px; color: var(--text2); cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .updated { font-size: 11px; color: var(--text2); }
</style>
</head>
<body>

<div class="header">
  <div style="display:flex;align-items:center;gap:12px">
    <h1>Conductor Perf Monitor</h1>
    <span id="status" class="badge off">OFF</span>
  </div>
  <div class="controls">
    <span id="updated" class="updated"></span>
    <button id="toggleBtn" class="primary" onclick="toggle()">Enable</button>
    <button class="danger" onclick="clearMetrics()">Clear</button>
  </div>
</div>

<div class="summary">
  <div class="stat"><div class="label">IPC Calls</div><div class="value" id="s-ipc">0</div></div>
  <div class="stat"><div class="label">Slow IPC (&gt;200ms)</div><div class="value" id="s-slow" style="color:var(--yellow)">0</div></div>
  <div class="stat"><div class="label">Avg IPC</div><div class="value" id="s-avg">0ms</div></div>
  <div class="stat"><div class="label">Long Frames</div><div class="value" id="s-frames">0</div></div>
  <div class="stat"><div class="label">Agent Turns</div><div class="value" id="s-turns">0</div></div>
</div>

<div class="tabs">
  <div class="tab active" data-tab="ipc" onclick="switchTab('ipc')">IPC Calls<span class="count" id="tc-ipc">0</span></div>
  <div class="tab" data-tab="frames" onclick="switchTab('frames')">Long Frames<span class="count" id="tc-frames">0</span></div>
  <div class="tab" data-tab="agent" onclick="switchTab('agent')">Agent Turns<span class="count" id="tc-agent">0</span></div>
</div>

<div class="content">
  <div id="panel-ipc">
    <div class="filter">
      <label><input type="checkbox" id="slowOnly" onchange="render()"> Slow only (&gt;200ms)</label>
    </div>
    <table><thead><tr>
      <th>Status</th><th>Command</th><th>Duration</th><th>Time</th>
    </tr></thead><tbody id="ipc-body"></tbody></table>
  </div>

  <div id="panel-frames" style="display:none">
    <table><thead><tr>
      <th>Duration</th><th>Time</th>
    </tr></thead><tbody id="frames-body"></tbody></table>
  </div>

  <div id="panel-agent" style="display:none">
    <table><thead><tr>
      <th>Workspace</th><th>Wall Time</th><th>API Time</th><th>In Tokens</th><th>Out Tokens</th><th>Cache</th><th>Cost</th><th>Turns</th><th>Time</th>
    </tr></thead><tbody id="agent-body"></tbody></table>
  </div>
</div>

<script>
let data = null;
let activeTab = 'ipc';

function fmtDur(ms) {
  if (ms < 1000) return ms.toFixed(1) + 'ms';
  let s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  let m = Math.floor(s / 60);
  return m + 'm ' + Math.round(s % 60) + 's';
}

function durClass(ms) {
  if (ms < 50) return 'dur-fast';
  if (ms < 200) return 'dur-med';
  if (ms < 500) return 'dur-slow';
  return 'dur-bad';
}

function fmtTokens(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n/1000).toFixed(1) + 'k';
  return (n/1e6).toFixed(2) + 'M';
}

function fmtCost(usd) {
  if (usd < 0.01) return '$' + usd.toFixed(4);
  if (usd < 1) return '$' + usd.toFixed(3);
  return '$' + usd.toFixed(2);
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  ['ipc','frames','agent'].forEach(p => {
    document.getElementById('panel-' + p).style.display = p === tab ? '' : 'none';
  });
}

function render() {
  if (!data) return;
  const s = data.summary;

  document.getElementById('s-ipc').textContent = s.totalIpcCalls;
  document.getElementById('s-slow').textContent = s.slowIpcCalls;
  document.getElementById('s-avg').textContent = fmtDur(s.avgIpcDurationMs);
  document.getElementById('s-frames').textContent = s.totalLongFrames;
  document.getElementById('s-turns').textContent = s.totalAgentTurns;
  document.getElementById('tc-ipc').textContent = s.totalIpcCalls;
  document.getElementById('tc-frames').textContent = s.totalLongFrames;
  document.getElementById('tc-agent').textContent = s.totalAgentTurns;

  const badge = document.getElementById('status');
  badge.textContent = data.enabled ? 'ON' : 'OFF';
  badge.className = 'badge ' + (data.enabled ? 'on' : 'off');
  document.getElementById('toggleBtn').textContent = data.enabled ? 'Disable' : 'Enable';

  // IPC table
  let ipc = [...data.ipcCalls].reverse();
  if (document.getElementById('slowOnly').checked) {
    ipc = ipc.filter(m => m.durationMs > 200);
  }
  const ipcBody = document.getElementById('ipc-body');
  if (ipc.length === 0) {
    ipcBody.innerHTML = '<tr><td colspan="4" class="empty">No IPC calls recorded</td></tr>';
  } else {
    ipcBody.innerHTML = ipc.slice(0, 200).map(m => {
      const dot = m.success ? 'ok' : 'err';
      const dc = durClass(m.durationMs);
      return `<tr>
        <td><span class="dot ${dot}"></span>${m.success ? 'OK' : 'ERR'}</td>
        <td>${m.command}</td>
        <td class="${dc}">${fmtDur(m.durationMs)}</td>
        <td style="color:var(--text2)">${fmtTime(m.timestamp)}</td>
      </tr>`;
    }).join('');
  }

  // Frames table
  const frames = [...data.longFrames].reverse();
  const framesBody = document.getElementById('frames-body');
  if (frames.length === 0) {
    framesBody.innerHTML = '<tr><td colspan="2" class="empty">No long frames recorded</td></tr>';
  } else {
    framesBody.innerHTML = frames.slice(0, 200).map(m => {
      const dc = durClass(m.durationMs);
      return `<tr>
        <td class="${dc}">${fmtDur(m.durationMs)}</td>
        <td style="color:var(--text2)">${fmtTime(m.timestamp)}</td>
      </tr>`;
    }).join('');
  }

  // Agent turns table
  const turns = [...data.agentTurns].reverse();
  const agentBody = document.getElementById('agent-body');
  if (turns.length === 0) {
    agentBody.innerHTML = '<tr><td colspan="9" class="empty">No agent turns recorded</td></tr>';
  } else {
    agentBody.innerHTML = turns.map(m => {
      const wsShort = m.workspaceId.substring(0, 8);
      return `<tr>
        <td title="${m.workspaceId}">${wsShort}</td>
        <td class="${durClass(m.durationMs)}">${fmtDur(m.durationMs)}</td>
        <td>${fmtDur(m.durationApiMs)}</td>
        <td>${fmtTokens(m.inputTokens)}</td>
        <td>${fmtTokens(m.outputTokens)}</td>
        <td>${fmtTokens(m.cacheReadTokens)}</td>
        <td>${fmtCost(m.totalCostUsd)}</td>
        <td>${m.numTurns}</td>
        <td style="color:var(--text2)">${fmtTime(m.timestamp)}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    data = await res.json();
    render();
  } catch (e) {
    console.error('Failed to fetch metrics:', e);
  }
}

async function toggle() {
  try { await fetch('/api/toggle', { method: 'POST' }); } catch {}
  fetchMetrics();
}

async function clearMetrics() {
  try { await fetch('/api/metrics/clear', { method: 'POST' }); } catch {}
  fetchMetrics();
}

fetchMetrics();
setInterval(fetchMetrics, 2000);
</script>
</body>
</html>"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perf_metrics_new() {
        let m = PerfMetrics::new();
        assert!(!m.enabled);
        assert!(m.ipc_calls.is_empty());
        assert!(m.long_frames.is_empty());
        assert!(m.agent_turns.is_empty());
    }

    #[test]
    fn test_ipc_ring_buffer_cap() {
        let mut m = PerfMetrics::new();
        for i in 0..600 {
            m.push_ipc(IpcMetric {
                command: format!("cmd_{}", i),
                duration_ms: 1.0,
                success: true,
                error: None,
                timestamp: i as f64,
            });
        }
        assert_eq!(m.ipc_calls.len(), MAX_IPC_METRICS);
        assert_eq!(m.ipc_calls.front().unwrap().command, "cmd_100");
    }

    #[test]
    fn test_frame_ring_buffer_cap() {
        let mut m = PerfMetrics::new();
        for i in 0..300 {
            m.push_frame(FrameMetric {
                duration_ms: 60.0,
                timestamp: i as f64,
            });
        }
        assert_eq!(m.long_frames.len(), MAX_FRAME_METRICS);
    }

    #[test]
    fn test_agent_turn_ring_buffer_cap() {
        let mut m = PerfMetrics::new();
        for i in 0..150 {
            m.push_agent_turn(AgentTurnMetric {
                workspace_id: "ws".to_string(),
                duration_ms: 1000.0,
                duration_api_ms: 500.0,
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                total_cost_usd: 0.01,
                num_turns: 1,
                timestamp: i as f64,
            });
        }
        assert_eq!(m.agent_turns.len(), MAX_AGENT_TURN_METRICS);
    }

    #[test]
    fn test_clear() {
        let mut m = PerfMetrics::new();
        m.push_ipc(IpcMetric {
            command: "test".to_string(),
            duration_ms: 1.0,
            success: true,
            error: None,
            timestamp: 0.0,
        });
        m.push_frame(FrameMetric {
            duration_ms: 60.0,
            timestamp: 0.0,
        });
        m.clear();
        assert!(m.ipc_calls.is_empty());
        assert!(m.long_frames.is_empty());
        assert!(m.agent_turns.is_empty());
    }
}
