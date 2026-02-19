import { useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

interface Props {
  contextId: string;
  contextType: "workspace" | "repo";
}

export function ChatPanel({ contextId, contextType }: Props) {
  const agentStore = useAgentStore();
  const chatStore = useChatStore();

  const agentStatus = agentStore.getStatus(contextId);
  const messages = chatStore.getMessages(contextId);
  const streamingText = chatStore.getStreamingText(contextId);

  // Subscribe to events when context changes
  useEffect(() => {
    agentStore.subscribe(contextId);
    chatStore.subscribe(contextId);
    agentStore.fetchStatus(contextId);

    return () => {
      agentStore.unsubscribe(contextId);
      chatStore.unsubscribe(contextId);
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

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        streamingText={streamingText}
        agentStatus={agentStatus}
      />
      <Composer
        agentStatus={agentStatus}
        onSend={handleSend}
        onStop={handleStop}
      />
    </div>
  );
}
