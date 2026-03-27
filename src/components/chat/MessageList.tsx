import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { AgentStatus, ChatMessage } from "../../lib/tauri";
import { MessageBubble } from "./MessageBubble";
import { MarkdownContent } from "./MarkdownContent";
import { ThinkingSpinner } from "./ThinkingSpinner";
import { ChatEmptyState } from "./ChatEmptyState";

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
  /* v8 ignore start -- ternary pluralization branches; both singular and plural paths are V8 branch artifacts */
  if (toolCallCount > 0) {
    parts.push(`${toolCallCount} tool call${toolCallCount !== 1 ? "s" : ""}`);
  }
  if (hiddenTextCount > 0) {
    parts.push(`${hiddenTextCount} message${hiddenTextCount !== 1 ? "s" : ""}`);
  }

  if (parts.length === 0) return null;
  /* v8 ignore stop */

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
  runStartedAt?: number;
  onRetry?: () => void;
  highlightMessageId?: string | null;
  contextId?: string;
  contextType?: "workspace" | "repo";
  workspaceName?: string;
  onAction?: (prompt: string) => void;
}

export function MessageList({
  messages,
  streamingText,
  agentStatus,
  runStartedAt,
  onRetry,
  highlightMessageId,
  contextId,
  contextType,
  workspaceName,
  onAction,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());
  const [isNearBottom, setIsNearBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 100;
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText, isNearBottom]);

  // Scroll to highlighted message from search
  useEffect(() => {
    if (!highlightMessageId) return;
    const el = document.querySelector(`[data-message-id="${highlightMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightMessageId]);

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

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsNearBottom(true);
  }, []);

  const { orphans, turns } = useMemo(() => segmentTurns(messages), [messages]);

  if (messages.length === 0 && !streamingText) {
    if (workspaceName && onAction) {
      return (
        <ChatEmptyState
          workspaceName={workspaceName}
          onAction={onAction}
        />
      );
    }
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Send a message to start chatting with Claude Code
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-y-auto px-6 py-5" ref={scrollContainerRef} onScroll={handleScroll}>
      {/* Render any orphaned messages before the first user message */}
      {orphans.map((msg) => (
        /* v8 ignore start -- ternary branch for highlight is V8 branch artifact */
        <div key={msg.id} data-message-id={msg.id} className={highlightMessageId === msg.id ? "search-highlight" : ""}>
          <MessageBubble message={msg} contextId={contextId} contextType={contextType} />
        </div>
        /* v8 ignore stop */
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

        const elements: React.ReactNode[] = [];

        // User message — always visible
        elements.push(
          <div key={turn.userMessage.id} data-message-id={turn.userMessage.id} className={highlightMessageId === turn.userMessage.id ? "search-highlight" : ""}>
            <MessageBubble message={turn.userMessage} contextId={contextId} contextType={contextType} />
          </div>,
        );

        if (isCollapsible) {
          // Subtract the final visible message from the summary count
          /* v8 ignore start -- ternary: finalTextMessage is always truthy when isCollapsible */
          const hiddenTextCount = stats.textMessageCount - (stats.finalTextMessage ? 1 : 0);
          /* v8 ignore stop */
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
                /* v8 ignore start -- ternary branches for highlight and retry are V8 branch artifacts */
              <div key={msg.id} data-message-id={msg.id} className={highlightMessageId === msg.id ? "search-highlight" : ""}>
                  <MessageBubble message={msg} onRetry={msg.role === "system" ? onRetry : undefined} contextId={contextId} contextType={contextType} />
                </div>,
                /* v8 ignore stop */
              );
            }
          } else {
            // When collapsed, show only the text content of the final message
            /* v8 ignore start -- finalTextMessage always exists when collapsible */
            if (stats.finalTextMessage) {
            /* v8 ignore stop */
              const textOnly: ChatMessage = {
                ...stats.finalTextMessage,
                content: stats.finalTextMessage.content.filter(
                  (b) => b.type === "text" && b.text.trim().length > 0,
                ),
              };
              elements.push(
                <div key={stats.finalTextMessage.id} data-message-id={stats.finalTextMessage.id} className={highlightMessageId === stats.finalTextMessage.id ? "search-highlight" : ""}>
                  <MessageBubble message={textOnly} contextId={contextId} contextType={contextType} />
                </div>,
              );
            }
          }
        } else {
          // Active turn, no tool calls, or has system messages — render all responses normally
          for (const msg of turn.responses) {
            elements.push(
              <div key={msg.id} data-message-id={msg.id} className={highlightMessageId === msg.id ? "search-highlight" : ""}>
                <MessageBubble message={msg} onRetry={msg.role === "system" ? onRetry : undefined} contextId={contextId} contextType={contextType} />
              </div>,
            );
          }
        }

        return <div key={turnId} className="mb-6" data-turn-index={turnIdx}>{elements}</div>;
      })}

      {/* Show streaming text as in-progress assistant message */}
      {streamingText && (
        <div
          className="mb-3 text-[15px] break-words"
          style={{ color: "var(--text-primary)" }}
        >
          <MarkdownContent content={streamingText} contextId={contextId} contextType={contextType} />
          <span
            className="inline-block h-4 w-1 animate-pulse"
            style={{ backgroundColor: "var(--accent)" }}
          />
        </div>
      )}

      {/* Show thinking indicator when running with no streaming text */}
      {isRunning && !streamingText && <ThinkingSpinner startedAt={runStartedAt} />}

      <div ref={bottomRef} />
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs shadow-lg"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
