import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import {
  startFrameMonitor,
  stopFrameMonitor,
  pauseFrameMonitor,
  resumeFrameMonitor,
} from "./frameMonitor";

let rafCallbacks: Array<(time: number) => void> = [];
let rafId = 0;
let performanceTime = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  rafCallbacks = [];
  rafId = 0;
  performanceTime = 0;

  const rafFn = vi.fn((cb: (time: number) => void) => {
    rafCallbacks.push(cb);
    return ++rafId;
  });
  vi.stubGlobal("requestAnimationFrame", rafFn);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(performance, "now").mockImplementation(() => performanceTime);
});

afterEach(() => {
  stopFrameMonitor();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function tickFrame(time: number) {
  performanceTime = time;
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  cbs.forEach((cb) => cb(time));
}

describe("startFrameMonitor", () => {
  it("calls requestAnimationFrame on start", () => {
    startFrameMonitor();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("is a no-op if already started", () => {
    startFrameMonitor();
    startFrameMonitor(); // no-op
    // Only one initial rAF call
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("does not record fast frames", () => {
    startFrameMonitor();
    tickFrame(0);   // first frame, sets lastFrameTime
    tickFrame(16);  // 16ms delta — fast frame, not recorded

    stopFrameMonitor();

    // No push_frame_metrics call because no slow frames
    expect(invoke).not.toHaveBeenCalledWith("push_frame_metrics", expect.anything());
  });

  it("records slow frames (>50ms)", () => {
    startFrameMonitor();
    tickFrame(0);    // first frame
    tickFrame(100);  // 100ms delta — slow frame

    stopFrameMonitor();

    const flushCall = (invoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_frame_metrics",
    );
    expect(flushCall).toBeDefined();
    expect(flushCall[1].metrics).toHaveLength(1);
    expect(flushCall[1].metrics[0].durationMs).toBe(100);
  });

  it("records multiple slow frames", () => {
    startFrameMonitor();
    tickFrame(0);
    tickFrame(60);   // slow
    tickFrame(80);   // fast (20ms)
    tickFrame(200);  // slow (120ms)

    stopFrameMonitor();

    const flushCall = (invoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_frame_metrics",
    );
    expect(flushCall).toBeDefined();
    expect(flushCall[1].metrics).toHaveLength(2);
    expect(flushCall[1].metrics[0].durationMs).toBe(60);
    expect(flushCall[1].metrics[1].durationMs).toBe(120);
  });

  it("flushes periodically via setInterval", () => {
    startFrameMonitor();
    tickFrame(0);
    tickFrame(100); // slow frame buffered

    vi.clearAllMocks();
    vi.advanceTimersByTime(2000);

    const flushCall = (invoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_frame_metrics",
    );
    expect(flushCall).toBeDefined();
  });
});

describe("stopFrameMonitor", () => {
  it("cancels animation frame and clears interval", () => {
    startFrameMonitor();
    stopFrameMonitor();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("is safe to call when not started", () => {
    stopFrameMonitor(); // no error
  });

  it("flushes remaining buffer on stop", () => {
    startFrameMonitor();
    tickFrame(0);
    tickFrame(200); // slow

    vi.clearAllMocks();
    stopFrameMonitor();

    const flushCall = (invoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_frame_metrics",
    );
    expect(flushCall).toBeDefined();
  });

  it("does not flush when buffer is empty", () => {
    startFrameMonitor();
    tickFrame(0);
    tickFrame(10); // fast — no slow frames

    vi.clearAllMocks();
    stopFrameMonitor();

    expect(invoke).not.toHaveBeenCalledWith("push_frame_metrics", expect.anything());
  });
});

describe("pauseFrameMonitor", () => {
  it("cancels animation frame and resets lastFrameTime", () => {
    startFrameMonitor();
    tickFrame(0); // sets lastFrameTime

    pauseFrameMonitor();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("is safe to call when not started", () => {
    pauseFrameMonitor(); // no error when rafHandle is null
  });
});

describe("resumeFrameMonitor", () => {
  it("restarts animation frame after pause", () => {
    startFrameMonitor();
    tickFrame(0);
    pauseFrameMonitor();

    vi.clearAllMocks();
    resumeFrameMonitor();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("is a no-op if not started", () => {
    vi.clearAllMocks();
    resumeFrameMonitor(); // started is false, should not call rAF
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("is a no-op if rafHandle is already set (not paused)", () => {
    startFrameMonitor();
    vi.clearAllMocks();
    resumeFrameMonitor(); // rafHandle is not null, should be no-op
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
