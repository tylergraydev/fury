import { useCallback, useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";
import type { ChatMessage, Checkpoint } from "../../lib/tauri";
import { respondToPermission } from "../../lib/tauri";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

// Stable references for empty defaults — avoids infinite re-render with useSyncExternalStore
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_CHECKPOINTS: Checkpoint[] = [];

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
  const checkpoints = useCheckpointStore(
    (s) => s.checkpoints[contextId] ?? EMPTY_CHECKPOINTS,
  );
  const revertedTurnIndex = useCheckpointStore(
    (s) => s.revertedTurnIndex[contextId] ?? null,
  );
  const isPlanApproval = useChatStore(
    (s) => s.planApproval[contextId] ?? false,
  );
  const permissionRequest = useChatStore(
    (s) => s.permissionRequest[contextId] ?? null,
  );

  // Subscribe to events when context changes
  useEffect(() => {
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

    return () => {
      agent.unsubscribe(contextId);
      chat.unsubscribe(contextId);
      if (contextType === "workspace") {
        cp.unsubscribe(contextId);
      }
    };
  }, [contextId, contextType]);

  // Clear stale permission request when agent stops (e.g. process crash without result event)
  useEffect(() => {
    if (agentStatus !== "Running" && permissionRequest) {
      useChatStore.getState().clearPermissionRequest(contextId);
    }
  }, [agentStatus, contextId, permissionRequest]);

  const handleSend = useCallback(
    async (message: string, model?: string) => {
      useChatStore.getState().addUserMessage(contextId, message);
      try {
        await useAgentStore
          .getState()
          .sendMessage(contextId, message, contextType, model);
      } catch (e) {
        console.error("Failed to send message:", e);
      }
    },
    [contextId, contextType],
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
    useChatStore.getState().addUserMessage(contextId, text);
    try {
      await useAgentStore
        .getState()
        .sendMessage(contextId, text, contextType);
    } catch (e) {
      console.error("Failed to retry message:", e);
    }
  }, [contextId, contextType, agentStatus]);

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

  const handleApprovePermission = useCallback(async () => {
    try {
      await respondToPermission(contextId, true);
      useChatStore.getState().clearPermissionRequest(contextId);
    } catch (e) {
      console.error("Failed to approve permission:", e);
    }
  }, [contextId]);

  const handleDenyPermission = useCallback(async () => {
    try {
      await respondToPermission(contextId, false);
      useChatStore.getState().clearPermissionRequest(contextId);
    } catch (e) {
      console.error("Failed to deny permission:", e);
    }
  }, [contextId]);

  const handleRevert = useCallback(
    async (checkpointId: string) => {
      try {
        await useCheckpointStore
          .getState()
          .revertToCheckpoint(contextId, checkpointId);
      } catch (e) {
        console.error("Failed to revert:", e);
      }
    },
    [contextId],
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        streamingText={streamingText}
        agentStatus={agentStatus}
        checkpoints={contextType === "workspace" ? checkpoints : undefined}
        revertedTurnIndex={revertedTurnIndex}
        onRevertCheckpoint={
          contextType === "workspace" ? handleRevert : undefined
        }
        onRetry={handleRetry}
      />
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
        onApprovePermission={handleApprovePermission}
        onDenyPermission={handleDenyPermission}
      />
    </div>
  );
}
