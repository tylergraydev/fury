import { useCallback, useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";
import type { ChatMessage, Checkpoint } from "../../lib/tauri";
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
      />
      <Composer
        workspaceId={contextType === "workspace" ? contextId : undefined}
        agentStatus={agentStatus}
        onSend={handleSend}
        onStop={handleStop}
      />
    </div>
  );
}
