import { ChevronRight, GitBranch } from "lucide-react";
import type { Repository, WorkspaceInfo } from "../../lib/tauri";
import { isMac } from "../../lib/keybindings";
import { useAgentStore } from "../../stores/agentStore";
import { NotificationBell } from "../notifications/NotificationBell";

interface Props {
  activeWs: WorkspaceInfo | undefined;
  activeRepo: Repository | undefined;
}

function AgentStatusDot({ contextId }: { contextId: string }) {
  const status = useAgentStore((s) => s.getStatus(contextId));
  const isRunning = status === "Running";
  const isError = typeof status === "object" && "Error" in status;
  const color = isRunning
    ? "var(--success)"
    : isError
      ? "var(--error)"
      : "var(--text-muted)";
  const label = isRunning
    ? "Agent running"
    : isError
      ? "Agent error"
      : "Agent idle";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
      style={{ backgroundColor: color }}
      title={label}
    />
  );
}

export function TopBar({ activeWs, activeRepo }: Props) {
  return (
    <div
      data-tauri-drag-region
      className="flex items-center gap-3 px-5 py-3 text-sm"
      style={{
        /* v8 ignore next -- @preserve */
        paddingTop: isMac ? 42 : 10,
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      {/* Breadcrumb navigation */}
      {activeWs && activeRepo ? (
        <>
          <span className="font-medium">{activeRepo.name}</span>
          <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <GitBranch className="h-3 w-3" />
            {activeRepo.defaultBranch}
          </span>
          <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          <span
            className="rounded-md px-2.5 py-1"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            /{activeWs.name}
          </span>
          <AgentStatusDot contextId={activeWs.id} />
        </>
      ) : activeRepo ? (
        <>
          <span className="font-medium">{activeRepo.name}</span>
          <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <GitBranch className="h-3 w-3" />
            {activeRepo.currentBranch ?? activeRepo.defaultBranch}
          </span>
          <AgentStatusDot contextId={activeRepo.id} />
        </>
      ) : (
        <>
          <img src="/logo.png" alt="Fury" className="h-6 w-6 rounded" />
          <span className="font-semibold">Fury</span>
        </>
      )}
      <div className="flex-1" />
      <NotificationBell />
    </div>
  );
}
