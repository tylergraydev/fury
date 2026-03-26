import { invoke as rawInvoke } from "@tauri-apps/api/core";

// Commands that should not be instrumented (to avoid recursion)
const SKIP_COMMANDS = new Set([
  "push_ipc_metrics",
  "push_frame_metrics",
  "push_agent_turn_metric",
  "push_stream_events",
  "toggle_perf_monitor",
  "get_perf_status",
]);

interface IpcMetricPayload {
  command: string;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

interface AgentTurnPayload {
  workspaceId: string;
  durationMs: number;
  durationApiMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  numTurns: number;
  timestamp: number;
}

interface StreamEventPayload {
  workspaceId: string;
  eventType: string;
  details?: string;
  source: string;
  timestamp: number;
}

const MAX_BUFFER_SIZE = 1000;
const ipcBuffer: IpcMetricPayload[] = [];
const streamEventBuffer: StreamEventPayload[] = [];
let flushInterval: ReturnType<typeof setInterval> | null = null;

// ─── Debug mode ─────────────────────────────────────────────────────────
// Enable from DevTools console:  window.__IPC_DEBUG = true
// This logs every IPC call in real-time with timing + concurrency count.
let _inflight = 0;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
    ipcBuffer.length = 0;
    streamEventBuffer.length = 0;
    _inflight = 0;
  });
}

/* v8 ignore next 7 -- debug utility only active when __IPC_DEBUG flag set */
function debugLog(phase: "START" | "END" | "FAIL", cmd: string, ms?: number) {
  if (!(globalThis as Record<string, unknown>).__IPC_DEBUG) return;
  const tag = phase === "START" ? "→" : phase === "END" ? "✓" : "✗";
  const timing = ms !== undefined ? ` ${ms.toFixed(1)}ms` : "";
  const concurrent = phase === "START" ? ` [inflight=${_inflight}]` : "";
  console.warn(`[IPC ${tag}] ${cmd}${timing}${concurrent}`);
}
// ────────────────────────────────────────────────────────────────────────

function flushIpcBuffer() {
  if (ipcBuffer.length === 0) return;
  const batch = ipcBuffer.splice(0, ipcBuffer.length);
  rawInvoke("push_ipc_metrics", { metrics: batch }).catch(() => {});
}

function flushStreamEventBuffer() {
  if (streamEventBuffer.length === 0) return;
  const batch = streamEventBuffer.splice(0, streamEventBuffer.length);
  rawInvoke("push_stream_events", { events: batch }).catch((e) => {
    console.error("[perf] push_stream_events failed:", e);
  });
}

export function startIpcFlush() {
  if (!flushInterval) {
    flushInterval = setInterval(() => {
      flushIpcBuffer();
      flushStreamEventBuffer();
    }, 2000);
  }
}

export function stopIpcFlush() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  flushIpcBuffer();
  flushStreamEventBuffer();
}

function callInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return args !== undefined ? rawInvoke<T>(cmd, args) : rawInvoke<T>(cmd);
}

async function runInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  const timestamp = Date.now();
  let success = true;
  let error: string | undefined;

  _inflight++;
  debugLog("START", cmd);

  try {
    return await callInvoke<T>(cmd, args);
  } catch (e) {
    success = false;
    error = String(e);
    throw e;
  } finally {
    const durationMs = performance.now() - start;
    _inflight--;
    debugLog(success ? "END" : "FAIL", cmd, durationMs);
    if (ipcBuffer.length >= MAX_BUFFER_SIZE) {
      ipcBuffer.splice(0, ipcBuffer.length - MAX_BUFFER_SIZE + 1);
    }
    ipcBuffer.push({ command: cmd, durationMs, success, error, timestamp });
  }
}

export function instrumentedInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (SKIP_COMMANDS.has(cmd)) {
    return callInvoke<T>(cmd, args);
  }

  return runInvoke<T>(cmd, args);
}

export function pushAgentTurnMetric(metric: AgentTurnPayload) {
  rawInvoke("push_agent_turn_metric", { metric }).catch(() => {});
}

export function pushStreamEvent(
  workspaceId: string,
  eventType: string,
  details?: string,
) {
  if (streamEventBuffer.length >= MAX_BUFFER_SIZE) {
    streamEventBuffer.splice(0, streamEventBuffer.length - MAX_BUFFER_SIZE + 1);
  }
  streamEventBuffer.push({
    workspaceId,
    eventType,
    details,
    source: "frontend",
    timestamp: Date.now(),
  });
}
