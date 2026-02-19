import { useState, useRef, useCallback } from "react";
import type { AgentStatus } from "../../lib/tauri";

interface Props {
  agentStatus: AgentStatus;
  onSend: (message: string) => void;
  onStop: () => void;
}

export function Composer({ agentStatus, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRunning = agentStatus === "Running";
  const isStopping = agentStatus === "Stopping";
  const isError = typeof agentStatus === "object" && "Error" in agentStatus;
  const canSend = text.trim().length > 0 && !isRunning && !isStopping;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const statusColor =
    isRunning || isStopping
      ? "var(--warning)"
      : isError
        ? "var(--error)"
        : "var(--success)";

  const statusLabel =
    isRunning
      ? "Running"
      : isStopping
        ? "Stopping"
        : isError
          ? "Error"
          : "Idle";

  return (
    <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
      {/* Status bar */}
      <div className="mb-2 flex items-center gap-2 text-[10px]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: statusColor }}
        />
        <span style={{ color: "var(--text-muted)" }}>{statusLabel}</span>

        {(isRunning || isStopping) && (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="ml-auto rounded px-2 py-0.5 text-[10px]"
            style={{
              backgroundColor: "rgba(243, 139, 168, 0.15)",
              color: "var(--error)",
              border: "1px solid rgba(243, 139, 168, 0.3)",
            }}
          >
            {isStopping ? "Stopping..." : "Stop"}
          </button>
        )}
      </div>

      {/* Input area */}
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-2"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? "Waiting for response..." : "Message Claude Code..."}
          disabled={isRunning || isStopping}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none"
          style={{
            color: "var(--text-primary)",
            maxHeight: "200px",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="rounded px-3 py-1 text-xs transition-colors"
          style={{
            backgroundColor: canSend ? "var(--accent)" : "var(--bg-hover)",
            color: canSend ? "#1e1e2e" : "var(--text-muted)",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
