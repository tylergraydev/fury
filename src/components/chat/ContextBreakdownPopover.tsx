import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { X } from "lucide-react";
import { formatTokens, formatCost } from "../../lib/format";
import { useThemeColors } from "../../hooks/useThemeColors";
import { useChatStore } from "../../stores/chatStore";
import type { SessionStats } from "../../stores/chatStore";
import type { ChatMessage } from "../../lib/tauri";
import { CONTEXT_WINDOW_TOKENS } from "./ContextUsageIndicator";

// ---------------------------------------------------------------------------
// Per-turn delta computation
// ---------------------------------------------------------------------------

export interface TurnDelta {
  turn: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export function computeTurnDeltas(messages: ChatMessage[]): TurnDelta[] {
  const assistantMsgs = messages.filter(
    (m) => m.role === "assistant" && m.metadata,
  );

  return assistantMsgs.map((msg, i) => {
    const curr = msg.metadata!;
    const prev = i > 0 ? assistantMsgs[i - 1].metadata! : null;
    return {
      turn: i + 1,
      inputTokens: Math.max(0, (curr.inputTokens ?? 0) - (prev?.inputTokens ?? 0)),
      outputTokens: Math.max(0, (curr.outputTokens ?? 0) - (prev?.outputTokens ?? 0)),
      cacheReadTokens: Math.max(0, (curr.cacheReadTokens ?? 0) - (prev?.cacheReadTokens ?? 0)),
    };
  });
}

// ---------------------------------------------------------------------------
// Custom bar chart tooltip
// ---------------------------------------------------------------------------

interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
}

function BarTooltipContent({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md px-2 py-1.5 shadow-lg"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        fontSize: "10px",
      }}
    >
      <div className="mb-1 font-medium" style={{ color: "var(--text-primary)" }}>
        Turn {label}
      </div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span style={{ color: "var(--text-muted)" }}>{entry.name}</span>
          <span className="ml-auto" style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
            {formatTokens(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut center label
// ---------------------------------------------------------------------------

function DonutCenterLabel({ pct }: { pct: number }) {
  return (
    <g>
      <text
        x={60}
        y={56}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: "18px", fontWeight: 700, fill: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
      >
        {pct.toFixed(0)}%
      </text>
      <text
        x={60}
        y={74}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: "10px", fill: "var(--text-muted)" }}
      >
        used
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Legend dot
// ---------------------------------------------------------------------------

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats grid
// ---------------------------------------------------------------------------

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>{label}</span>
      <span
        style={{
          color: "var(--text-primary)",
          fontSize: "12px",
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main popover
// ---------------------------------------------------------------------------

interface ContextBreakdownPopoverProps {
  stats: SessionStats;
  workspaceId: string;
  onClose: () => void;
}

export function ContextBreakdownPopover({ stats, workspaceId, onClose }: ContextBreakdownPopoverProps) {
  const colors = useThemeColors();
  const messages = useChatStore((s) => s.messages[workspaceId] ?? []);
  const [visible, setVisible] = useState(false);

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // ---- Donut data ----
  const pct = Math.min(100, (stats.totalInputTokens / CONTEXT_WINDOW_TOKENS) * 100);
  const cached = stats.totalCacheReadTokens ?? 0;
  const freshInput = Math.max(0, stats.totalInputTokens - cached);
  const remaining = Math.max(0, CONTEXT_WINDOW_TOKENS - stats.totalInputTokens);

  const donutData = useMemo(
    () => [
      { name: "Fresh input", value: freshInput, color: colors.accent },
      { name: "Cached", value: cached, color: colors.success },
      { name: "Available", value: remaining, color: colors.bgHover },
    ],
    [freshInput, cached, remaining, colors.accent, colors.success, colors.bgHover],
  );

  // ---- Per-turn bar data ----
  const turnDeltas = useMemo(() => {
    const deltas = computeTurnDeltas(messages);
    // Show last 15 turns max
    return deltas.length > 15 ? deltas.slice(-15) : deltas;
  }, [messages]);

  // ---- Derived stats ----
  const cacheHitRate =
    stats.totalInputTokens > 0
      ? ((cached / stats.totalInputTokens) * 100).toFixed(0)
      : "0";
  const cacheCreated = stats.totalCacheCreationTokens ?? 0;

  return (
    <div
      data-testid="context-breakdown-popover"
      className="absolute bottom-full right-0 z-30 mb-2 w-80 rounded-lg shadow-lg overflow-hidden"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: 600 }}>
          Context Breakdown
        </span>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:opacity-80 cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close context breakdown"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Donut section */}
      <div className="flex flex-col items-center px-3 pt-3 pb-2">
        <PieChart width={120} height={120}>
          <Pie
            data={donutData}
            innerRadius={36}
            outerRadius={52}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {donutData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <DonutCenterLabel pct={pct} />
        </PieChart>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-1">
          <LegendItem color={colors.accent} label="Fresh input" />
          <LegendItem color={colors.success} label="Cached" />
          <LegendItem color={colors.bgHover} label="Available" />
        </div>
      </div>

      {/* Per-turn bar chart */}
      {turnDeltas.length > 1 && (
        <div
          className="px-3 pt-2 pb-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
            Tokens per turn
          </span>
          <div className="mt-1" style={{ height: 100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={turnDeltas} barCategoryGap="20%">
                <XAxis
                  dataKey="turn"
                  tick={{ fill: colors.textMuted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.textMuted, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatTokens(v)}
                  width={36}
                />
                <Tooltip content={<BarTooltipContent />} cursor={false} />
                <Bar dataKey="inputTokens" name="Input" stackId="a" fill={colors.accent} radius={[0, 0, 0, 0]} />
                <Bar dataKey="outputTokens" name="Output" stackId="a" fill={colors.success} radius={[0, 0, 0, 0]} />
                <Bar dataKey="cacheReadTokens" name="Cache read" stackId="a" fill={colors.warning} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div
        className="grid grid-cols-3 gap-x-3 gap-y-2 px-3 py-2.5"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <StatCell
          label="Context"
          value={`${formatTokens(stats.totalInputTokens)} / ${formatTokens(CONTEXT_WINDOW_TOKENS)}`}
        />
        <StatCell label="Output" value={formatTokens(stats.totalOutputTokens)} />
        <StatCell label="Cache hit" value={`${cacheHitRate}%`} />
        <StatCell label="Cache created" value={formatTokens(cacheCreated)} />
        <StatCell label="Turns" value={String(stats.numTurns)} />
        <StatCell label="Cost" value={formatCost(stats.totalCostUsd)} />
      </div>
    </div>
  );
}
