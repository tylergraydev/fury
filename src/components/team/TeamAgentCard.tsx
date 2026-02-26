import { GitBranch, Square } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import type { WorkspaceInfo, ChatMessage } from "../../lib/tauri";

const EMPTY_MESSAGES: ChatMessage[] = [];

function getLastAssistantPreview(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const textBlocks = messages[i].content.filter(
        (b): b is { type: "text"; text: string } => b.type === "text",
      );
      if (textBlocks.length > 0) {
        return textBlocks.map((b) => b.text).join("").slice(0, 120);
      }
    }
  }
  return "";
}

export function TeamAgentCard({ workspace }: { workspace: WorkspaceInfo }) {
  const agentStatus = useAgentStore((s) => s.agents[workspace.id]?.status ?? "Idle");
  const streamingText = useChatStore((s) => s.streamingText[workspace.id] ?? "");
  const messages = useChatStore((s) => s.messages[workspace.id] ?? EMPTY_MESSAGES);
  const stats = useChatStore((s) => s.sessionStats[workspace.id]);

  const isRunning = agentStatus === "Running";
  const isStopping = agentStatus === "Stopping";
  const isError = typeof agentStatus === "object" && "Error" in agentStatus;

  const previewText =
    isRunning && streamingText
      ? streamingText.slice(0, 120)
      : getLastAssistantPreview(messages);

  const handleClick = () => {
    useWorkspaceStore.getState().setActive(workspace.id);
    useUIStore.getState().setActiveViewTab("chat");
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    useAgentStore.getState().stopAgent(workspace.id);
  };

  const dotColor = isRunning || isStopping
    ? "var(--success)"
    : isError
      ? "var(--error)"
      : "var(--text-muted)";

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer rounded-lg p-3 transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        border: `1px solid ${isRunning ? "var(--success)" : isError ? "var(--error)" : "var(--border)"}`,
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      {/* Header: dot + name + stop button */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        <span
          className="flex-1 truncate text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {workspace.name}
        </span>
        {(isRunning || isStopping) && (
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="rounded p-1 hover:bg-[var(--bg-surface)]"
            style={{ color: "var(--text-muted)" }}
            title="Stop agent"
          >
            <Square className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Branch */}
      <div
        className="mt-1 flex items-center gap-1.5 pl-[18px] text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <GitBranch className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{workspace.branch}</span>
      </div>

      {/* Error message */}
      {isError && (
        <p
          className="mt-2 line-clamp-2 pl-[18px] text-xs"
          style={{ color: "var(--error)" }}
        >
          {(agentStatus as { Error: string }).Error}
        </p>
      )}

      {/* Preview text */}
      {previewText && !isError && (
        <p
          className="mt-2 line-clamp-2 pl-[18px] text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {previewText}
        </p>
      )}

      {/* Stats */}
      {stats && stats.numTurns > 0 && (
        <div
          className="mt-2 flex gap-3 pl-[18px] text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {stats.totalCostUsd > 0 && (
            <span>${stats.totalCostUsd.toFixed(4)}</span>
          )}
          <span>{stats.numTurns} turns</span>
        </div>
      )}
    </div>
  );
}
