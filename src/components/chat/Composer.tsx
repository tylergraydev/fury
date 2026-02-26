import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Square, Copy, ArrowRightFromLine, Check, ShieldCheck, ShieldX, X, FileText as FileIcon, Sparkles, Brain, BookOpen, ArrowUp, Plus, Paperclip, CircleDot, Link2 } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { AgentStatus, SlashCommand } from "../../lib/tauri";
import { readFileBase64 } from "../../lib/tauri";
import { formatTokens, formatCost } from "../../lib/format";
import type { PermissionRequestInfo } from "../../stores/chatStore";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
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

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "tif", "avif",
]);

interface DroppedFile {
  id: string;
  path: string;
  name: string;
  isImage: boolean;
  dataUrl?: string; // undefined = loading, "error" = failed, string = loaded
}

let fileIdCounter = 0;

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

function FileChipIcon({ file }: { file: DroppedFile }) {
  if (file.isImage && file.dataUrl && file.dataUrl !== "error") {
    return (
      <img
        src={file.dataUrl}
        alt={file.name}
        className="h-5 w-5 rounded object-cover"
      />
    );
  }
  if (file.isImage && !file.dataUrl) {
    // Still loading — only reachable via Tauri drag-drop which loads images async
    /* v8 ignore start */
    return (
      <div
        className="flex h-5 w-5 items-center justify-center rounded"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div className="h-3 w-3 animate-pulse rounded-sm" style={{ backgroundColor: "var(--text-muted)" }} />
      </div>
    );
    /* v8 ignore stop */
  }
  // Non-image or failed image load
  return <FileIcon className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />;
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


const CLAUDE_MODEL_OPTIONS = [
  { value: "", label: "Default", displayName: "Opus 4.6" },
  { value: "sonnet", label: "Sonnet", displayName: "Sonnet" },
  { value: "opus", label: "Opus", displayName: "Opus 4.6" },
  { value: "haiku", label: "Haiku", displayName: "Haiku" },
] as const;

const CODEX_MODEL_OPTIONS = [
  { value: "", label: "Default", displayName: "codex" },
  { value: "gpt-5.1-codex", label: "GPT-5.1 Codex", displayName: "GPT-5.1 Codex" },
  { value: "o3", label: "o3", displayName: "o3" },
  { value: "o4-mini", label: "o4-mini", displayName: "o4-mini" },
  { value: "gpt-4.1", label: "GPT-4.1", displayName: "GPT-4.1" },
] as const;

const EMPTY_COMMANDS: SlashCommand[] = [];
const EMPTY_FILES: string[] = [];

interface AtMenuItem {
  label: string;
  description: string;
  value: string;
}

const CONTEXT_WINDOW_TOKENS = 200_000;

function ContextUsageIndicator({ stats }: { stats: { totalInputTokens: number; totalCostUsd: number } }) {
  const pct = Math.min(100, (stats.totalInputTokens / CONTEXT_WINDOW_TOKENS) * 100);
  const isWarning = pct >= 75;
  const isCritical = pct >= 90;

  const costStr = formatCost(stats.totalCostUsd);

  let color = "var(--text-muted)";
  if (isCritical) color = "var(--error)";
  else if (isWarning) color = "var(--accent-orange)";

  return (
    <div
      className="flex items-center gap-2 text-[11px] select-none"
      style={{ color }}
      title={`${formatTokens(stats.totalInputTokens)} / ${formatTokens(CONTEXT_WINDOW_TOKENS)} tokens used (${pct.toFixed(0)}%) · Cost: ${costStr}`}
    >
      <div
        className="h-1 w-16 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-hover)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span>{costStr}</span>
    </div>
  );
}

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
  agentStatus: AgentStatus;
  onSend: (message: string, model?: string, displayText?: string) => void;
  onStop: () => void;
  isPlanApproval?: boolean;
  onApprovePlan?: () => void;
  onCopyPlan?: () => void;
  permissionRequest?: PermissionRequestInfo | null;
  onRespondToPermission?: (approved: boolean) => void;
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (enabled: boolean) => void;
  planEnabled: boolean;
  onPlanEnabledChange: (enabled: boolean) => void;
  onLinkWorkspaces?: () => void;
  onLinkIssue?: () => void;
}

