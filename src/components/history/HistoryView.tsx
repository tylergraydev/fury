import { useEffect, useMemo, useState } from "react";
import {
  GitCommit,
  User,
  Sparkles,
  RotateCcw,
  RefreshCw,
  History,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useHistoryStore } from "../../stores/historyStore";
import { useAgentStore } from "../../stores/agentStore";
import type { GitLogEntry } from "../../lib/tauri";

type TimelineItem =
  | {
      kind: "commit";
      timestamp: number;
      data: GitLogEntry;
    }
  | {
      kind: "chat";
      timestamp: number;
      data: {
        messageId: string;
        role: "user" | "assistant";
        text: string;
        toolCount: number;
      };
    }
  | {
      kind: "checkpoint";
      timestamp: number;
      data: {
        id: string;
        turnIndex: number;
        userMessage: string;
        commitSha: string;
      };
    };

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function HistoryView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const messages = useChatStore(
    (s) => s.messages[activeWorkspaceId ?? ""] ?? [],
  );
  const checkpoints = useCheckpointStore(
    (s) => s.checkpoints[activeWorkspaceId ?? ""] ?? [],
  );
  const gitLog = useHistoryStore(
    (s) => s.gitLog[activeWorkspaceId ?? ""] ?? [],
  );
  const loading = useHistoryStore(
    (s) => s.loading[activeWorkspaceId ?? ""] ?? false,
  );
  const error = useHistoryStore(
    (s) => s.error[activeWorkspaceId ?? ""] ?? null,
  );

  useEffect(() => {
    if (!activeWorkspaceId) return;
    useHistoryStore.getState().loadGitLog(activeWorkspaceId);
    useCheckpointStore.getState().loadCheckpoints(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Git commits
    for (const commit of gitLog) {
      items.push({
        kind: "commit",
        timestamp: new Date(commit.timestamp).getTime(),
        data: commit,
      });
    }

    // Chat messages
    for (const msg of messages) {
      if (msg.role === "system") continue;
      const textBlocks = msg.content.filter((b) => b.type === "text");
      const toolUseBlocks = msg.content.filter((b) => b.type === "toolUse");
      const text = textBlocks
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n");
      items.push({
        kind: "chat",
        timestamp: msg.timestamp,
        data: {
          messageId: msg.id,
          role: msg.role as "user" | "assistant",
          text: text.length > 200 ? text.slice(0, 197) + "..." : text,
          toolCount: toolUseBlocks.length,
        },
      });
    }

    // Checkpoints
    for (const cp of checkpoints) {
      items.push({
        kind: "checkpoint",
        timestamp: new Date(cp.createdAt).getTime(),
        data: {
          id: cp.id,
          turnIndex: cp.turnIndex,
          userMessage: cp.userMessage,
          commitSha: cp.commitSha,
        },
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [gitLog, messages, checkpoints]);

  if (!activeWorkspaceId) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <History
          className="mb-4 h-12 w-12"
          style={{ color: "var(--text-muted)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Select a workspace to view history
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 text-xs font-medium"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span>Activity Timeline</span>
        <button
          onClick={() =>
            useHistoryStore.getState().loadGitLog(activeWorkspaceId)
          }
          className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mx-4 mt-2 rounded p-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--error) 15%, transparent)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && timeline.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Loading history...
            </p>
          </div>
        )}

        {timeline.map((item, i) => (
          <TimelineEntry
            key={`${item.kind}-${i}`}
            item={item}
            workspaceId={activeWorkspaceId}
            isLast={i === timeline.length - 1}
          />
        ))}

        {!loading && timeline.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8">
            <History
              className="mb-2 h-8 w-8"
              style={{ color: "var(--text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No activity yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineEntry({
  item,
  workspaceId,
  isLast,
}: {
  item: TimelineItem;
  workspaceId: string;
  isLast: boolean;
}) {
  const dotColor =
    item.kind === "commit"
      ? "var(--accent)"
      : item.kind === "checkpoint"
        ? "var(--success)"
        : item.data.role === "user"
          ? "var(--text-muted)"
          : "var(--accent-purple)";

  return (
    <div className="relative flex gap-3 pb-4 pl-6">
      {/* Vertical line */}
      {!isLast && (
        <div
          className="absolute bottom-0 left-[7px] top-0 w-px"
          style={{ backgroundColor: "var(--border)" }}
        />
      )}
      {/* Dot */}
      <div
        className="absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: dotColor,
          boxShadow: `0 0 0 2px var(--bg-primary)`,
        }}
      />
      {/* Content */}
      <div className="min-w-0 flex-1">
        {item.kind === "commit" && (
          <CommitEntry data={item.data} timestamp={item.timestamp} />
        )}
        {item.kind === "chat" && (
          <ChatEntry data={item.data} timestamp={item.timestamp} />
        )}
        {item.kind === "checkpoint" && (
          <CheckpointEntry
            data={item.data}
            timestamp={item.timestamp}
            workspaceId={workspaceId}
          />
        )}
      </div>
    </div>
  );
}

function CommitEntry({
  data,
  timestamp,
}: {
  data: GitLogEntry;
  timestamp: number;
}) {
  return (
    <div
      className="rounded border p-2 text-xs"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      <div className="flex items-center gap-2">
        <GitCommit
          className="h-3 w-3 flex-shrink-0"
          style={{ color: "var(--accent)" }}
        />
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--accent)" }}
        >
          {data.hash}
        </span>
        <span className="truncate" style={{ color: "var(--text-primary)" }}>
          {data.message}
        </span>
      </div>
      <div
        className="mt-1 flex items-center gap-2"
        style={{ color: "var(--text-muted)" }}
      >
        <span>{data.author}</span>
        <span>&middot;</span>
        <span>{formatRelativeTime(timestamp)}</span>
      </div>
    </div>
  );
}

function ChatEntry({
  data,
  timestamp,
}: {
  data: TimelineItem & { kind: "chat" } extends { data: infer D } ? D : never;
  timestamp: number;
}) {
  const isUser = data.role === "user";
  return (
    <div
      className="rounded border p-2 text-xs"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      <div className="flex items-center gap-2">
        {isUser ? (
          <User
            className="h-3 w-3 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
        ) : (
          <Sparkles
            className="h-3 w-3 flex-shrink-0"
            style={{ color: "var(--accent-purple)" }}
          />
        )}
        <span style={{ color: "var(--text-secondary)" }}>
          {isUser ? "You" : "Claude"}
        </span>
        {data.toolCount > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-muted)",
            }}
          >
            {data.toolCount} tool call{data.toolCount !== 1 ? "s" : ""}
          </span>
        )}
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          {formatRelativeTime(timestamp)}
        </span>
      </div>
      {data.text && (
        <p
          className="mt-1 truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {data.text}
        </p>
      )}
    </div>
  );
}

