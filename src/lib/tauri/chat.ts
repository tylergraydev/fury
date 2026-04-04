import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { ChatMessage, ChatMessageSearchResult } from "./bindings.generated";
import type { PersistedChatMessage } from "./types";

export function toPersisted(
  msg: ChatMessage,
  workspaceId: string,
): PersistedChatMessage {
  return {
    id: msg.id,
    workspaceId,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp).toISOString(),
    ...(msg.displayText ? { displayText: msg.displayText } : {}),
    ...(msg.metadata ? { metadata: msg.metadata } : {}),
  };
}

export function fromPersisted(msg: PersistedChatMessage): ChatMessage {
  return {
    id: msg.id,
    workspaceId: msg.workspaceId,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp).toISOString(),
    ...(msg.displayText ? { displayText: msg.displayText } : {}),
    ...(msg.metadata ? { metadata: msg.metadata } : {}),
  };
}

// Chat persistence commands
export async function saveChatMessage(
  message: PersistedChatMessage,
): Promise<void> {
  return invoke("save_chat_message", { message });
}

export async function listChatMessages(
  workspaceId: string,
): Promise<PersistedChatMessage[]> {
  return invoke<PersistedChatMessage[]>("list_chat_messages", { workspaceId });
}

export async function clearChatMessages(
  workspaceId: string,
): Promise<void> {
  return invoke("clear_chat_messages", { workspaceId });
}

export async function searchChatMessages(
  query: string,
  workspaceId?: string,
): Promise<ChatMessageSearchResult[]> {
  return invoke<ChatMessageSearchResult[]>("search_chat_messages", {
    query,
    workspaceId,
  });
}
