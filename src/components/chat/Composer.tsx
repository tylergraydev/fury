import { useState, useRef, useCallback, useEffect } from "react";
import type { AgentStatus, SlashCommand } from "../../lib/tauri";
import { useTodoStore } from "../../stores/todoStore";
import { useSlashCommandStore } from "../../stores/slashCommandStore";

interface Props {
  workspaceId?: string;
  agentStatus: AgentStatus;
  onSend: (message: string) => void;
  onStop: () => void;
}

export function Composer({ workspaceId, agentStatus, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash command autocomplete state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // @mention autocomplete state
  const [showAtMenu, setShowAtMenu] = useState(false);

  const isRunning = agentStatus === "Running";
  const isStopping = agentStatus === "Stopping";
  const isError = typeof agentStatus === "object" && "Error" in agentStatus;
  const canSend = text.trim().length > 0 && !isRunning && !isStopping;

  // Load slash commands when workspace changes
  useEffect(() => {
    if (workspaceId) {
      useSlashCommandStore.getState().loadCommands(workspaceId);
    }
  }, [workspaceId]);

  const matchingCommands = workspaceId
    ? useSlashCommandStore.getState().findMatching(workspaceId, slashFilter)
    : [];

  const handleSend = useCallback(() => {
    if (!canSend) return;
    let message = text.trim();

    // Expand @todos mention
    if (workspaceId && message.includes("@todos")) {
      const todosText = useTodoStore.getState().getTodosAsText(workspaceId);
      message = message.replace(/@todos/g, todosText);
    }

    onSend(message);
    setText("");
    setShowSlashMenu(false);
    setShowAtMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, onSend, workspaceId]);

  const selectSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      const ta = textareaRef.current;
      const cursorPos = ta?.selectionStart ?? text.length;
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastNewline = textBeforeCursor.lastIndexOf("\n");
      const lineStart = lastNewline + 1;
      const textAfterCursor = text.substring(cursorPos);
      const textBeforeLine = text.substring(0, lineStart);

      setText(textBeforeLine + cmd.content + textAfterCursor);
      setShowSlashMenu(false);
    },
    [text],
  );

  const insertAtTodos = useCallback(() => {
    const ta = textareaRef.current;
    const cursorPos = ta?.selectionStart ?? text.length;
    const textBeforeCursor = text.substring(0, cursorPos);
    const textAfterCursor = text.substring(cursorPos);

    // Find the @ that triggered this
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const before = text.substring(0, atIndex);

    setText(before + "@todos" + textAfterCursor);
    setShowAtMenu(false);
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command menu keyboard navigation
    if (showSlashMenu && matchingCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSlashIndex((prev) =>
          Math.min(prev + 1, matchingCommands.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSlashIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlashCommand(matchingCommands[selectedSlashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    // @mention menu keyboard navigation
    if (showAtMenu) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertAtTodos();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastNewline = textBeforeCursor.lastIndexOf("\n");
    const lineStart = lastNewline + 1;
    const currentLine = textBeforeCursor.substring(lineStart);

    // Detect slash command trigger: "/" at start of line
    if (currentLine.startsWith("/") && workspaceId) {
      setShowSlashMenu(true);
      setSlashFilter(currentLine.substring(1));
      setSelectedSlashIndex(0);
      setShowAtMenu(false);
    } else {
      setShowSlashMenu(false);
    }

    // Detect @mention trigger
    if (workspaceId) {
      const lastAt = textBeforeCursor.lastIndexOf("@");
      if (lastAt >= 0) {
        const afterAt = textBeforeCursor.substring(lastAt + 1);
        if (
          afterAt === "" ||
          "todos".startsWith(afterAt.toLowerCase())
        ) {
          // Only show if @ is at word boundary
          const charBefore = lastAt > 0 ? textBeforeCursor[lastAt - 1] : " ";
          if (charBefore === " " || charBefore === "\n" || lastAt === 0) {
            setShowAtMenu(true);
          } else {
            setShowAtMenu(false);
          }
        } else {
          setShowAtMenu(false);
        }
      } else {
        setShowAtMenu(false);
      }
    }

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

  const statusLabel = isRunning
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

      {/* Input area with autocomplete */}
      <div className="relative">
        {/* Slash command autocomplete dropdown */}
        {showSlashMenu && matchingCommands.length > 0 && (
          <div
            className="absolute bottom-full left-0 z-10 mb-1 w-full max-h-48 overflow-y-auto rounded-lg shadow-lg"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            {matchingCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                onClick={() => selectSlashCommand(cmd)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
                style={{
                  backgroundColor:
                    i === selectedSlashIndex
                      ? "var(--bg-hover)"
                      : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ color: "var(--accent)" }}>/{cmd.name}</span>
                <span
                  className="truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {cmd.description}
                </span>
                <span
                  className="ml-auto text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {cmd.source}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* @mention autocomplete dropdown */}
        {showAtMenu && workspaceId && (
          <div
            className="absolute bottom-full left-0 z-10 mb-1 w-48 rounded-lg shadow-lg"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={insertAtTodos}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-primary)",
              }}
            >
              <span style={{ color: "var(--accent)" }}>@todos</span>
              <span style={{ color: "var(--text-muted)" }}>
                Insert todo list
              </span>
            </button>
          </div>
        )}

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
            placeholder={
              isRunning ? "Waiting for response..." : "Message Claude Code..."
            }
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
    </div>
  );
}
