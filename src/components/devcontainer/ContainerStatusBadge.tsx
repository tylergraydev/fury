import { useDevContainerStore } from "../../stores/devContainerStore";
import type { ContainerStatus } from "../../lib/tauri";

function getStatusColor(status: ContainerStatus): string {
  if (status === "running") return "var(--success)";
  if (status === "building") return "var(--warning)";
  if (status === "stopped") return "var(--text-tertiary)";
  if (status === "none") return "transparent";
  if (typeof status === "object" && "error" in status) return "var(--error)";
  return "transparent";
}

function getStatusLabel(status: ContainerStatus): string {
  if (typeof status === "object" && "error" in status) return "Error";
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

interface ContainerStatusBadgeProps {
  workspaceId: string;
}

export function ContainerStatusBadge({
  workspaceId,
}: ContainerStatusBadgeProps) {
  const containerState = useDevContainerStore(
    (s) => s.containerStates[workspaceId],
  );

  if (!containerState || containerState.status === "none") {
    return null;
  }

  const color = getStatusColor(containerState.status);
  const label = getStatusLabel(containerState.status);

  return (
    <span
      title={`Container: ${label}`}
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: "var(--text-secondary)" }}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}
