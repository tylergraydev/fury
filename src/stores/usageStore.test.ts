import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getUsageData: vi.fn(),
}));

import {
  useUsageStore,
  computeTimeSeries,
  computeSummary,
  computeWorkspaceBreakdown,
} from "./usageStore";
import { getUsageData } from "../lib/tauri";
import type { UsageDataPoint } from "../lib/tauri";

function makeDataPoint(overrides: Partial<UsageDataPoint> = {}): UsageDataPoint {
  return {
    workspaceId: "ws-1",
    workspaceName: "My Workspace",
    timestamp: "2025-03-15T10:00:00Z",
    totalCostUsd: 0.05,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheCreationTokens: 100,
    numTurns: 1,
    durationMs: 3000,
    ...overrides,
  };
}

beforeEach(() => {
  useUsageStore.setState({
    dataPoints: [],
    loading: false,
    error: null,
    timePeriod: "30d",
    selectedWorkspaceId: null,
  });
  vi.clearAllMocks();
});

describe("usageStore", () => {
  describe("fetchUsageData", () => {
    it("sets loading and then resolves with data", async () => {
      const data = [makeDataPoint()];
      vi.mocked(getUsageData).mockResolvedValue(data);

      await useUsageStore.getState().fetchUsageData();

      expect(getUsageData).toHaveBeenCalled();
      const state = useUsageStore.getState();
      expect(state.loading).toBe(false);
      expect(state.dataPoints).toEqual(data);
      expect(state.error).toBeNull();
    });

    it("sets error on failure", async () => {
      vi.mocked(getUsageData).mockRejectedValue(new Error("DB error"));

      await useUsageStore.getState().fetchUsageData();

      const state = useUsageStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Error: DB error");
      expect(state.dataPoints).toEqual([]);
    });

    it("passes workspace filter to getUsageData", async () => {
      vi.mocked(getUsageData).mockResolvedValue([]);
      useUsageStore.setState({ selectedWorkspaceId: "ws-abc" });

      await useUsageStore.getState().fetchUsageData();

      expect(getUsageData).toHaveBeenCalledWith(
        "ws-abc",
        expect.any(String),
      );
    });

    it("passes undefined workspace when no filter selected", async () => {
      vi.mocked(getUsageData).mockResolvedValue([]);

      await useUsageStore.getState().fetchUsageData();

      expect(getUsageData).toHaveBeenCalledWith(
        undefined,
        expect.any(String),
      );
    });
  });

  describe("setTimePeriod", () => {
    it("updates timePeriod and refetches", async () => {
      vi.mocked(getUsageData).mockResolvedValue([]);
      useUsageStore.getState().setTimePeriod("7d");

      expect(useUsageStore.getState().timePeriod).toBe("7d");
      // fetchUsageData is called asynchronously
      await vi.waitFor(() => {
        expect(getUsageData).toHaveBeenCalled();
      });
    });
  });

  describe("setSelectedWorkspace", () => {
    it("updates selectedWorkspaceId and refetches", async () => {
      vi.mocked(getUsageData).mockResolvedValue([]);
      useUsageStore.getState().setSelectedWorkspace("ws-2");

      expect(useUsageStore.getState().selectedWorkspaceId).toBe("ws-2");
      await vi.waitFor(() => {
        expect(getUsageData).toHaveBeenCalled();
      });
    });

    it("clears selectedWorkspaceId with null", async () => {
      vi.mocked(getUsageData).mockResolvedValue([]);
      useUsageStore.setState({ selectedWorkspaceId: "ws-2" });
      useUsageStore.getState().setSelectedWorkspace(null);

      expect(useUsageStore.getState().selectedWorkspaceId).toBeNull();
    });
  });
});

describe("computeTimeSeries", () => {
  it("returns empty array for no data", () => {
    expect(computeTimeSeries([])).toEqual([]);
  });

  it("computes deltas for a single workspace", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheCreationTokens: 100,
      }),
      makeDataPoint({
        timestamp: "2025-03-15T12:00:00Z",
        totalCostUsd: 0.10,
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 400,
        cacheCreationTokens: 200,
      }),
    ];

    const result = computeTimeSeries(points);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-03-15");
    // First point: delta from 0 = 0.05; second: 0.10 - 0.05 = 0.05; total = 0.10
    expect(result[0].costUsd).toBeCloseTo(0.10);
    expect(result[0].inputTokens).toBe(2000);
    expect(result[0].outputTokens).toBe(1000);
  });

  it("groups by day across multiple days", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        timestamp: "2025-03-14T10:00:00Z",
        totalCostUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
      makeDataPoint({
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.10,
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ];

    const result = computeTimeSeries(points);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-03-14");
    expect(result[1].date).toBe("2025-03-15");
  });

  it("handles multiple workspaces independently", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        workspaceId: "ws-1",
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
      makeDataPoint({
        workspaceId: "ws-2",
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.03,
        inputTokens: 800,
        outputTokens: 300,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ];

    const result = computeTimeSeries(points);
    expect(result).toHaveLength(1);
    // Both workspaces start from 0, so deltas equal their values
    expect(result[0].costUsd).toBeCloseTo(0.08);
    expect(result[0].inputTokens).toBe(1800);
    expect(result[0].outputTokens).toBe(800);
  });

  it("clamps negative deltas to 0", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.10,
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
      // A data point with lower cumulative (session reset)
      makeDataPoint({
        timestamp: "2025-03-15T12:00:00Z",
        totalCostUsd: 0.02,
        inputTokens: 500,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ];

    const result = computeTimeSeries(points);
    // First point delta: 0.10 from 0; second delta: max(0, 0.02-0.10) = 0
    expect(result[0].costUsd).toBeCloseTo(0.10);
    expect(result[0].inputTokens).toBe(2000);
  });

  it("returns sorted by date", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        workspaceId: "ws-2",
        timestamp: "2025-03-16T10:00:00Z",
        totalCostUsd: 0.05,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
      makeDataPoint({
        workspaceId: "ws-1",
        timestamp: "2025-03-14T10:00:00Z",
        totalCostUsd: 0.03,
        inputTokens: 80,
        outputTokens: 30,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ];

    const result = computeTimeSeries(points);
    expect(result[0].date).toBe("2025-03-14");
    expect(result[1].date).toBe("2025-03-16");
  });
});