export function Composer({ contextId, contextType, agentStatus, onSend, onStop, isPlanApproval, onApprovePlan, onCopyPlan, permissionRequest, onRespondToPermission, thinkingEnabled, onThinkingEnabledChange, planEnabled, onPlanEnabledChange, onLinkWorkspaces, onLinkIssue }: Props) {
  const workspaceId = contextType === "workspace" ? contextId : undefined;
  const sessionStats = useChatStore((s) => s.sessionStats[contextId]);
  const agentType = useSettingsStore((s) => s.appSettings?.agentType ?? "claude_code");
  const isCodex = agentType === "codex_cli";
  const MODEL_OPTIONS = isCodex ? CODEX_MODEL_OPTIONS : CLAUDE_MODEL_OPTIONS;
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

  // File drop state
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Model popover state
  const [showModelMenu, setShowModelMenu] = useState(false);
  // Plus menu popover state
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Track pending slash command name for display in chat bubble
  const [pendingCommandName, setPendingCommandName] = useState<string | null>(null);
  // Store expanded command content separately so the textarea shows only /{name}
  const [pendingCommandContent, setPendingCommandContent] = useState<string | null>(null);

  const currentModelDisplay = MODEL_OPTIONS.find(m => m.value === selectedModel)?.displayName ?? "Opus 4.6";

  const isRunning = agentStatus === "Running";
  const isStopping = agentStatus === "Stopping";
  const canSend = (text.trim().length > 0 || droppedFiles.length > 0) && !isRunning && !isStopping;

  // Reset model selection when agent type changes
  useEffect(() => {
    setSelectedModel("");
  }, [agentType]);

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

  // Listen for Tauri drag-drop events
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          /* v8 ignore start -- Tauri drag-drop events not available in jsdom */
          if (cancelled) return;
          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            const paths = event.payload.paths;
            // Build files and load base64 for images
            const newFiles: DroppedFile[] = paths.map((p) => ({
              id: String(++fileIdCounter),
              path: p,
              name: p.split(/[/\\]/).pop() ?? p,
              isImage: isImageFile(p),
            }));
            setDroppedFiles((prev) => [...prev, ...newFiles]);
            // Async: load data URLs for image files
            for (const f of newFiles) {
              if (f.isImage) {
                readFileBase64(f.path)
                  .then((dataUrl) => {
                    if (cancelled) return;
                    setDroppedFiles((prev) =>
                      prev.map((df) =>
                        df.id === f.id ? { ...df, dataUrl } : df,
                      ),
                    );
                  })
                  .catch((err) => {
                    console.warn(`Failed to load image preview for ${f.name}:`, err);
                    if (cancelled) return;
                    setDroppedFiles((prev) =>
                      prev.map((df) =>
                        df.id === f.id ? { ...df, dataUrl: "error" } : df,
                      ),
                    );
                  });
              }
            }
          }
          /* v8 ignore stop */
        })
        .then((fn) => {
          /* v8 ignore start */
          if (cancelled) {
            fn();
          } else {
            unlisten = fn;
          }
          /* v8 ignore stop */
        })
        .catch((err) => {
          /* v8 ignore start */
          console.warn("Failed to register drag-drop event listener:", err);
          /* v8 ignore stop */
        });
    } catch {
      // getCurrentWebview() throws synchronously outside Tauri (e.g. browser/test)
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Close model menu on outside click
  useEffect(() => {
    if (!showModelMenu) return;
    const handleClick = () => setShowModelMenu(false);
    const id = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", handleClick);
    };
  }, [showModelMenu]);

  // Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return;
    const handleClick = () => setShowPlusMenu(false);
    const id = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", handleClick);
    };
  }, [showPlusMenu]);

  const handleAddAttachment = useCallback(async () => {
    setShowPlusMenu(false);
    let selected;
    try {
      selected = await openFileDialog({
        multiple: true,
        title: "Add attachment",
      });
    } catch (e) {
      console.error("Failed to open file dialog:", e);
      return;
    }
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const newFiles: DroppedFile[] = paths.map((p) => {
      const name = p.split("/").pop() ?? p;
      return { id: `file-${++fileIdCounter}`, path: p, name, isImage: isImageFile(p) };
    });
    setDroppedFiles((prev) => [...prev, ...newFiles]);
    for (const f of newFiles) {
      if (f.isImage) {
        readFileBase64(f.path)
          .then((dataUrl) => {
            setDroppedFiles((prev) =>
              prev.map((df) => (df.id === f.id ? { ...df, dataUrl } : df)),
            );
          })
          .catch((err) => {
            console.warn(`Failed to load image preview for ${f.name}:`, err);
            setDroppedFiles((prev) =>
              prev.map((df) => (df.id === f.id ? { ...df, dataUrl: "error" } : df)),
            );
          });
      }
    }
  }, []);

  const removeDroppedFile = useCallback((index: number) => {
    setDroppedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const fileCommands = useSlashCommandStore((s) =>
    s.commands[contextId] ?? EMPTY_COMMANDS,
  );
  const discoveredSkills = useSlashCommandStore((s) =>
    s.discoveredSkills[contextId] ?? EMPTY_COMMANDS,
  );
  const allCommands: SlashCommand[] = useMemo(() => {
    // File-discovered commands take priority; add stream-discovered skills that aren't duplicates
    const knownNames = new Set(fileCommands.map((c) => c.name));
    const uniqueSkills = discoveredSkills.filter((s) => !knownNames.has(s.name));
    return [...BUILTIN_COMMANDS, ...fileCommands, ...uniqueSkills];
  }, [fileCommands, discoveredSkills]);
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
    let message = pendingCommandContent ?? text.trim();

    // Expand @todos mention (only for user-typed text, not command content)
    if (!pendingCommandContent && workspaceId && message.includes("@todos")) {
      const todosText = useTodoStore.getState().getTodosAsText(workspaceId);
      message = message.replace(/@todos/g, todosText);
    }

    // Prepend dropped file paths
    if (droppedFiles.length > 0) {
      const fileParts = droppedFiles.map((f) =>
        f.isImage
          ? `[Attached image: ${f.path}]`
          : `[Attached file: ${f.path}]`,
      );
      const fileBlock = fileParts.join("\n");
      message = message ? `${fileBlock}\n\n${message}` : fileBlock;
    }

    onSend(message, selectedModel || undefined, pendingCommandName || undefined);
    setText("");
    setDroppedFiles([]);
    setShowSlashMenu(false);
    setShowAtMenu(false);
    setPendingCommandName(null);
    setPendingCommandContent(null);
    /* v8 ignore next 3 -- @preserve */
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, droppedFiles, onSend, workspaceId, selectedModel, pendingCommandName, pendingCommandContent]);

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

      setText(textBeforeLine + `/${cmd.name}` + textAfterCursor);
      setPendingCommandName(`/${cmd.name}`);
      setPendingCommandContent(cmd.content);
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

    // Cmd+I to link issue
    if (e.key === "i" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      if (onLinkIssue) {
        e.preventDefault();
        onLinkIssue();
        return;
      }
    }

    // Option+T to toggle thinking
    if (e.key === "t" && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      onThinkingEnabledChange(!thinkingEnabled);
      return;
    }

    // Option+P to change model
    if (e.key === "p" && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setShowModelMenu((prev) => !prev);
      return;
    }

    // Shift+Tab to toggle plan mode
    if (e.key === "Tab" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      onPlanEnabledChange(!planEnabled);
      return;
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
    if (pendingCommandName) {
      setPendingCommandName(null);
      setPendingCommandContent(null);
    }

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

  let placeholderText: string;
  if (isRunning) {
    placeholderText = "Waiting for response...";
  } else if (isPlanApproval) {
    placeholderText = "Enter your plan adjustments here...";
  } else {
    placeholderText = "Ask to make changes, @mention files, run /commands";
  }

  let inputBorderStyle: string;
  if (isDragOver) {
    inputBorderStyle = "2px dashed var(--accent)";
  } else if (planEnabled) {
    inputBorderStyle = "1px dashed var(--composer-border)";
  } else {
    inputBorderStyle = "1px solid var(--border)";
  }

  return (
    <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
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

      {/* Context near-full warning with compact button */}
      {sessionStats && sessionStats.totalInputTokens > 0 && (sessionStats.totalInputTokens / CONTEXT_WINDOW_TOKENS) >= 0.9 && agentStatus === "Idle" && (
        <ActionBar
          icon={<Brain className="h-4 w-4 flex-shrink-0" style={{ color: "var(--error)" }} />}
          description={<span>Context window is {Math.round((sessionStats.totalInputTokens / CONTEXT_WINDOW_TOKENS) * 100)}% full. Compact to free space.</span>}
          bgStyle={{ backgroundColor: "color-mix(in srgb, var(--error) 10%, transparent)" }}
          primaryAction={
            <button
              onClick={() => onSend("/compact")}
              className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: "var(--error)",
                color: "var(--bg-primary)",
              }}
            >
              Compact
            </button>
          }
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
          className="relative rounded-xl"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: inputBorderStyle,
          }}
        >
          {/* Drop zone overlay */}
          {isDragOver && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-xl"
              style={{ backgroundColor: "rgba(var(--accent-rgb, 137, 180, 250), 0.1)" }}
            >
              <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Drop files here
              </span>
            </div>
          )}

          {/* Attached file chips */}
          {droppedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
              {droppedFiles.map((file, i) => (
                <div
                  key={`${file.path}-${i}`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <FileChipIcon file={file} />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    onClick={() => removeDroppedFile(i)}
                    className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className="px-4 pt-3 pb-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholderText}
              disabled={isRunning || isStopping}
              rows={1}
              className="w-full resize-none bg-transparent text-sm outline-none"
              style={{
                color: "var(--text-primary)",
                minHeight: "80px",
                maxHeight: "200px",
              }}
            />
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            {/* Left side: Model, Thinking, Plan */}
            <div className="flex items-center gap-1">
              {/* Model indicator/selector */}
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu((prev) => !prev)}
                  disabled={isRunning || isStopping}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:opacity-80 cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                  title="Change model (⌥P)"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{currentModelDisplay}</span>
                </button>

                {/* Model dropdown popover */}
                {showModelMenu && (
                  <div
                    className="absolute bottom-full left-0 z-30 mb-1 rounded-lg shadow-lg py-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      minWidth: "120px",
                    }}
                  >
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setSelectedModel(opt.value);
                          setShowModelMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors"
                        style={{
                          backgroundColor: selectedModel === opt.value ? "var(--bg-hover)" : "transparent",
                          color: selectedModel === opt.value ? "var(--text-primary)" : "var(--text-secondary)",
                        }}
                      >
                        {opt.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Thinking toggle (Claude only) */}
              {!isCodex && (
              <button
                onClick={() => onThinkingEnabledChange(!thinkingEnabled)}
                disabled={isRunning || isStopping}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] cursor-pointer transition-colors hover:opacity-80"
                style={{ color: thinkingEnabled ? "var(--accent-orange)" : "var(--text-primary)" }}
                title={thinkingEnabled ? "Disable thinking (⌥T)" : "Enable thinking (⌥T)"}
              >
                <Brain className="h-3.5 w-3.5" />
                {thinkingEnabled && <span>Thinking</span>}
              </button>
              )}

              {/* Plan toggle (Claude only) */}
              {!isCodex && (
              <button
                onClick={() => onPlanEnabledChange(!planEnabled)}
                disabled={isRunning || isStopping}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] cursor-pointer transition-colors hover:opacity-80"
                style={{ color: planEnabled ? "var(--accent-orange)" : "var(--text-primary)" }}
                title={planEnabled ? "Disable plan mode (⇧⇥)" : "Enable plan mode (⇧⇥)"}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {planEnabled && <span>Plan</span>}
              </button>
              )}

            </div>

            {/* Center: Context usage indicator */}
            {sessionStats && sessionStats.totalInputTokens > 0 && (
              <ContextUsageIndicator stats={sessionStats} />
            )}

            {/* Right side: Plus button, Send button */}
            <div className="flex items-center gap-1.5">
              <div className="relative" ref={plusMenuRef}>
                <button
                  onClick={() => setShowPlusMenu((prev) => !prev)}
                  disabled={isRunning || isStopping}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:opacity-80 cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  title="Add file or context"
                >
                  <Plus className="h-4 w-4" />
                </button>

                {showPlusMenu && (
                  <div
                    className="absolute bottom-full right-0 z-30 mb-1 rounded-lg shadow-lg py-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      minWidth: "200px",
                    }}
                  >
                    <button
                      onClick={handleAddAttachment}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <Paperclip className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                      <span className="flex-1">Add attachment</span>
                      <kbd className="text-xs" style={{ color: "var(--text-muted)" }}>⌘U</kbd>
                    </button>
                    <button
                      onClick={() => { setShowPlusMenu(false); onLinkIssue?.(); }}
                      disabled={!onLinkIssue}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${!onLinkIssue ? "opacity-40" : "hover:bg-[var(--bg-hover)]"}`}
                      style={{ color: "var(--text-primary)" }}
                    >
                      <CircleDot className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                      <span className="flex-1">Link issue</span>
                      <kbd className="text-xs" style={{ color: "var(--text-muted)" }}>⌘I</kbd>
                    </button>
                    {onLinkWorkspaces && (
                      <button
                        onClick={() => { setShowPlusMenu(false); onLinkWorkspaces(); }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Link2 className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                        <span>Link workspaces</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isRunning || isStopping ? (
                <button
                  onClick={onStop}
                  disabled={isStopping}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer"
                  style={{
                    backgroundColor: isStopping ? "var(--bg-hover)" : "var(--error)",
                    color: isStopping ? "var(--text-muted)" : "var(--bg-primary)",
                  }}
                  title={isStopping ? "Stopping..." : "Stop"}
                >
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                  style={{
                    backgroundColor: canSend ? "var(--composer-border)" : "var(--bg-hover)",
                    color: canSend ? "var(--bg-primary)" : "var(--text-muted)",
                  }}
                  title="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
