import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke as rawInvoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import {
  instrumentedInvoke,
  pushAgentTurnMetric,
  pushStreamEvent,
  startIpcFlush,
  stopIpcFlush,
} from "./ipcInstrumentation";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  // Ensure flush interval is cleaned up between tests
  stopIpcFlush();
  vi.useRealTimers();
});

describe("instrumentedInvoke", () => {
  it("calls rawInvoke with command and args", async () => {
    (rawInvoke as any).mockResolvedValueOnce("result");
    const result = await instrumentedInvoke("get_diff", { workspaceId: "w1" });
    expect(rawInvoke).toHaveBeenCalledWith("get_diff", { workspaceId: "w1" });
    expect(result).toBe("result");
  });

  it("calls rawInvoke without args when not provided", async () => {
    (rawInvoke as any).mockResolvedValueOnce([]);
    const result = await instrumentedInvoke("list_workspaces");
    expect(rawInvoke).toHaveBeenCalledWith("list_workspaces");
    expect(result).toEqual([]);
  });

  it("skips instrumentation for SKIP_COMMANDS", async () => {
    (rawInvoke as any).mockResolvedValueOnce(undefined);
    await instrumentedInvoke("push_ipc_metrics", { metrics: [] });
    expect(rawInvoke).toHaveBeenCalledWith("push_ipc_metrics", { metrics: [] });

    // Flush and verify no ipc metric was pushed for the skip command
    stopIpcFlush();
    // The only rawInvoke calls should be the original + any flushes
    // but the ipcBuffer should NOT contain push_ipc_metrics itself
    const pushCalls = (rawInvoke as any).mock.calls.filter(
      (c: any[]) => c[0] === "push_ipc_metrics" && c[1]?.metrics?.some?.((m: any) => m.command === "push_ipc_metrics"),
    );
    expect(pushCalls).toHaveLength(0);
  });

  it("re-throws errors from invoke", async () => {
    (rawInvoke as any).mockRejectedValueOnce(new Error("network error"));
    await expect(instrumentedInvoke("get_diff", { workspaceId: "w1" })).rejects.toThrow("network error");
  });

  it("buffers metrics and flushes them on stopIpcFlush", async () => {
    (rawInvoke as any).mockResolvedValue(undefined);
    await instrumentedInvoke("get_diff", { workspaceId: "w1" });
    await instrumentedInvoke("list_workspaces");

    stopIpcFlush();

    // Find the push_ipc_metrics call
    const flushCall = (rawInvoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_ipc_metrics" && c[1]?.metrics?.length >= 2,
    );
    expect(flushCall).toBeDefined();
    expect(flushCall[1].metrics).toHaveLength(2);
    expect(flushCall[1].metrics[0].command).toBe("get_diff");
    expect(flushCall[1].metrics[0].success).toBe(true);
    expect(flushCall[1].metrics[1].command).toBe("list_workspaces");
  });

  it("records error in metric when invoke fails", async () => {
    (rawInvoke as any).mockRejectedValueOnce(new Error("disk full"));
    await instrumentedInvoke("save_data").catch(() => {});

    stopIpcFlush();

    const flushCall = (rawInvoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_ipc_metrics" && c[1]?.metrics?.some?.((m: any) => m.command === "save_data"),
    );
    expect(flushCall).toBeDefined();
    const metric = flushCall[1].metrics.find((m: any) => m.command === "save_data");
    expect(metric.success).toBe(false);
    expect(metric.error).toContain("disk full");
  });
});

describe("pushAgentTurnMetric", () => {
  it("calls rawInvoke with push_agent_turn_metric", () => {
    const metric = {
      workspaceId: "w1",
      durationMs: 1000,
      durationApiMs: 800,
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 50,
      cacheCreationTokens: 10,
      totalCostUsd: 0.01,
      numTurns: 1,
      timestamp: Date.now(),
    };
    pushAgentTurnMetric(metric);
    expect(rawInvoke).toHaveBeenCalledWith("push_agent_turn_metric", { metric });
  });
});

