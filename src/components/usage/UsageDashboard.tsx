import { useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { RefreshCw } from "lucide-react";
import {
  useUsageStore,
  computeSummary,
  computeTimeSeries,
  computeWorkspaceBreakdown,
  type TimePeriod,
} from "../../stores/usageStore";

function useThemeColors() {
  const style = typeof document !== "undefined"
    ? getComputedStyle(document.documentElement)
    : null;
  return {
    accent: style?.getPropertyValue("--accent").trim() ?? "#3b82f6",
    success: style?.getPropertyValue("--success").trim() ?? "#4ade80",
    warning: style?.getPropertyValue("--warning").trim() ?? "#facc15",
    error: style?.getPropertyValue("--error").trim() ?? "#f87171",
    textMuted: style?.getPropertyValue("--text-muted").trim() ?? "#8b949e",
    border: style?.getPropertyValue("--border").trim() ?? "#30363d",
  };
}

function formatCost(usd: number): string {
  if (usd < 0.01 && usd > 0) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const TIME_PERIODS: { label: string; value: TimePeriod }[] = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

export function UsageDashboard() {
  const dataPoints = useUsageStore((s) => s.dataPoints);
  const loading = useUsageStore((s) => s.loading);
  const error = useUsageStore((s) => s.error);
  const timePeriod = useUsageStore((s) => s.timePeriod);
  const selectedWorkspaceId = useUsageStore((s) => s.selectedWorkspaceId);

  const colors = useThemeColors();

  useEffect(() => {
    useUsageStore.getState().fetchUsageData();
  }, []);

  const summary = useMemo(() => computeSummary(dataPoints), [dataPoints]);
  const timeSeries = useMemo(() => computeTimeSeries(dataPoints), [dataPoints]);
  const workspaceBreakdown = useMemo(
    () => computeWorkspaceBreakdown(dataPoints),
    [dataPoints],
  );

  // Get unique workspaces for filter dropdown
  const workspaces = useMemo(() => {
    const seen = new Map<string, string>();
    for (const dp of dataPoints) {
      if (!seen.has(dp.workspaceId)) {
        seen.set(dp.workspaceId, dp.workspaceName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [dataPoints]);

  const avgCostPerTurn =
    summary.totalTurns > 0
      ? summary.totalCostUsd / summary.totalTurns
      : 0;

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Time period filter */}
        <div className="flex items-center gap-1">
          {TIME_PERIODS.map((tp) => (
            <button
              key={tp.value}
              onClick={() => useUsageStore.getState().setTimePeriod(tp.value)}
              className="rounded px-2 py-1"
              style={{
                backgroundColor:
                  timePeriod === tp.value
                    ? "var(--bg-surface)"
                    : "transparent",
                color:
                  timePeriod === tp.value
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            >
              {tp.label}
            </button>
          ))}
        </div>

        {/* Workspace filter */}
        <select
          value={selectedWorkspaceId ?? ""}
          onChange={(e) =>
            useUsageStore.getState().setSelectedWorkspace(
              e.target.value || null,
            )
          }
          className="rounded px-2 py-1 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <option value="">All Workspaces</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <span
              className="animate-pulse text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              Loading...
            </span>
          )}
          <button
            onClick={() => useUsageStore.getState().fetchUsageData()}
            className="rounded p-1 hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--error) 15%, transparent)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex-1 space-y-4 p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3">
          <SummaryCard
            label="Total Cost"
            value={formatCost(summary.totalCostUsd)}
          />
          <SummaryCard
            label="Total Tokens"
            value={formatTokens(
              summary.totalInputTokens + summary.totalOutputTokens,
            )}
            subtitle={`${formatTokens(summary.totalInputTokens)} in / ${formatTokens(summary.totalOutputTokens)} out`}
          />
          <SummaryCard
            label="Total Turns"
            value={String(summary.totalTurns)}
            subtitle={formatDuration(summary.totalDurationMs)}
          />
          <SummaryCard
            label="Avg Cost / Turn"
            value={formatCost(avgCostPerTurn)}
          />
        </div>

        {/* Cost Over Time */}
        {timeSeries.length > 0 && (
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="mb-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Cost Over Time
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={timeSeries}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: colors.textMuted }}
                  axisLine={{ stroke: colors.border }}
                  tickLine={false}
                  tickFormatter={(v: string) => v.slice(5)} // "MM-DD"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: colors.textMuted }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                    color: "var(--text-primary)",
                  }}
                  formatter={(value?: number) => [
                    value !== undefined ? `$${value.toFixed(4)}` : "—",
                    "Cost",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="costUsd"
                  stroke={colors.accent}
                  fill={colors.accent}
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Token Breakdown */}
        {timeSeries.length > 0 && (
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="mb-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Token Usage by Day
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeSeries}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: colors.textMuted }}
                  axisLine={{ stroke: colors.border }}
                  tickLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: colors.textMuted }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatTokens}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                    color: "var(--text-primary)",
                  }}
                  formatter={(value?: number, name?: string) => [
                    value !== undefined ? formatTokens(value) : "—",
                    name ?? "",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10 }}
                />
                <Bar
                  dataKey="inputTokens"
                  name="Input"
                  fill={colors.accent}
                  stackId="tokens"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="outputTokens"
                  name="Output"
                  fill={colors.success}
                  stackId="tokens"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="cacheReadTokens"
                  name="Cache Read"
                  fill={colors.warning}
                  stackId="tokens"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Workspace Breakdown Table */}
        {workspaceBreakdown.length > 0 && (
          <div
            className="rounded-lg"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="px-3 py-2 text-xs"
              style={{
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Per-Workspace Breakdown
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="px-3 py-1.5 text-left font-normal">
                    Workspace
                  </th>
                  <th className="px-3 py-1.5 text-right font-normal">Cost</th>
                  <th className="px-3 py-1.5 text-right font-normal">
                    Input Tokens
                  </th>
                  <th className="px-3 py-1.5 text-right font-normal">
                    Output Tokens
                  </th>
                  <th className="px-3 py-1.5 text-right font-normal">
                    Turns
                  </th>
                </tr>
              </thead>
              <tbody>
                {workspaceBreakdown.map((ws) => (
                  <tr
                    key={ws.workspaceId}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <td className="px-3 py-1.5 truncate max-w-[200px]">
                      {ws.workspaceName}
                    </td>
                    <td
                      className="px-3 py-1.5 text-right"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatCost(ws.totalCostUsd)}
                    </td>
                    <td
                      className="px-3 py-1.5 text-right"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatTokens(ws.inputTokens)}
                    </td>
                    <td
                      className="px-3 py-1.5 text-right"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatTokens(ws.outputTokens)}
                    </td>
                    <td
                      className="px-3 py-1.5 text-right"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {ws.turns}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!loading && dataPoints.length === 0 && !error && (
          <div
            className="flex flex-col items-center justify-center gap-2 py-12 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <span>No usage data found</span>
            <span className="text-[10px]">
              Usage data is recorded as you interact with AI agents
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div
        className="mt-0.5 text-lg font-medium"
        style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
