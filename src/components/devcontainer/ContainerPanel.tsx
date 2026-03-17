import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDevContainerStore } from "../../stores/devContainerStore";
import type { ContainerStatus, ContainerStatusEvent } from "../../lib/tauri";

interface ContainerPanelProps {
  workspaceId: string;
}

function statusLabel(status: ContainerStatus): string {
  if (typeof status === "object" && "error" in status)
    return `Error: ${status.error}`;
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

export function ContainerPanel({ workspaceId }: ContainerPanelProps) {
  const containerState = useDevContainerStore(
    (s) => s.containerStates[workspaceId],
  );
  const loading = useDevContainerStore((s) => s.loading[workspaceId]);
  const error = useDevContainerStore((s) => s.error[workspaceId]);
  const fetchStatus = useDevContainerStore((s) => s.fetchStatus);
  const start = useDevContainerStore((s) => s.start);
  const stop = useDevContainerStore((s) => s.stop);
  const rebuild = useDevContainerStore((s) => s.rebuild);
  const handleStatusEvent = useDevContainerStore(
    (s) => s.handleStatusEvent,
  );

  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    fetchStatus(workspaceId);
  }, [workspaceId, fetchStatus]);

  // Listen for container status events
  useEffect(() => {
    const unlisten = listen<ContainerStatusEvent>(
      `container-status:${workspaceId}`,
      (event) => {
        handleStatusEvent(
          event.payload.workspaceId,
          event.payload.status,
          event.payload.containerId,
        );
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workspaceId, handleStatusEvent]);

  // Listen for container log events
  useEffect(() => {
    const unlisten = listen<string>(
      `container-log:${workspaceId}`,
      (event) => {
        setLogs((prev) => [...prev.slice(-99), event.payload]);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workspaceId]);

  const status = containerState?.status ?? "none";
  const isRunning = status === "running";
  const isBuilding = status === "building";
  const disableActions = !!loading;
  const disableRebuild = disableActions || isBuilding;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Dev Container
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {statusLabel(status)}
        </span>
      </div>

      {error && (
        <div
          className="rounded px-3 py-2 text-xs break-words"
          style={{
            backgroundColor: "var(--error-bg)",
            color: "var(--error)",
            border: "1px solid var(--error-border)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {!isRunning && !isBuilding && (
          <button
            onClick={() => start(workspaceId)}
            disabled={disableActions}
            className="rounded px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
            }}
          >
            {loading ? "Starting..." : "Start"}
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => stop(workspaceId)}
            disabled={disableActions}
            className="rounded px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
            }}
          >
            Stop
          </button>
        )}
        <button
          onClick={() => rebuild(workspaceId)}
          disabled={disableRebuild}
          className="rounded px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
          }}
        >
          Rebuild
        </button>
      </div>

      {containerState?.containerId && (
        <div
          className="text-[11px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Container: {containerState.containerId.substring(0, 12)}
        </div>
      )}

      {logs.length > 0 && (
        <div
          className="max-h-[200px] overflow-auto rounded p-2 font-mono text-[11px]"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
          }}
        >
          {logs.map((line, i) => (
            <div key={i} className="break-all">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
