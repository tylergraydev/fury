import { useEffect, useRef } from "react";
import type { AgentStatus, ChatMessage, Checkpoint } from "../../lib/tauri";
import { MessageBubble } from "./MessageBubble";
import { CheckpointIndicator } from "./CheckpointIndicator";

interface Props {
  messages: ChatMessage[];
  streamingText: string;
  agentStatus: AgentStatus;
  checkpoints?: Checkpoint[];
  revertedTurnIndex?: number | null;
  onRevertCheckpoint?: (checkpointId: string) => void;
}

export function MessageList({
  messages,
  streamingText,
  agentStatus,
  checkpoints = [],
  revertedTurnIndex,
  onRevertCheckpoint,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const isRunning = agentStatus === "Running";

  if (messages.length === 0 && !streamingText) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Send a message to start chatting with Claude Code
        </p>
      </div>
    );
  }

  // Build a map of turn_index -> checkpoint for quick lookup
  const checkpointByTurn = new Map<number, Checkpoint>();
  for (const cp of checkpoints) {
    checkpointByTurn.set(cp.turnIndex, cp);
  }

  // Count user messages to map them to turn indices
  let userMsgIndex = 0;
  const latestTurnIndex =
    checkpoints.length > 0
      ? Math.max(...checkpoints.map((cp) => cp.turnIndex))
      : -1;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {messages.map((msg) => {
        const elements: React.ReactNode[] = [];

        // Before each user message, check if there's a checkpoint at this turn
        if (msg.role === "user") {
          const cp = checkpointByTurn.get(userMsgIndex);
          if (cp && onRevertCheckpoint) {
            elements.push(
              <CheckpointIndicator
                key={`cp-${cp.id}`}
                checkpoint={cp}
                isLatest={cp.turnIndex === latestTurnIndex}
                onRevert={onRevertCheckpoint}
              />,
            );
          }
          userMsgIndex++;
        }

        // Dim messages after a revert point
        const isAfterRevert =
          revertedTurnIndex != null &&
          msg.role === "user" &&
          userMsgIndex - 1 > revertedTurnIndex;

        elements.push(
          <div
            key={msg.id}
            style={{ opacity: isAfterRevert ? 0.4 : 1 }}
          >
            <MessageBubble message={msg} />
          </div>,
        );

        return elements;
      })}

      {/* Show streaming text as in-progress assistant message */}
      {streamingText && (
        <div className="mb-3 flex justify-start">
          <div
            className="mr-8 max-w-[80%] rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
            }}
          >
            <div className="whitespace-pre-wrap break-words">
              {streamingText}
              <span
                className="inline-block h-4 w-1 animate-pulse"
                style={{ backgroundColor: "var(--accent)" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Show thinking indicator when running with no streaming text */}
      {isRunning && !streamingText && (
        <div className="mb-3 flex justify-start">
          <div
            className="rounded-lg px-4 py-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            <span className="text-sm">Thinking</span>
            <span className="ml-1 inline-flex gap-0.5">
              <span
                className="animate-bounce text-sm"
                style={{ animationDelay: "0ms" }}
              >
                .
              </span>
              <span
                className="animate-bounce text-sm"
                style={{ animationDelay: "200ms" }}
              >
                .
              </span>
              <span
                className="animate-bounce text-sm"
                style={{ animationDelay: "400ms" }}
              >
                .
              </span>
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
