import { create } from "zustand";
import { getUsageData, type UsageDataPoint } from "../lib/tauri";

export type TimePeriod = "today" | "7d" | "30d" | "all";

export interface UsageSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalTurns: number;
  totalDurationMs: number;
}

export interface WorkspaceUsage {
  workspaceId: string;
  workspaceName: string;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  lastActivity: string;
}

export interface DailyUsage {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface UsageStore {
  dataPoints: UsageDataPoint[];
  loading: boolean;
  error: string | null;
  timePeriod: TimePeriod;
  selectedWorkspaceId: string | null;

  setTimePeriod: (period: TimePeriod) => void;
  setSelectedWorkspace: (workspaceId: string | null) => void;
  fetchUsageData: () => Promise<void>;
}

function computeSince(period: TimePeriod): string | undefined {
  if (period === "all") return undefined;
  const now = new Date();
  if (period === "today") {
    now.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    now.setDate(now.getDate() - 7);
  } else if (period === "30d") {
    now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
}

/**
 * Data points have cumulative session totals. Group by workspace and
 * compute per-message deltas, then aggregate into daily buckets.
 */
export function computeTimeSeries(dataPoints: UsageDataPoint[]): DailyUsage[] {
  const dailyMap = new Map<string, DailyUsage>();

  // Group by workspace to compute deltas within each workspace
  const byWorkspace = new Map<string, UsageDataPoint[]>();
  for (const dp of dataPoints) {
    const list = byWorkspace.get(dp.workspaceId) ?? [];
    list.push(dp);
    byWorkspace.set(dp.workspaceId, list);
  }

  for (const points of byWorkspace.values()) {
    let prevCost = 0;
    let prevInput = 0;
    let prevOutput = 0;
    let prevCacheRead = 0;
    let prevCacheCreate = 0;

    for (const dp of points) {
      const deltaCost = Math.max(0, dp.totalCostUsd - prevCost);
      const deltaInput = Math.max(0, dp.inputTokens - prevInput);
      const deltaOutput = Math.max(0, dp.outputTokens - prevOutput);
      const deltaCacheRead = Math.max(0, dp.cacheReadTokens - prevCacheRead);
      const deltaCacheCreate = Math.max(0, dp.cacheCreationTokens - prevCacheCreate);

      prevCost = dp.totalCostUsd;
      prevInput = dp.inputTokens;
      prevOutput = dp.outputTokens;
      prevCacheRead = dp.cacheReadTokens;
      prevCacheCreate = dp.cacheCreationTokens;

      const date = dp.timestamp.slice(0, 10); // "YYYY-MM-DD"
      const existing = dailyMap.get(date);
      if (existing) {
        existing.costUsd += deltaCost;
        existing.inputTokens += deltaInput;
        existing.outputTokens += deltaOutput;
        existing.cacheReadTokens += deltaCacheRead;
        existing.cacheCreationTokens += deltaCacheCreate;
      } else {
        dailyMap.set(date, {
          date,
          costUsd: deltaCost,
          inputTokens: deltaInput,
          outputTokens: deltaOutput,
          cacheReadTokens: deltaCacheRead,
          cacheCreationTokens: deltaCacheCreate,
        });
      }
    }
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function computeSummary(dataPoints: UsageDataPoint[]): UsageSummary {
  // For each workspace, take the last data point (cumulative session total)
  const lastByWorkspace = new Map<string, UsageDataPoint>();
  for (const dp of dataPoints) {
    lastByWorkspace.set(dp.workspaceId, dp);
  }

  const summary: UsageSummary = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalTurns: 0,
    totalDurationMs: 0,
  };

  for (const dp of lastByWorkspace.values()) {
    summary.totalCostUsd += dp.totalCostUsd;
    summary.totalInputTokens += dp.inputTokens;
    summary.totalOutputTokens += dp.outputTokens;
    summary.totalCacheReadTokens += dp.cacheReadTokens;
    summary.totalCacheCreationTokens += dp.cacheCreationTokens;
    summary.totalTurns += dp.numTurns;
    summary.totalDurationMs += dp.durationMs;
  }

  return summary;
}

export function computeWorkspaceBreakdown(dataPoints: UsageDataPoint[]): WorkspaceUsage[] {
  const lastByWorkspace = new Map<string, UsageDataPoint>();
  for (const dp of dataPoints) {
    lastByWorkspace.set(dp.workspaceId, dp);
  }

  return Array.from(lastByWorkspace.values())
    .map((dp) => ({
      workspaceId: dp.workspaceId,
      workspaceName: dp.workspaceName,
      totalCostUsd: dp.totalCostUsd,
      inputTokens: dp.inputTokens,
      outputTokens: dp.outputTokens,
      turns: dp.numTurns,
      lastActivity: dp.timestamp,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export const useUsageStore = create<UsageStore>((set, get) => ({
  dataPoints: [],
  loading: false,
  error: null,
  timePeriod: "30d",
  selectedWorkspaceId: null,

  setTimePeriod: (period) => {
    set({ timePeriod: period });
    get().fetchUsageData();
  },

  setSelectedWorkspace: (workspaceId) => {
    set({ selectedWorkspaceId: workspaceId });
    get().fetchUsageData();
  },

  fetchUsageData: async () => {
    const { timePeriod, selectedWorkspaceId } = get();
    set({ loading: true, error: null });

    try {
      const since = computeSince(timePeriod);
      const data = await getUsageData(
        selectedWorkspaceId ?? undefined,
        since,
      );
      set({ dataPoints: data, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },
}));
