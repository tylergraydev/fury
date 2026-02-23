import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Send, Square, ChevronDown, Copy, ArrowRightFromLine, Check, ShieldCheck, ShieldX } from "lucide-react";
import type { AgentStatus, SlashCommand } from "../../lib/tauri";
import type { PermissionRequestInfo } from "../../stores/chatStore";
import { useTodoStore } from "../../stores/todoStore";
import { useSlashCommandStore } from "../../stores/slashCommandStore";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { BUILTIN_COMMANDS, type BuiltinCommand } from "../../lib/builtinCommands";

function ActionBar({ icon, description, bgStyle, secondaryActions, primaryAction }: {
  icon?: React.ReactNode;
  description: React.ReactNode;
  bgStyle: React.CSSProperties;
  secondaryActions?: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={bgStyle}>
      {icon}
      <span className="flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>{description}</span>
      {secondaryActions}
      {primaryAction}
    </div>
  );
}

function ActionBarButton({ onClick, icon: Icon, label, color, bgColor, showShortcut, disabled, title, className }: {
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor?: string;
  showShortcut?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:opacity-80 ${bgColor ? "font-medium" : ""} ${className ?? ""}`}
      style={{ color, ...(bgColor ? { backgroundColor: bgColor } : {}) }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {showShortcut && (
        <kbd className="ml-1 rounded px-1 py-0.5 text-[9px] font-normal" style={{ backgroundColor: "rgba(0,0,0,0.2)", color: "inherit" }}>
          ⌘⇧↵
        </kbd>
      )}
    </button>
  );
}

const MODEL_OPTIONS = [
  { value: "", label: "Default" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
] as const;

const EMPTY_COMMANDS: SlashCommand[] = [];
const EMPTY_FILES: string[] = [];

interface AtMenuItem {
  label: string;
  description: string;
  value: string;
}

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
  agentStatus: AgentStatus;
  onSend: (message: string, model?: string) => void;
  onStop: () => void;
  isPlanApproval?: boolean;
  onApprovePlan?: () => void;
  onCopyPlan?: () => void;
  permissionRequest?: PermissionRequestInfo | null;
  onRespondToPermission?: (approved: boolean) => void;
}

export function Composer({ contextId, contextType, agentStatus, onSend, onStop, isPlanApproval, onApprovePlan, onCopyPlan, permissionRequest, onRespondToPermission }: Props) {
  const workspaceId = contextType === "workspace" ? contextId : undefined;
  const [text, setText] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash command autocomplete state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // @mention autocomplete state
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atFilter, setAtFilter] = useState("");
  const [selectedAtIndex, setSelectedAtIndex] = useState(0);

  const isRunning = agentStatus === "Running";
  const isStopping = agentStatus === "Stopping";
  const isError = typeof agentStatus === "object" && "Error" in agentStatus;
  const canSend = text.trim().length > 0 && !isRunning && !isStopping;

  // Load slash commands when context changes
  useEffect(() => {
    useSlashCommandStore.getState().loadCommands(contextId, contextType);
  }, [contextId, contextType]);

  // Load file list for @mention autocomplete
  useEffect(() => {
    const store = useFileTreeStore.getState();
    if (!store.files[contextId]) {
      if (contextType === "workspace") store.loadFiles(contextId);
      else store.loadRepoFiles(contextId);
    }
  }, [contextId, contextType]);

  const fileCommands = useSlashCommandStore((s) =>
    s.commands[contextId] ?? EMPTY_COMMANDS,
  );
  const allCommands: SlashCommand[] = useMemo(
    () => [...BUILTIN_COMMANDS, ...fileCommands],
    [fileCommands],
  );
  const matchingCommands = useMemo(() => {
    if (!slashFilter) return allCommands;
    const lower = slashFilter.toLowerCase();
    return allCommands.filter((c) => c.name.toLowerCase().startsWith(lower));
  }, [allCommands, slashFilter]);

  // @mention autocomplete items: @todos + file paths
  const files = useFileTreeStore((s) => s.files[contextId] ?? EMPTY_FILES);
  const atMenuItems: AtMenuItem[] = useMemo(() => {
    const items: AtMenuItem[] = [];
    if (workspaceId && (!atFilter || "todos".startsWith(atFilter.toLowerCase()))) {
      items.push({ label: "@todos", description: "Insert todo list", value: "@todos" });
    }
    const lower = atFilter.toLowerCase();
    for (const f of files) {
      if (!atFilter || f.toLowerCase().includes(lower)) {
        const name = f.split("/").pop()!;
        items.push({ label: name, description: f, value: f });
      }
      if (items.length >= 8) break;
    }
    return items;
  }, [atFilter, files, workspaceId]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    let message = text.trim();

    // Expand @todos mention
    if (workspaceId && message.includes("@todos")) {
      const todosText = useTodoStore.getState().getTodosAsText(workspaceId);
      message = message.replace(/@todos/g, todosText);
    }

    onSend(message, selectedModel || undefined);
    setText("");
    setShowSlashMenu(false);
    setShowAtMenu(false);
    /* v8 ignore next 3 -- @preserve */
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, onSend, workspaceId, selectedModel]);

  const selectSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      const ta = textareaRef.current;
      /* v8 ignore next -- @preserve */
      const cursorPos = ta?.selectionStart ?? text.length;
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastNewline = textBeforeCursor.lastIndexOf("\n");
      const lineStart = lastNewline + 1;
      const textAfterCursor = text.substring(cursorPos);
      const textBeforeLine = text.substring(0, lineStart);

      // Action commands execute immediately without sending a message
      const asBuiltin = cmd as BuiltinCommand;
      if (asBuiltin.action) {
        asBuiltin.action();
        setText(textBeforeLine + textAfterCursor);
        setShowSlashMenu(false);
        return;
      }

      setText(textBeforeLine + cmd.content + textAfterCursor);
      setShowSlashMenu(false);
    },
    [text],
  );

  const selectAtItem = useCallback(
    (item: AtMenuItem) => {
      const ta = textareaRef.current;
      /* v8 ignore next -- @preserve */
      const cursorPos = ta?.selectionStart ?? text.length;
      const textBeforeCursor = text.substring(0, cursorPos);
      const textAfterCursor = text.substring(cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");
      const before = text.substring(0, atIndex);

      if (item.value === "@todos") {
        setText(before + "@todos " + textAfterCursor);
      } else {
        setText(before + item.value + " " + textAfterCursor);
      }
      setShowAtMenu(false);
    },
    [text],
  );

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
    if (showAtMenu && atMenuItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedAtIndex((prev) =>
          Math.min(prev + 1, atMenuItems.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedAtIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectAtItem(atMenuItems[selectedAtIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    // Cmd+Shift+Enter to approve plan or permission
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      if (permissionRequest && onRespondToPermission) {
        e.preventDefault();
        onRespondToPermission(true);
        return;
      }
      if (isPlanApproval && onApprovePlan) {
        e.preventDefault();
        onApprovePlan();
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
    if (currentLine.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashFilter(currentLine.substring(1));
      setSelectedSlashIndex(0);
      setShowAtMenu(false);
    } else {
      setShowSlashMenu(false);
    }

    // Detect @mention trigger
    const lastAt = textBeforeCursor.lastIndexOf("@");
    if (lastAt >= 0) {
      const afterAt = textBeforeCursor.substring(lastAt + 1);
      // Only trigger if no spaces in the filter text (file paths don't have spaces)
      if (!afterAt.includes(" ")) {
        const charBefore = lastAt > 0 ? textBeforeCursor[lastAt - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || lastAt === 0) {
          setShowAtMenu(true);
          setAtFilter(afterAt);
          setSelectedAtIndex(0);
        } else {
          setShowAtMenu(false);
        }
      } else {
        setShowAtMenu(false);
      }
    } else {
      setShowAtMenu(false);
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
    <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
      {/* Status bar */}
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: statusColor }}
        />
        <span style={{ color: "var(--text-muted)" }}>{statusLabel}</span>

        {/* Model selector */}
        <div className="relative ml-auto">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isRunning || isStopping}
            className="appearance-none rounded py-0.5 pl-2 pr-5 text-[11px] cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: selectedModel ? "var(--accent)" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
        </div>

        {(isRunning || isStopping) && (
          <button
            onClick={onStop}
            disabled={isStopping}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px]"
            style={{
              backgroundColor: "rgba(243, 139, 168, 0.15)",
              color: "var(--error)",
              border: "1px solid rgba(243, 139, 168, 0.3)",
            }}
          >
            <Square className="h-2.5 w-2.5" />
            {isStopping ? "Stopping..." : "Stop"}
          </button>
        )}
      </div>

      {/* Plan approval bar */}
      {isPlanApproval && (
        <ActionBar
          description="Approve the plan (⌘⇧↵) or tell the AI what to do differently"
          bgStyle={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
          secondaryActions={
            <>
              {onCopyPlan && (
                <ActionBarButton onClick={onCopyPlan} icon={Copy} label="Copy" color="var(--text-secondary)" />
              )}
              <ActionBarButton disabled title="Hand off to a new workspace (coming soon)" icon={ArrowRightFromLine} label="Hand off" color="var(--text-secondary)" className="opacity-40" />
            </>
          }
          primaryAction={onApprovePlan && (
            <ActionBarButton onClick={onApprovePlan} icon={Check} label="Approve" color="var(--bg-primary)" bgColor="var(--text-primary)" showShortcut />
          )}
        />
      )}

      {/* Permission approval bar */}
      {permissionRequest && (
        <ActionBar
          icon={<ShieldCheck className="h-4 w-4 flex-shrink-0" style={{ color: "var(--warning)" }} />}
          description={<>Allow <strong style={{ color: "var(--text-primary)" }}>{permissionRequest.toolName}</strong>?</>}
          bgStyle={{ backgroundColor: "rgba(250, 179, 64, 0.08)", border: "1px solid rgba(250, 179, 64, 0.3)" }}
          secondaryActions={onRespondToPermission && (
            <ActionBarButton onClick={() => onRespondToPermission(false)} icon={ShieldX} label="Deny" color="var(--error)" />
          )}
          primaryAction={onRespondToPermission && (
            <ActionBarButton onClick={() => onRespondToPermission(true)} icon={ShieldCheck} label="Allow" color="var(--bg-primary)" bgColor="var(--success)" showShortcut />
          )}
        />
      )}

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
                  style={{
                    color: cmd.source === "built-in" || cmd.source === "plugin" ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {cmd.source}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* @mention autocomplete dropdown */}
        {showAtMenu && atMenuItems.length > 0 && (
          <div
            className="absolute bottom-full left-0 z-10 mb-1 w-full max-h-48 overflow-y-auto rounded-lg shadow-lg"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            {atMenuItems.map((item, i) => (
              <button
                key={item.value}
                onClick={() => selectAtItem(item)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
                style={{
                  backgroundColor:
                    i === selectedAtIndex
                      ? "var(--bg-hover)"
                      : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ color: "var(--accent)" }}>{item.label}</span>
                {item.label !== item.description && (
                  <span
                    className="truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {item.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className="flex items-center gap-2.5 rounded-xl px-4 py-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: isPlanApproval
              ? "1px dashed var(--text-muted)"
              : "1px solid var(--border)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              isRunning
                ? "Waiting for response..."
                : isPlanApproval
                  ? "Enter your plan adjustments here..."
                  : "Ask to make changes, @mention files, run /commands"
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
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors"
            style={{
              backgroundColor: canSend ? "var(--accent)" : "var(--bg-hover)",
              color: canSend ? "var(--bg-primary)" : "var(--text-muted)",
            }}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>

        {/* Shortcut hint */}
        <div className="mt-2 flex items-center">
          <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
            Enter to send, Shift+Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}
