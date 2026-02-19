import type { Repository, WorkspaceInfo } from "../../lib/tauri";
import { isMac } from "../../lib/keybindings";
import { useAgentStore } from "../../stores/agentStore";

interface Props {
  activeWs: WorkspaceInfo | undefined;
  activeRepo: Repository | undefined;
  onOpenSettings: () => void;
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

export function TopBar({ activeWs, activeRepo, onOpenSettings }: Props) {
  return (
    <div
      className="flex items-center gap-2 py-1.5 pr-3 text-xs"
      style={{
        paddingLeft: isMac ? 80 : 16,
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
            className="rounded px-1.5 py-0.5"
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
        <span className="font-semibold">Missoula</span>
      )}

      {/* Right side actions */}
      <button
        onClick={onOpenSettings}
        className="ml-auto rounded p-1 text-[10px] transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-muted)" }}
        title="Settings"
      >
        &#9881;
      </button>
    </div>
  );
}
