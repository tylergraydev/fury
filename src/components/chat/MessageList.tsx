import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { AgentStatus, ChatMessage, Checkpoint } from "../../lib/tauri";
import { MessageBubble } from "./MessageBubble";
import { CheckpointIndicator } from "./CheckpointIndicator";

// --- Turn segmentation ---

export interface Turn {
  userMessage: ChatMessage;
  responses: ChatMessage[];
}

export function segmentTurns(messages: ChatMessage[]): { orphans: ChatMessage[]; turns: Turn[] } {
  const orphans: ChatMessage[] = [];
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = { userMessage: msg, responses: [] };
    } else if (currentTurn) {
      currentTurn.responses.push(msg);
    } else {
      orphans.push(msg);
    }
  }

  if (currentTurn) {
    turns.push(currentTurn);
  }

  return { orphans, turns };
}

function getTurnStats(responses: ChatMessage[]) {
  let toolCallCount = 0;
  let textMessageCount = 0;
  let systemMessageCount = 0;
  let finalTextMessage: ChatMessage | null = null;

  for (const msg of responses) {
    if (msg.role === "system") {
      systemMessageCount++;
      continue;
    }
    if (msg.role !== "assistant") continue;

    const hasText = msg.content.some(
      (b) => b.type === "text" && b.text.trim().length > 0,
    );
    const toolUses = msg.content.filter((b) => b.type === "toolUse").length;

    toolCallCount += toolUses;
    if (hasText) {
      textMessageCount++;
      finalTextMessage = msg;
    }
  }

  return { toolCallCount, textMessageCount, systemMessageCount, finalTextMessage };
}

// --- Components ---

function CollapsedTurnSummary({
  toolCallCount,
  hiddenTextCount,
  isExpanded,
  onToggle,
}: {
  toolCallCount: number;
  hiddenTextCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const parts: string[] = [];
  if (toolCallCount > 0) {
    parts.push(`${toolCallCount} tool call${toolCallCount !== 1 ? "s" : ""}`);
  }
  if (hiddenTextCount > 0) {
    parts.push(`${hiddenTextCount} message${hiddenTextCount !== 1 ? "s" : ""}`);
  }

  if (parts.length === 0) return null;

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="mb-2 flex items-center gap-1.5 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      {(isExpanded || isHovered) ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <span>{parts.join(", ")}</span>
    </button>
  );
}

interface Props {
  messages: ChatMessage[];
  streamingText: string;
  agentStatus: AgentStatus;
  checkpoints?: Checkpoint[];
  revertedTurnIndex?: number | null;
  onRevertCheckpoint?: (checkpointId: string) => void;
  onRetry?: () => void;
}

export function MessageList({
  messages,
  streamingText,
  agentStatus,
  checkpoints = [],
  revertedTurnIndex,
  onRevertCheckpoint,
  onRetry,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const isRunning = agentStatus === "Running";
  const isAgentActive = agentStatus === "Running" || agentStatus === "Stopping";

  const toggleTurn = useCallback((turnId: string) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }, []);

  const { orphans, turns } = useMemo(() => segmentTurns(messages), [messages]);

  // Build a map of turn_index -> checkpoint for quick lookup
  const checkpointByTurn = new Map<number, Checkpoint>();
  for (const cp of checkpoints) {
    checkpointByTurn.set(cp.turnIndex, cp);
  }

  const latestTurnIndex =
    checkpoints.length > 0
      ? Math.max(...checkpoints.map((cp) => cp.turnIndex))
      : -1;

  if (messages.length === 0 && !streamingText) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Send a message to start chatting with Claude Code
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {/* Render any orphaned messages before the first user message */}
      {orphans.map((msg) => (
        <div key={msg.id}>
          <MessageBubble message={msg} />
        </div>
      ))}

      {turns.map((turn, turnIdx) => {
        const isLastTurn = turnIdx === turns.length - 1;
        const isActiveTurn = isLastTurn && isAgentActive;
        const stats = getTurnStats(turn.responses);
        // Never collapse turns that contain system (error) messages
        const isCollapsible =
          !isActiveTurn && stats.toolCallCount > 0 && stats.systemMessageCount === 0;
        const turnId = turn.userMessage.id;
        const isExpanded = expandedTurns.has(turnId);

        const isAfterRevert =
          revertedTurnIndex != null && turnIdx > revertedTurnIndex;

        const elements: React.ReactNode[] = [];

        // Checkpoint indicator before user message
        const cp = checkpointByTurn.get(turnIdx);
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

        // User message — always visible
        elements.push(
          <div
            key={turn.userMessage.id}
            style={{ opacity: isAfterRevert ? 0.4 : 1 }}
          >
            <MessageBubble message={turn.userMessage} />
          </div>,
        );

        if (isCollapsible) {
          // Subtract the final visible message from the summary count
          const hiddenTextCount = stats.textMessageCount - (stats.finalTextMessage ? 1 : 0);
          elements.push(
            <CollapsedTurnSummary
              key={`summary-${turnId}`}
              toolCallCount={stats.toolCallCount}
              hiddenTextCount={hiddenTextCount}
              isExpanded={isExpanded}
              onToggle={() => toggleTurn(turnId)}
            />,
          );

          if (isExpanded) {
            // Show all responses when expanded
            for (const msg of turn.responses) {
              elements.push(
                <div
                  key={msg.id}
                  style={{ opacity: isAfterRevert ? 0.4 : 1 }}
                >
                  <MessageBubble message={msg} onRetry={msg.role === "system" ? onRetry : undefined} />
                </div>,
              );
            }
          } else {
            // When collapsed, show only the text content of the final message
            if (stats.finalTextMessage) {
              const textOnly: ChatMessage = {
                ...stats.finalTextMessage,
                content: stats.finalTextMessage.content.filter(
                  (b) => b.type === "text" && b.text.trim().length > 0,
                ),
              };
              elements.push(
                <div
                  key={stats.finalTextMessage.id}
                  style={{ opacity: isAfterRevert ? 0.4 : 1 }}
                >
                  <MessageBubble message={textOnly} />
                </div>,
              );
            }
          }
        } else {
          // Active turn, no tool calls, or has system messages — render all responses normally
          for (const msg of turn.responses) {
            elements.push(
              <div
                key={msg.id}
                style={{ opacity: isAfterRevert ? 0.4 : 1 }}
              >
                <MessageBubble message={msg} onRetry={msg.role === "system" ? onRetry : undefined} />
              </div>,
            );
          }
        }

        return <div key={turnId} className="mb-6" data-turn-index={turnIdx}>{elements}</div>;
      })}

      {/* Show streaming text as in-progress assistant message */}
      {streamingText && (
        <div
          className="mb-3 text-[15px] whitespace-pre-wrap break-words"
          style={{ color: "var(--text-primary)" }}
        >
          {streamingText}
          <span
            className="inline-block h-4 w-1 animate-pulse"
            style={{ backgroundColor: "var(--accent)" }}
          />
        </div>
      )}

      {/* Show thinking indicator when running with no streaming text */}
      {isRunning && !streamingText && (
        <div className="mb-3" style={{ color: "var(--text-muted)" }}>
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
      )}

      <div ref={bottomRef} />
    </div>
  );
}
