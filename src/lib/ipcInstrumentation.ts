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

const ipcBuffer: IpcMetricPayload[] = [];
const streamEventBuffer: StreamEventPayload[] = [];
let flushInterval: ReturnType<typeof setInterval> | null = null;

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

export async function instrumentedInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (SKIP_COMMANDS.has(cmd)) {
    return callInvoke<T>(cmd, args);
  }

  const start = performance.now();
  const timestamp = Date.now();
  let success = true;
  let error: string | undefined;

  try {
    return await callInvoke<T>(cmd, args);
  } catch (e) {
    success = false;
    error = String(e);
    throw e;
  } finally {
    const durationMs = performance.now() - start;
    ipcBuffer.push({ command: cmd, durationMs, success, error, timestamp });
  }
}

export function pushAgentTurnMetric(metric: AgentTurnPayload) {
  rawInvoke("push_agent_turn_metric", { metric }).catch(() => {});
}

export function pushStreamEvent(
  workspaceId: string,
  eventType: string,
  details?: string,
) {
  streamEventBuffer.push({
    workspaceId,
    eventType,
    details,
    source: "frontend",
    timestamp: Date.now(),
  });
}
