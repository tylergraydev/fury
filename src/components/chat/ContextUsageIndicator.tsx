import { useState } from "react";
import { formatTokens, formatCost } from "../../lib/format";
import type { SessionStats } from "../../stores/chatStore";

export const CONTEXT_WINDOW_TOKENS = 200_000;

function ContextTooltip({ stats, pct, color }: {
  stats: SessionStats;
  pct: number;
  color: string;
}) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Context",
      value: `${formatTokens(stats.totalInputTokens)} / ${formatTokens(CONTEXT_WINDOW_TOKENS)} (${pct.toFixed(0)}%)`,
    },
    {
      label: "Output",
      value: formatTokens(stats.totalOutputTokens),
    },
  ];

  if (stats.totalCacheReadTokens && stats.totalCacheReadTokens > 0) {
    rows.push({ label: "Cache read", value: formatTokens(stats.totalCacheReadTokens) });
  }

  rows.push(
    { label: "Turns", value: String(stats.numTurns) },
    { label: "Cost", value: formatCost(stats.totalCostUsd) },
  );

  return (
    <div
      className="absolute bottom-full right-0 z-30 mb-2 rounded-lg shadow-lg"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        padding: "8px 12px",
        minWidth: "180px",
        fontSize: "11px",
      }}
    >
      <div
        className="mb-2 h-1 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-hover)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
          <span style={{ color: "var(--text-primary)" }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ContextUsageIndicator({ stats }: { stats: SessionStats }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const pct = Math.min(100, (stats.totalInputTokens / CONTEXT_WINDOW_TOKENS) * 100);
  const isWarning = pct >= 75;
  const isCritical = pct >= 90;

  let color = "var(--text-muted)";
  if (isCritical) color = "var(--error)";
  else if (isWarning) color = "var(--accent-orange)";

  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct / 100);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className="flex items-center justify-center cursor-default"
        style={{ width: 24, height: 24 }}
        aria-label={`Context usage: ${pct.toFixed(0)}%`}
      >
        <svg width={24} height={24} viewBox="0 0 24 24">
          <circle
            cx={12} cy={12} r={radius}
            fill="none"
            stroke="var(--bg-hover)"
            strokeWidth={3}
          />
          <circle
            cx={12} cy={12} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 12 12)"
            style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease" }}
          />
        </svg>
      </div>
      {showTooltip && <ContextTooltip stats={stats} pct={pct} color={color} />}
    </div>
  );
}