function CheckpointEntry({
  data,
  timestamp,
  workspaceId,
}: {
  data: TimelineItem & { kind: "checkpoint" } extends { data: infer D }
    ? D
    : never;
  timestamp: number;
  workspaceId: string;
}) {
  const [reverting, setReverting] = useState(false);
  const agentStatus = useAgentStore(
    (s) => s.agents[workspaceId]?.status ?? "Idle",
  );
  const isAgentRunning = agentStatus === "Running";

  const handleRevert = async () => {
    if (reverting || isAgentRunning) return;
    setReverting(true);
    try {
      await useCheckpointStore
        .getState()
        .revertToCheckpoint(workspaceId, data.id);
      useHistoryStore.getState().loadGitLog(workspaceId);
    } catch {
      // error handled in store
    } finally {
      setReverting(false);
    }
  };

  return (
    <div
      className="rounded border p-2 text-xs"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      <div className="flex items-center gap-2">
        <RotateCcw
          className="h-3 w-3 flex-shrink-0"
          style={{ color: "var(--success)" }}
        />
        <span style={{ color: "var(--success)" }}>
          Checkpoint #{data.turnIndex}
        </span>
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {data.commitSha.slice(0, 7)}
        </span>
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          {formatRelativeTime(timestamp)}
        </span>
      </div>
      {data.userMessage && (
        <p
          className="mt-1 truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {data.userMessage}
        </p>
      )}
      <button
        onClick={handleRevert}
        disabled={reverting || isAgentRunning}
        title={
          isAgentRunning
            ? "Stop the agent before reverting"
            : "Revert to this checkpoint"
        }
        className="mt-1.5 rounded px-2 py-0.5 text-[10px] transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        {reverting ? "Reverting..." : "Revert to here"}
      </button>
    </div>
  );
}
