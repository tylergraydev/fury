import { useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
}

export function ChatPanel({ contextId, contextType }: Props) {
  const agentStore = useAgentStore();
  const chatStore = useChatStore();
  const checkpointStore = useCheckpointStore();

  const agentStatus = agentStore.getStatus(contextId);
  const messages = chatStore.getMessages(contextId);
  const streamingText = chatStore.getStreamingText(contextId);
  const checkpoints = checkpointStore.getCheckpoints(contextId);
  const revertedTurnIndex = checkpointStore.getRevertedTurnIndex(contextId);

  // Subscribe to events when context changes
  useEffect(() => {
    agentStore.subscribe(contextId);
    chatStore.subscribe(contextId);
    agentStore.fetchStatus(contextId);

    if (contextType === "workspace") {
      checkpointStore.subscribe(contextId);
      checkpointStore.loadCheckpoints(contextId);
      useTodoStore.getState().loadTodos(contextId);
    }

    return () => {
      agentStore.unsubscribe(contextId);
      chatStore.unsubscribe(contextId);
      if (contextType === "workspace") {
        checkpointStore.unsubscribe(contextId);
      }
    };
  }, [contextId]);

  const handleSend = async (message: string) => {
    chatStore.addUserMessage(contextId, message);
    try {
      await agentStore.sendMessage(contextId, message, contextType);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  };

  const handleStop = async () => {
    try {
      await agentStore.stopAgent(contextId);
    } catch (e) {
      console.error("Failed to stop agent:", e);
    }
  };

  const handleRevert = async (checkpointId: string) => {
    try {
      await checkpointStore.revertToCheckpoint(contextId, checkpointId);
    } catch (e) {
      console.error("Failed to revert:", e);
    }
  };

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
