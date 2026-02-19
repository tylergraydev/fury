import { useEffect, useRef } from "react";
import type { AgentStatus, ChatMessage } from "../../lib/tauri";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  streamingText: string;
  agentStatus: AgentStatus;
}

export function MessageList({ messages, streamingText, agentStatus }: Props) {
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

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Show streaming text as in-progress assistant message */}
      {streamingText && (
        <div className="mb-3 flex justify-start">
          <div
            className="mr-8 max-w-[85%] rounded-lg px-3 py-2 text-sm"
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
            className="rounded-lg px-3 py-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            <span className="text-sm">Thinking</span>
            <span className="ml-1 inline-flex gap-0.5">
              <span className="animate-bounce text-sm" style={{ animationDelay: "0ms" }}>.</span>
              <span className="animate-bounce text-sm" style={{ animationDelay: "200ms" }}>.</span>
              <span className="animate-bounce text-sm" style={{ animationDelay: "400ms" }}>.</span>
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
