import type { Repository, WorkspaceInfo } from "../../lib/tauri";
import { isMac } from "../../lib/keybindings";
import { useAgentStore } from "../../stores/agentStore";

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
      className="flex items-center gap-2.5 px-4 py-2 text-sm"
      style={{
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
          <span style={{ color: "var(--text-muted)" }}>&gt;</span>
          <span style={{ color: "var(--text-muted)" }}>
            {activeRepo.defaultBranch}
          </span>
          <span style={{ color: "var(--text-muted)" }}>&gt;</span>
          <span
            className="rounded px-2 py-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
          >
            /{activeWs.name}
          </span>
          <AgentStatusDot contextId={activeWs.id} />
        </>
      ) : activeRepo ? (
        <>
          <span className="font-medium">{activeRepo.name}</span>
          <span style={{ color: "var(--text-muted)" }}>&gt;</span>
          <span style={{ color: "var(--text-muted)" }}>
            {activeRepo.currentBranch ?? activeRepo.defaultBranch}
          </span>
          <AgentStatusDot contextId={activeRepo.id} />
        </>
      ) : (
        <span className="font-semibold">Fury</span>
      )}
    </div>
  );
}
