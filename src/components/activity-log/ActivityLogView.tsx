import { useEffect, useMemo, useState } from "react";
import {
  GitCommit,
  Bot,
  User,
  MessageSquare,
  Terminal,
  CheckCircle,
  XCircle,
  GitMerge,
  AlertTriangle,
  CheckCheck,
  Filter,
  RefreshCw,
  Activity,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import {
  useActivityLogStore,
  type ActivityType,
  type ActivityEntry,
} from "../../stores/activityLogStore";

const typeIcons: Record<ActivityType, typeof Bot> = {
  "commit": GitCommit,
  "agent-started": Bot,
  "agent-completed": Bot,
  "chat-user": User,
  "chat-agent": MessageSquare,
  "script-started": Terminal,
  "script-succeeded": CheckCircle,
  "script-failed": XCircle,
  "pr-opened": GitCommit,
  "pr-checks-pass": CheckCircle,
  "pr-checks-fail": XCircle,
  "pr-merged": GitMerge,
  "merge-conflict-detected": AlertTriangle,
  "merge-conflict-resolved": CheckCheck,
};

const typeColors: Record<ActivityType, string> = {
  "commit": "var(--accent)",
  "agent-started": "var(--accent-purple)",
  "agent-completed": "var(--accent)",
  "chat-user": "var(--text-secondary)",
  "chat-agent": "var(--accent-purple)",
  "script-started": "var(--text-secondary)",
  "script-succeeded": "var(--success)",
  "script-failed": "var(--error)",
  "pr-opened": "var(--accent)",
  "pr-checks-pass": "var(--success)",
  "pr-checks-fail": "var(--error)",
  "pr-merged": "var(--accent-purple)",
  "merge-conflict-detected": "var(--warning)",
  "merge-conflict-resolved": "var(--success)",
};

const FILTER_CATEGORIES: { label: string; types: ActivityType[] }[] = [
  { label: "Commits", types: ["commit"] },
  { label: "Agent", types: ["agent-started", "agent-completed"] },
  { label: "Chat", types: ["chat-user", "chat-agent"] },
  { label: "Scripts", types: ["script-started", "script-succeeded", "script-failed"] },
  { label: "PRs", types: ["pr-opened", "pr-checks-pass", "pr-checks-fail", "pr-merged"] },
  { label: "Merge", types: ["merge-conflict-detected", "merge-conflict-resolved"] },
];

function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TimeGroup {
  label: string;
  items: ActivityEntry[];
}

function groupByTime(entries: ActivityEntry[]): TimeGroup[] {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, ActivityEntry[]> = {};
  for (const e of entries) {
    let label: string;
    if (now - e.timestamp < 5 * 60 * 1000) label = "Just now";
    else if (e.timestamp >= today.getTime()) label = "Today";
    else if (e.timestamp >= yesterday.getTime()) label = "Yesterday";
    else label = "Earlier";
    (groups[label] ??= []).push(e);
  }

  return ["Just now", "Today", "Yesterday", "Earlier"]
    .filter((l) => groups[l]?.length)
    .map((label) => ({ label, items: groups[label] }));
}

export function ActivityLogView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const entries = useActivityLogStore((s) => s.entries);
  const commitEntries = useActivityLogStore((s) => s.commitEntries);
  const activeFilters = useActivityLogStore((s) => s.activeFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Load commits on mount and when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      useActivityLogStore.getState().loadCommits(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const filteredEntries = useMemo(
    () => useActivityLogStore.getState().getFilteredEntries(activeWorkspaceId ?? undefined),
    [entries, commitEntries, activeFilters, activeWorkspaceId],
  );

  const groups = useMemo(() => groupByTime(filteredEntries), [filteredEntries]);

  const isCategoryActive = (types: ActivityType[]) => {
    if (activeFilters.size === 0) return false;
    return types.every((t) => activeFilters.has(t));
  };

  const toggleCategory = (types: ActivityType[]) => {
    const allActive = types.every((t) => activeFilters.has(t));
    for (const t of types) {
      if (allActive) {
        if (activeFilters.has(t)) useActivityLogStore.getState().toggleFilter(t);
      } else {
        if (!activeFilters.has(t)) useActivityLogStore.getState().toggleFilter(t);
      }
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Activity className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <span
          className="flex-1 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Activity
        </span>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="rounded p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: showFilters ? "var(--accent)" : "var(--text-muted)" }}
          data-testid="filter-toggle"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            if (activeWorkspaceId) {
              useActivityLogStore.getState().loadCommits(activeWorkspaceId);
            }
          }}
          className="rounded p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
          data-testid="refresh-button"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div
          className="flex flex-wrap gap-1.5 px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
          data-testid="filter-bar"
        >
          {FILTER_CATEGORIES.map((cat) => {
            const active = isCategoryActive(cat.types);
            return (
              <button
                key={cat.label}
                onClick={() => toggleCategory(cat.types)}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? "var(--accent)" : "var(--bg-surface)",
                  color: active ? "#fff" : "var(--text-secondary)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {cat.label}
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button
              onClick={() => useActivityLogStore.getState().clearFilters()}
              className="rounded-full px-2.5 py-1 text-xs transition-colors hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 py-16 text-sm"
            style={{ color: "var(--text-muted)" }}
            data-testid="empty-state"
          >
            <Activity className="h-8 w-8 opacity-30" />
            <span>No activity yet</span>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div
                className="px-4 py-1.5 text-xs font-medium"
                style={{
                  color: "var(--text-muted)",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                {group.label}
              </div>
              {group.items.map((entry) => {
                const Icon = typeIcons[entry.type];
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-4 py-2.5"
                    style={{ borderBottom: "1px solid var(--border)" }}
                    data-testid="activity-entry"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center pt-0.5">
                      <Icon
                        className="h-4 w-4 flex-shrink-0"
                        style={{ color: typeColors[entry.type] }}
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {entry.title}
                        </span>
                        <span
                          className="flex-shrink-0 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {relativeTime(entry.timestamp)}
                        </span>
                      </div>
                      <div
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {entry.message}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