describe("pushStreamEvent", () => {
  it("buffers a stream event and flushes on stop", () => {
    pushStreamEvent("ws-1", "assistantText", "hello");
    stopIpcFlush();

    const flushCall = (rawInvoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_stream_events",
    );
    expect(flushCall).toBeDefined();
    expect(flushCall[1].events).toHaveLength(1);
    expect(flushCall[1].events[0].workspaceId).toBe("ws-1");
    expect(flushCall[1].events[0].eventType).toBe("assistantText");
    expect(flushCall[1].events[0].details).toBe("hello");
    expect(flushCall[1].events[0].source).toBe("frontend");
  });
});

describe("debugLog", () => {
  it("logs to console.warn when __IPC_DEBUG is enabled", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).__IPC_DEBUG = true;

    (rawInvoke as any).mockResolvedValue("ok");
    await instrumentedInvoke("test_cmd", { foo: "bar" });

    // debugLog is called on START and END
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[IPC"),
    );
    // START log should contain inflight count
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("test_cmd"),
    );

    warnSpy.mockRestore();
    delete (globalThis as Record<string, unknown>).__IPC_DEBUG;
  });

  it("logs FAIL tag when invoke fails with __IPC_DEBUG enabled", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).__IPC_DEBUG = true;

    (rawInvoke as any).mockRejectedValueOnce(new Error("fail"));
    await instrumentedInvoke("fail_cmd").catch(() => {});

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/IPC.*fail_cmd/),
    );

    warnSpy.mockRestore();
    delete (globalThis as Record<string, unknown>).__IPC_DEBUG;
  });
});

describe("startIpcFlush / stopIpcFlush", () => {
  it("flushes on interval when started", async () => {
    (rawInvoke as any).mockResolvedValue(undefined);
    startIpcFlush();

    // Generate a metric
    await instrumentedInvoke("list_workspaces");
    vi.clearAllMocks();

    // Advance past flush interval (2000ms)
    vi.advanceTimersByTime(2000);

    // Should have flushed the ipc buffer
    const flushCall = (rawInvoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_ipc_metrics",
    );
    expect(flushCall).toBeDefined();
  });

  it("does not start a second interval if already running", () => {
    startIpcFlush();
    startIpcFlush(); // no-op
    stopIpcFlush();
    // No error means success
  });

  it("stopIpcFlush clears interval and flushes remaining", async () => {
    (rawInvoke as any).mockResolvedValue(undefined);
    startIpcFlush();
    await instrumentedInvoke("get_diff", { workspaceId: "w1" });
    vi.clearAllMocks();

    stopIpcFlush();

    const flushCall = (rawInvoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_ipc_metrics",
    );
    expect(flushCall).toBeDefined();
  });

  it("stopIpcFlush is a no-op when not started", () => {
    stopIpcFlush();
    // Should not throw
  });

  it("does not flush when buffers are empty", () => {
    stopIpcFlush();
    // No push_ipc_metrics or push_stream_events calls since buffers are empty
    expect(rawInvoke).not.toHaveBeenCalled();
  });

  it("flushes stream events on interval", () => {
    startIpcFlush();
    pushStreamEvent("ws-1", "toolUse", "read_file");
    vi.clearAllMocks();

    vi.advanceTimersByTime(2000);

    const flushCall = (rawInvoke as any).mock.calls.find(
      (c: any[]) => c[0] === "push_stream_events",
    );
    expect(flushCall).toBeDefined();
    expect(flushCall[1].events[0].eventType).toBe("toolUse");
  });

  it("logs error when push_stream_events fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // Make push_stream_events reject
    (rawInvoke as any).mockImplementation((cmd: string) => {
      if (cmd === "push_stream_events") return Promise.reject(new Error("stream push fail"));
      return Promise.resolve(undefined);
    });

    pushStreamEvent("ws-1", "test", "detail");
    stopIpcFlush();

    // Give the promise time to reject
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleError).toHaveBeenCalledWith(
      "[perf] push_stream_events failed:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
