const TYPE_COLORS: Record<string, string> = {
  Bug: "var(--error)",
  Task: "var(--warning)",
  "User Story": "var(--success)",
  Feature: "#a855f7",
  Epic: "#f97316",
};

export function WorkItemBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {type}
    </span>
  );
}
