import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Square, Copy, ArrowRightFromLine, Check, ShieldCheck, ShieldX, X, Sparkles, Brain, BookOpen, ArrowUp, Plus, Paperclip, CircleDot, Link2, Mic, MicOff } from "lucide-react";
import type { AgentStatus } from "../../lib/tauri";
import type { PermissionRequestInfo } from "../../stores/chatStore";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTodoStore } from "../../stores/todoStore";
import { useSlashCommandStore } from "../../stores/slashCommandStore";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { usePromptLibraryStore } from "../../stores/promptLibraryStore";
import { PromptLibraryDialog } from "../prompt-library/PromptLibraryDialog";
import { useVoiceInput } from "../../hooks/useVoiceInput";
import { useToastStore } from "../../stores/toastStore";
import { ActionBar, ActionBarButton } from "./ActionBar";
import { ContextUsageIndicator, CONTEXT_WINDOW_TOKENS } from "./ContextUsageIndicator";
import { FileChipIcon } from "./FileChipIcon";
import { useFileDropHandler } from "../../hooks/useFileDropHandler";
import { useSlashCommandAutocomplete } from "../../hooks/useSlashCommandAutocomplete";
import { BUILTIN_COMMANDS, type BuiltinCommand } from "../../lib/builtinCommands";

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
  onSend: (message: string, model?: string, displayText?: string) => void;
  onStop: () => void;
  isPlanApproval?: boolean;
  onApprovePlan?: () => void;
  onCopyPlan?: () => void;
  permissionRequest?: PermissionRequestInfo | null;
  onRespondToPermission?: (approved: boolean, updatedPermissions?: unknown[], decisionClassification?: string) => void;
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

  // @mention autocomplete state
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atFilter, setAtFilter] = useState("");
  const [selectedAtIndex, setSelectedAtIndex] = useState(0);

  // File drop hook
  const {
    droppedFiles,
    isDragOver,
    handleAddAttachment,
    handlePaste,
    removeDroppedFile,
    clearDroppedFiles,
  } = useFileDropHandler();

  // Model popover state
  const [showModelMenu, setShowModelMenu] = useState(false);
  // Plus menu popover state
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Track pending slash command name for display in chat bubble
  const [pendingCommandName, setPendingCommandName] = useState<string | null>(null);
  // Store expanded command content separately so the textarea shows only /{name}
  const [pendingCommandContent, setPendingCommandContent] = useState<string | null>(null);

  // Prompt library state
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);

  const openPromptLibrary = useCallback(() => setShowPromptLibrary(true), []);

  // Slash command autocomplete hook
  const getText = useCallback(() => text, [text]);
  const {
    showSlashMenu,
    setShowSlashMenu,
    selectedSlashIndex,
    matchingCommands,
    selectSlashCommand,
    handleSlashInput,
    handleSlashKeyDown,
  } = useSlashCommandAutocomplete(
    contextId,
    getText,
    setText,
    textareaRef,
    setPendingCommandName,
    setPendingCommandContent,
    openPromptLibrary,
  );

  // Voice input
  const {
    isSupported: voiceSupported,
    isListening: voiceListening,
    interimTranscript,
    toggleListening: toggleVoice,
    stopListening: stopVoice,
  } = useVoiceInput({
    onTranscript: useCallback((transcript: string) => {
      setText((prev) => {
        const separator = prev.length > 0 && !prev.endsWith(" ") ? " " : "";
        return prev + separator + transcript;
      });
    }, []),
    onError: useCallback((error: string) => {
      useToastStore.getState().addToast(error, "error");
    }, []),
  });

  const currentModelDisplay = MODEL_OPTIONS.find(m => m.value === selectedModel)?.displayName ?? "Opus 4.6";

  const isRunning = agentStatus === "Running";
  const isStopping = agentStatus === "Stopping";
  const canSend = (text.trim().length > 0 || droppedFiles.length > 0) && !isStopping;

  // Reset model selection when agent type changes
  useEffect(() => {
    setSelectedModel("");
  }, [agentType]);

  // Load Composer data — staggered across two frames to avoid mount-phase IPC burst.
  // Tier 2: slash commands + prompts (needed when user starts typing).
  // Tier 3 (nested rAF): file tree for @mention (heaviest, user rarely types immediately).
  useEffect(() => {
    let inner: number;
    const outer = requestAnimationFrame(() => {
      useSlashCommandStore.getState().loadCommands(contextId, contextType);
      usePromptLibraryStore.getState().loadPrompts();

      inner = requestAnimationFrame(() => {
        const store = useFileTreeStore.getState();
        if (!store.files[contextId]) {
          if (contextType === "workspace") store.loadFiles(contextId);
          else store.loadRepoFiles(contextId);
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [contextId, contextType]);

  // Auto-resize textarea when text changes programmatically (e.g., voice input)
  useEffect(() => {
    const el = textareaRef.current;
    /* v8 ignore next 4 -- @preserve */
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [text]);

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

  const handleAddAttachmentFromMenu = useCallback(() => {
    setShowPlusMenu(false);
    handleAddAttachment();
  }, [handleAddAttachment]);

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
    // Intercept builtin commands (e.g. "/clear") before the canSend guard
    // so they work even while the agent is running.
    if (!pendingCommandContent && text.trim()) {
      const trimmed = text.trim();
      const match = /^\/(\S+)$/.exec(trimmed);
      if (match) {
        const builtin = BUILTIN_COMMANDS.find(
          (c): c is BuiltinCommand & { action: () => void } =>
            c.name === match[1] && !!c.action,
        );
        if (builtin) {
          builtin.action();
          setText("");
          setShowSlashMenu(false);
          return;
        }
      }
    }

    if (!canSend) return;
    stopVoice();
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
    clearDroppedFiles();
    setShowSlashMenu(false);
    setShowAtMenu(false);
    setPendingCommandName(null);
    setPendingCommandContent(null);
    /* v8 ignore next 3 -- @preserve */
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, droppedFiles, onSend, workspaceId, selectedModel, pendingCommandName, pendingCommandContent, stopVoice, clearDroppedFiles, setShowSlashMenu]);

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
    if (handleSlashKeyDown(e)) return;

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

    // Option+V to toggle voice input
    if (e.key === "v" && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      /* v8 ignore start -- voiceSupported is false in jsdom; no SpeechRecognition API */
      if (voiceSupported) toggleVoice();
      /* v8 ignore stop */
      return;
    }

    // Option+L to open prompt library
    if (e.key === "l" && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setShowPromptLibrary(true);
      return;
    }

    // Cmd+U to add attachment
    if (e.key === "u" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleAddAttachment();
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
      /* v8 ignore start -- isPlanApproval + onApprovePlan combo tested via Cmd+Enter path */
      if (isPlanApproval && onApprovePlan) {
        e.preventDefault();
        onApprovePlan();
        return;
      }
      /* v8 ignore stop */
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
    handleSlashInput(currentLine);
    if (currentLine.startsWith("/")) {
      setShowAtMenu(false);
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
    placeholderText = "Send a follow-up message...";
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
          bgStyle={{ backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)" }}
          secondaryActions={onRespondToPermission && (
            <div className="flex gap-1.5">
              <ActionBarButton onClick={() => onRespondToPermission(false)} icon={ShieldX} label="Deny" color="var(--error)" />
              {permissionRequest.suggestions && (
                <>
                  <ActionBarButton
                    onClick={() => onRespondToPermission(true, permissionRequest.suggestions, "user_temporary")}
                    icon={ShieldCheck}
                    label="Allow Session"
                    color="var(--success)"
                  />
                  <ActionBarButton
                    onClick={() => onRespondToPermission(true, permissionRequest.suggestions, "user_permanent")}
                    icon={ShieldCheck}
                    label="Always Allow"
                    color="var(--success)"
                  />
                </>
              )}
            </div>
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
                    aria-label={`Remove ${file.name}`}
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
              onPaste={handlePaste}
              placeholder={placeholderText}
              disabled={isStopping}
              aria-label="Chat message"
              rows={1}
              className="composer-textarea w-full resize-none bg-transparent text-sm outline-none"
              style={{
                color: "var(--text-primary)",
                minHeight: "80px",
                maxHeight: "200px",
              }}
            />
          </div>

          {/* Voice interim transcript */}
          {voiceListening && interimTranscript && (
            <div
              className="px-4 pb-1 text-xs italic"
              style={{ color: "var(--text-muted)" }}
            >
              {interimTranscript}...
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            {/* Left side: Model, Thinking, Plan */}
            <div className="flex items-center gap-1">
              {/* Model indicator/selector */}
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu((prev) => !prev)}
                  disabled={isStopping}
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
                    role="menu"
                    className="absolute bottom-full left-0 z-30 mb-1 rounded-lg shadow-lg py-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      minWidth: "120px",
                    }}
                    onKeyDown={(e) => {
                      const options = MODEL_OPTIONS;
                      const currentIdx = options.findIndex((o) => o.value === selectedModel);
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        const next = options[(currentIdx + 1) % options.length];
                        setSelectedModel(next.value);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        const prev = options[(currentIdx - 1 + options.length) % options.length];
                        setSelectedModel(prev.value);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        setShowModelMenu(false);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setShowModelMenu(false);
                      }
                    }}
                  >
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        role="menuitem"
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
                disabled={isStopping}
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
                disabled={isStopping}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] cursor-pointer transition-colors hover:opacity-80"
                style={{ color: planEnabled ? "var(--accent-orange)" : "var(--text-primary)" }}
                title={planEnabled ? "Disable plan mode (⇧⇥)" : "Enable plan mode (⇧⇥)"}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {planEnabled && <span>Plan</span>}
              </button>
              )}

            </div>

            {/* Right side: Context ring, Plus button, Send button */}
            <div className="flex items-center gap-1.5">
              {sessionStats && sessionStats.totalInputTokens > 0 && (
                <ContextUsageIndicator stats={sessionStats} />
              )}
              <div className="relative" ref={plusMenuRef}>
                <button
                  onClick={() => setShowPlusMenu((prev) => !prev)}
                  disabled={isStopping}
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
                      onClick={handleAddAttachmentFromMenu}
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
                    <button
                      onClick={() => { setShowPlusMenu(false); setShowPromptLibrary(true); }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <BookOpen className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                      <span className="flex-1">Prompt Library</span>
                      <kbd className="text-xs" style={{ color: "var(--text-muted)" }}>⌥L</kbd>
                    </button>
                  </div>
                )}
              </div>

              {/* Voice input button */}
              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  disabled={isStopping}
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:opacity-80 cursor-pointer ${
                    voiceListening ? "voice-recording" : ""
                  }`}
                  style={{
                    color: voiceListening ? "var(--error)" : "var(--text-muted)",
                  }}
                  title={voiceListening ? "Stop voice input (⌥V)" : "Start voice input (⌥V)"}
                >
                  {voiceListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}

              {(isRunning || isStopping) && (
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
              )}
              {!isStopping && (
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

      {showPromptLibrary && (
        <PromptLibraryDialog
          onClose={() => setShowPromptLibrary(false)}
          onInsert={(resolvedContent, displayName) => {
            setText(resolvedContent);
            setPendingCommandName(displayName);
            setPendingCommandContent(resolvedContent);
            setShowPromptLibrary(false);
          }}
        />
      )}
    </div>
  );
}
