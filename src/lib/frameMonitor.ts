import { invoke } from "@tauri-apps/api/core";

interface FrameMetricPayload {
  durationMs: number;
  timestamp: number;
}

const SLOW_FRAME_THRESHOLD_MS = 50;

let rafHandle: number | null = null;
let lastFrameTime: number | null = null;
const frameBuffer: FrameMetricPayload[] = [];
let flushInterval: ReturnType<typeof setInterval> | null = null;
let started = false;

function flushFrameBuffer() {
  if (frameBuffer.length === 0) return;
  const batch = frameBuffer.splice(0, frameBuffer.length);
  invoke("push_frame_metrics", { metrics: batch }).catch(() => {});
}

function tick() {
  const now = performance.now();
  if (lastFrameTime !== null) {
    const delta = now - lastFrameTime;
    if (delta > SLOW_FRAME_THRESHOLD_MS) {
      frameBuffer.push({ durationMs: delta, timestamp: Date.now() });
    }
  }
  lastFrameTime = now;
  rafHandle = requestAnimationFrame(tick);
}

export function startFrameMonitor() {
  if (started) return;
  started = true;
  rafHandle = requestAnimationFrame(tick);
  /* v8 ignore next 3 -- flushInterval is always null when rafHandle is null */
  if (!flushInterval) {
    flushInterval = setInterval(flushFrameBuffer, 2000);
  }
}

export function stopFrameMonitor() {
  started = false;
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
    lastFrameTime = null;
  }
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  flushFrameBuffer();
}

export function pauseFrameMonitor() {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
    lastFrameTime = null;
  }
}

export function resumeFrameMonitor() {
  if (rafHandle !== null || !started) return;
  rafHandle = requestAnimationFrame(tick);
}
