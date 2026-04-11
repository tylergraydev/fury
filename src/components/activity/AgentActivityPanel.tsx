import { useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Terminal, Globe, FileText, Search, Wrench } from "lucide-react";
import {
  useAgentActivityStore,
  subscribeToAgentActivity,
  type ActivityEntry,
  type ActivityStatus,
} from "../../stores/agentActivityStore";
import type { SidebarContext } from "../../App";

const STATUS_ICON: Record<ActivityStatus, React.ReactNode> = {
  running: <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />,
  completed: <CheckCircle2 className="h-3 w-3 text-[var(--accent-green)]" />,
  error: <XCircle className="h-3 w-3 text-red-400" />,
};

function getToolIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("bash") || n.includes("shell") || n.includes("command")) return <Terminal className="h-3 w-3" />;
  if (n.includes("browser") || n.includes("navigate") || n.includes("screenshot")) return <Globe className="h-3 w-3" />;
  if (n.includes("read") || n.includes("write") || n.includes("edit") || n.includes("file")) return <FileText className="h-3 w-3" />;
  if (n.includes("grep") || n.includes("glob") || n.includes("search")) return <Search className="h-3 w-3" />;
  return <Wrench className="h-3 w-3" />;
}

function formatInput(entry: ActivityEntry): string {
  const { toolName, input } = entry;
  const n = toolName.toLowerCase();

  // Bash: show the command
  if (n.includes("bash") && input.command) return String(input.command).slice(0, 120);

  // File ops: show the path
  if (input.file_path) return String(input.file_path);
  if (input.path) return String(input.path);
  if (input.filePath) return String(input.filePath);

  // Grep/search: show pattern
  if (input.pattern) return String(input.pattern);

  // Browser: show URL or selector
  if (input.url) return String(input.url);
  if (input.selector) return String(input.selector);

  // Generic: first string value
  const firstVal = Object.values(input).find((v) => typeof v === "string" && v.length > 0);
  if (firstVal) return String(firstVal).slice(0, 80);

  return "";
}

function formatDuration(entry: ActivityEntry): string {
  if (!entry.completedAt) return "";
  const ms = entry.completedAt - entry.startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const detail = formatInput(entry);
  const duration = formatDuration(entry);

  return (
    <div
      className="flex items-start gap-2 border-b border-[var(--border)] px-2 py-1.5"
      style={{ opacity: entry.status === "completed" ? 0.7 : 1 }}
    >
      <div className="mt-0.5 flex-shrink-0">{STATUS_ICON[entry.status]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="flex-shrink-0 text-[var(--text-tertiary)]">
            {getToolIcon(entry.toolName)}
          </span>
          <span
            className="truncate text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
            title={entry.toolName}
          >
            {entry.toolName}
          </span>
          {duration && (
            <span className="flex-shrink-0 text-[10px] text-[var(--text-tertiary)]">
              {duration}
            </span>
          )}
        </div>
        {detail && (
          <p
            className="mt-0.5 truncate font-mono text-[10px]"
            style={{ color: "var(--text-muted)" }}
            title={detail}
          >
            {detail}
          </p>
        )}
        {entry.status === "error" && entry.result && (
          <p className="mt-0.5 truncate text-[10px] text-red-400" title={entry.result}>
            {entry.result}
          </p>
        )}
      </div>
    </div>
  );
}

const EMPTY_ENTRIES: ActivityEntry[] = [];

export function AgentActivityPanel({ context }: { context: SidebarContext }) {
  const entries = useAgentActivityStore((s) => s.entries[context.id] ?? EMPTY_ENTRIES);
  const clear = useAgentActivityStore((s) => s.clear);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to agent stream events
  useEffect(() => {
    return subscribeToAgentActivity(context.id);
  }, [context.id]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  const runningCount = entries.filter((e) => e.status === "running").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-[var(--border)] px-2 py-1"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Agent Activity
          </span>
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {runningCount} running
            </span>
          )}
        </div>
        {entries.length > 0 && (
          <button
            onClick={() => clear(context.id)}
            className="text-[10px] hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No agent activity yet
            </p>
          </div>
        ) : (
          entries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
