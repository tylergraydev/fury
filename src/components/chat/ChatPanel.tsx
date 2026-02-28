import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, Search } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";
import type { ChatMessage } from "../../lib/tauri";
import { respondToPermission } from "../../lib/tauri";
import { MessageList, segmentTurns } from "./MessageList";
import { Composer } from "./Composer";
import { ChatTOC } from "./ChatTOC";
import { ChatSearch } from "./ChatSearch";
import { LinkWorkspaceDialog } from "../workspace/LinkWorkspaceDialog";
import { IssuePicker } from "../workspace/IssuePicker";
import { useWorkspaceStore } from "../../stores/workspaceStore";

// Stable references for empty defaults — avoids infinite re-render with useSyncExternalStore
const EMPTY_MESSAGES: ChatMessage[] = [];

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
}

export function ChatPanel({ contextId, contextType }: Props) {
  const agentStatus = useAgentStore(
    (s) => s.agents[contextId]?.status ?? "Idle",
  );
  const messages = useChatStore(
    (s) => s.messages[contextId] ?? EMPTY_MESSAGES,
  );
  const streamingText = useChatStore(
    (s) => s.streamingText[contextId] ?? "",
  );
  const isPlanApproval = useChatStore(
    (s) => s.planApproval[contextId] ?? false,
  );
  const permissionRequest = useChatStore(
    (s) => s.permissionRequest[contextId] ?? null,
  );

  // Toggle state for thinking and plan mode — lifted here so handleRetry can use it
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [planEnabled, setPlanEnabled] = useState(true);
  const [showTOC, setShowTOC] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [showLinkWorkspaceDialog, setShowLinkWorkspaceDialog] = useState(false);
  const [showIssuePicker, setShowIssuePicker] = useState(false);
  const workspace = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === contextId) ?? null,
  );

  // Subscribe to events when context changes — deferred by one frame to avoid
  // flooding IPC during the initial mount burst.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const agent = useAgentStore.getState();
      const chat = useChatStore.getState();
      const cp = useCheckpointStore.getState();

      agent.subscribe(contextId);
      chat.subscribe(contextId);
      agent.fetchStatus(contextId);

      if (contextType === "workspace") {
        cp.subscribe(contextId);
        cp.loadCheckpoints(contextId);
        useTodoStore.getState().loadTodos(contextId);
      }
    });

    // NOTE: We intentionally do NOT unsubscribe agent/chat listeners on unmount.
    // These must stay alive so events aren't missed when the user switches tabs.
    // Subscriptions are deduplicated in the stores, so re-mounting is a no-op.
    return () => {
      cancelAnimationFrame(id);
      if (contextType === "workspace") {
        useCheckpointStore.getState().unsubscribe(contextId);
      }
    };
  }, [contextId, contextType]);

  // Clear stale permission request when agent stops (e.g. process crash without result event)
  useEffect(() => {
    if (agentStatus !== "Running" && permissionRequest) {
      useChatStore.getState().clearPermissionRequest(contextId);
    }
  }, [agentStatus, contextId, permissionRequest]);

  const tocRef = useRef<HTMLDivElement>(null);
  const tocButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  const { turns } = useMemo(() => segmentTurns(messages), [messages]);
  const showTOCButton = turns.length >= 3;

  // Dismiss TOC on outside click using ref-based containment check
  useEffect(() => {
    if (!showTOC) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        tocRef.current?.contains(e.target as Node) ||
        tocButtonRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setShowTOC(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showTOC]);

  // Dismiss search on outside click
  useEffect(() => {
    if (!showSearch) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        searchRef.current?.contains(e.target as Node) ||
        searchButtonRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setShowSearch(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showSearch]);

  const handleSearchNavigate = useCallback((messageId: string) => {
    setHighlightMessageId(messageId);
    // Clear highlight after animation
    setTimeout(() => setHighlightMessageId(null), 2000);
  }, []);

  const handleSend = useCallback(
    async (message: string, model?: string, displayText?: string) => {
      const disableThinking = thinkingEnabled ? undefined : true;
      const disablePlanMode = planEnabled ? undefined : true;
      useChatStore.getState().addUserMessage(contextId, message, displayText);
      try {
        await useAgentStore
          .getState()
          .sendMessage(contextId, message, contextType, model, disableThinking, disablePlanMode);
      } catch (e) {
        console.error("Failed to send message:", e);
      }
    },
    [contextId, contextType, thinkingEnabled, planEnabled],
  );

  const handleStop = useCallback(async () => {
    try {
      await useAgentStore.getState().stopAgent(contextId);
    } catch (e) {
      console.error("Failed to stop agent:", e);
    }
  }, [contextId]);

  const handleRetry = useCallback(async () => {
    if (agentStatus === "Running" || agentStatus === "Stopping") return;
    // Find the last user message and resend it
    const allMessages = useChatStore.getState().getMessages(contextId);
    const lastUserMsg = [...allMessages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    const text = lastUserMsg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) return;
    // Remove trailing system (error) messages before retrying
    useChatStore.getState().removeTrailingSystemMessages(contextId);
    useChatStore.getState().addUserMessage(contextId, text, lastUserMsg.displayText);
    const disableThinking = thinkingEnabled ? undefined : true;
    const disablePlanMode = planEnabled ? undefined : true;
    try {
      await useAgentStore
        .getState()
        .sendMessage(contextId, text, contextType, undefined, disableThinking, disablePlanMode);
    } catch (e) {
      console.error("Failed to retry message:", e);
    }
  }, [contextId, contextType, agentStatus, thinkingEnabled, planEnabled]);

  const handleApprovePlan = useCallback(async () => {
    await handleSend("yes");
  }, [handleSend]);

  const handleCopyPlan = useCallback(async () => {
    const plan = useChatStore.getState().getPlanContent(contextId);
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan);
    } catch (e) {
      console.error("[ChatPanel] Failed to copy plan to clipboard:", e);
    }
  }, [contextId]);

  const handleRespondToPermission = useCallback(async (approved: boolean) => {
    try {
      await respondToPermission(contextId, approved);
      useChatStore.getState().clearPermissionRequest(contextId);
    } catch (e) {
      console.error("Failed to respond to permission:", e);
    }
  }, [contextId]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-1 flex-col min-h-0">
        <MessageList
          messages={messages}
          streamingText={streamingText}
          agentStatus={agentStatus}
          onRetry={handleRetry}
          highlightMessageId={highlightMessageId}
          contextId={contextId}
          contextType={contextType}
        />
        <div className="absolute right-3 top-3 z-20 flex gap-1">
          <button
            ref={searchButtonRef}
            onClick={() => {
              setShowSearch((prev) => !prev);
              if (!showSearch) setShowTOC(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              color: showSearch ? "var(--accent)" : "var(--text-muted)",
              backgroundColor: showSearch ? "var(--bg-surface)" : "transparent",
            }}
            title="Search messages"
          >
            <Search className="h-4 w-4" />
          </button>
          {showTOCButton && (
            <button
              ref={tocButtonRef}
              onClick={() => {
                setShowTOC((prev) => !prev);
                if (!showTOC) setShowSearch(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                color: showTOC ? "var(--accent)" : "var(--text-muted)",
                backgroundColor: showTOC ? "var(--bg-surface)" : "transparent",
              }}
              title="Table of Contents"
            >
              <List className="h-4 w-4" />
            </button>
          )}
        </div>
        {showTOC && (
          <div ref={tocRef}>
            <ChatTOC turns={turns} onClose={() => setShowTOC(false)} />
          </div>
        )}
        {showSearch && (
          <div ref={searchRef}>
            <ChatSearch
              contextId={contextId}
              onClose={() => setShowSearch(false)}
              onNavigate={handleSearchNavigate}
            />
          </div>
        )}
      </div>
      <Composer
        contextId={contextId}
        contextType={contextType}
        agentStatus={agentStatus}
        onSend={handleSend}
        onStop={handleStop}
        isPlanApproval={isPlanApproval}
        onApprovePlan={handleApprovePlan}
        onCopyPlan={handleCopyPlan}
        permissionRequest={permissionRequest}
        onRespondToPermission={handleRespondToPermission}
        thinkingEnabled={thinkingEnabled}
        onThinkingEnabledChange={setThinkingEnabled}
        planEnabled={planEnabled}
        onPlanEnabledChange={setPlanEnabled}
        onLinkWorkspaces={contextType === "workspace" ? () => setShowLinkWorkspaceDialog(true) : undefined}
        onLinkIssue={contextType === "workspace" ? () => setShowIssuePicker(true) : undefined}
      />
      {showLinkWorkspaceDialog && contextType === "workspace" && workspace && (
        <LinkWorkspaceDialog
          workspaceId={contextId}
          workspaceName={workspace.name}
          repoId={workspace.repoId}
          onClose={() => setShowLinkWorkspaceDialog(false)}
        />
      )}
      {showIssuePicker && contextType === "workspace" && (
        <IssuePicker
          workspaceId={contextId}
          onClose={() => setShowIssuePicker(false)}
        />
      )}
    </div>
  );
}