describe("computeSummary", () => {
  it("returns zeros for no data", () => {
    const summary = computeSummary([]);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalTurns).toBe(0);
    expect(summary.totalDurationMs).toBe(0);
  });

  it("uses last data point per workspace for cumulative totals", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        workspaceId: "ws-1",
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        numTurns: 2,
        durationMs: 3000,
      }),
      makeDataPoint({
        workspaceId: "ws-1",
        timestamp: "2025-03-15T12:00:00Z",
        totalCostUsd: 0.10,
        inputTokens: 2000,
        outputTokens: 1000,
        numTurns: 4,
        durationMs: 6000,
      }),
    ];

    const summary = computeSummary(points);
    // Should use last point (0.10, 2000, 1000, 4, 6000)
    expect(summary.totalCostUsd).toBeCloseTo(0.10);
    expect(summary.totalInputTokens).toBe(2000);
    expect(summary.totalOutputTokens).toBe(1000);
    expect(summary.totalTurns).toBe(4);
    expect(summary.totalDurationMs).toBe(6000);
  });

  it("sums across workspaces", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        workspaceId: "ws-1",
        totalCostUsd: 0.10,
        inputTokens: 2000,
        outputTokens: 1000,
        numTurns: 4,
        durationMs: 5000,
      }),
      makeDataPoint({
        workspaceId: "ws-2",
        totalCostUsd: 0.20,
        inputTokens: 3000,
        outputTokens: 1500,
        numTurns: 6,
        durationMs: 8000,
      }),
    ];

    const summary = computeSummary(points);
    expect(summary.totalCostUsd).toBeCloseTo(0.30);
    expect(summary.totalInputTokens).toBe(5000);
    expect(summary.totalOutputTokens).toBe(2500);
    expect(summary.totalTurns).toBe(10);
    expect(summary.totalDurationMs).toBe(13000);
  });

  it("includes cache token totals", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        cacheReadTokens: 500,
        cacheCreationTokens: 250,
      }),
    ];

    const summary = computeSummary(points);
    expect(summary.totalCacheReadTokens).toBe(500);
    expect(summary.totalCacheCreationTokens).toBe(250);
  });
});

describe("computeWorkspaceBreakdown", () => {
  it("returns empty array for no data", () => {
    expect(computeWorkspaceBreakdown([])).toEqual([]);
  });

  it("groups by workspace using last data point", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        workspaceId: "ws-1",
        workspaceName: "Alpha",
        timestamp: "2025-03-15T10:00:00Z",
        totalCostUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        numTurns: 2,
      }),
      makeDataPoint({
        workspaceId: "ws-1",
        workspaceName: "Alpha",
        timestamp: "2025-03-15T12:00:00Z",
        totalCostUsd: 0.10,
        inputTokens: 2000,
        outputTokens: 1000,
        numTurns: 4,
      }),
    ];

    const result = computeWorkspaceBreakdown(points);
    expect(result).toHaveLength(1);
    expect(result[0].workspaceId).toBe("ws-1");
    expect(result[0].workspaceName).toBe("Alpha");
    expect(result[0].totalCostUsd).toBeCloseTo(0.10);
    expect(result[0].inputTokens).toBe(2000);
    expect(result[0].turns).toBe(4);
  });

  it("sorts by cost descending", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        workspaceId: "ws-1",
        workspaceName: "Cheap",
        totalCostUsd: 0.01,
      }),
      makeDataPoint({
        workspaceId: "ws-2",
        workspaceName: "Expensive",
        totalCostUsd: 0.50,
      }),
      makeDataPoint({
        workspaceId: "ws-3",
        workspaceName: "Medium",
        totalCostUsd: 0.10,
      }),
    ];

    const result = computeWorkspaceBreakdown(points);
    expect(result[0].workspaceName).toBe("Expensive");
    expect(result[1].workspaceName).toBe("Medium");
    expect(result[2].workspaceName).toBe("Cheap");
  });

  it("includes lastActivity from timestamp", () => {
    const points: UsageDataPoint[] = [
      makeDataPoint({
        timestamp: "2025-03-15T14:30:00Z",
      }),
    ];

    const result = computeWorkspaceBreakdown(points);
    expect(result[0].lastActivity).toBe("2025-03-15T14:30:00Z");
  });
});
