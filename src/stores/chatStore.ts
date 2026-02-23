import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChatMessage,
  ContentBlock,
  FrontendStreamEvent,
} from "../lib/tauri";
import {
  saveChatMessage,
  listChatMessages,
  clearChatMessages as clearChatMessagesCmd,
  toPersisted,
  fromPersisted,
} from "../lib/tauri";

interface ChatStore {
  messages: Record<string, ChatMessage[]>;
  streamingText: Record<string, string>;
  planApproval: Record<string, boolean>;
  subscriptions: Record<string, UnlistenFn>;

  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  addUserMessage: (workspaceId: string, text: string) => void;
  clearMessages: (workspaceId: string) => void;
  getMessages: (workspaceId: string) => ChatMessage[];
  getStreamingText: (workspaceId: string) => string;
  getPlanContent: (workspaceId: string) => string;
  loadMessages: (workspaceId: string) => Promise<void>;
  removeTrailingSystemMessages: (workspaceId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},
  streamingText: {},
  planApproval: {},
  subscriptions: {},

  subscribe: async (workspaceId: string) => {
    if (get().subscriptions[workspaceId]) return;

    // Load persisted messages if we don't have any in memory
    if (!(get().messages[workspaceId]?.length)) {
      await get().loadMessages(workspaceId);
    }

    const unlisten = await listen<FrontendStreamEvent>(
      `agent-stream:${workspaceId}`,
      (event) => {
        const payload = event.payload;
        handleStreamEvent(workspaceId, payload, set, get);
      },
    );

    set((state) => ({
      subscriptions: { ...state.subscriptions, [workspaceId]: unlisten },
    }));
  },

  unsubscribe: (workspaceId: string) => {
    const unsub = get().subscriptions[workspaceId];
    if (unsub) {
      unsub();
      set((state) => {
        const { [workspaceId]: _, ...rest } = state.subscriptions;
        return { subscriptions: rest };
      });
    }
  },

  addUserMessage: (workspaceId: string, text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
      },
      planApproval: { ...state.planApproval, [workspaceId]: false },
    }));
    persistMessage(workspaceId, msg);
  },

  clearMessages: (workspaceId: string) => {
    set((state) => ({
      messages: { ...state.messages, [workspaceId]: [] },
      streamingText: { ...state.streamingText, [workspaceId]: "" },
      planApproval: { ...state.planApproval, [workspaceId]: false },
    }));
    clearChatMessagesCmd(workspaceId).catch(console.error);
  },

  getMessages: (workspaceId: string) => {
    return get().messages[workspaceId] ?? [];
  },

  getStreamingText: (workspaceId: string) => {
    return get().streamingText[workspaceId] ?? "";
  },

  getPlanContent: (workspaceId: string) => {
    const msgs = get().messages[workspaceId] ?? [];
    // Walk backwards to find text content from the last assistant messages
    const textParts: string[] = [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.role !== "assistant") break;
      for (const block of msg.content) {
        if (block.type === "text" && block.text.trim()) {
          textParts.unshift(block.text);
        }
      }
    }
    return textParts.join("\n\n");
  },

  loadMessages: async (workspaceId: string) => {
    try {
      const persisted = await listChatMessages(workspaceId);
      const messages = persisted.map(fromPersisted);
      if (messages.length > 0) {
        set((state) => ({
          messages: {
            ...state.messages,
            [workspaceId]: messages,
          },
        }));
      }
    } catch (e) {
      console.error("Failed to load chat messages:", e);
    }
  },

  removeTrailingSystemMessages: (workspaceId: string) => {
    set((state) => {
      const msgs = state.messages[workspaceId] ?? [];
      let i = msgs.length;
      while (i > 0 && msgs[i - 1].role === "system") i--;
      if (i === msgs.length) return state;
      return {
        messages: { ...state.messages, [workspaceId]: msgs.slice(0, i) },
      };
    });
  },
}));

// Fire-and-forget persist helper
function persistMessage(workspaceId: string, msg: ChatMessage) {
  saveChatMessage(toPersisted(msg, workspaceId)).catch(console.error);
}

function formatErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();

  // API HTTP errors (e.g. "500 Internal server error", "API Error: 500 ...")
  // Anchor to HTTP-status contexts to avoid matching arbitrary numbers like "512 tokens"
  const statusMatch =
    raw.match(/\b(?:status|code|error|HTTP)[:\s]+(\d{3})\b/i) ??
    raw.match(/^(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const code = statusMatch[1];
    if (code === "500" || lower.includes("internal server error")) {
      return "API error (500) — the provider hit an internal error. Please retry.";
    }
    if (code === "429" || lower.includes("rate limit") || lower.includes("too many")) {
      return "Rate limited (429) — too many requests. Wait a moment and retry.";
    }
    if (code === "401" || lower.includes("unauthorized") || lower.includes("authentication")) {
      return "Authentication error (401) — check your API key.";
    }
    if (code === "403" || lower.includes("forbidden")) {
      return "Access denied (403) — you don't have permission for this resource.";
    }
    if (code === "404") {
      return "Not found (404) — the requested resource doesn't exist.";
    }
    if (code.startsWith("5")) {
      return `Server error (${code}) — a temporary provider issue. Please retry.`;
    }
    if (code.startsWith("4")) {
      return `Request error (${code}) — please check your input and retry.`;
    }
  }

  // Timeout / network errors
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Request timed out — the API took too long to respond. Please retry.";
  }
  if (lower.includes("network") || lower.includes("econnrefused") || lower.includes("enotfound")) {
    return "Network error — couldn't reach the API. Check your connection.";
  }

  // Overloaded
  if (lower.includes("overloaded")) {
    return "API is overloaded — please wait a moment and retry.";
  }

  // Fallback: show a trimmed version
  const trimmed = raw.length > 120 ? raw.slice(0, 117) + "..." : raw;
  return `Error: ${trimmed}`;
}

function handleStreamEvent(
  workspaceId: string,
  event: FrontendStreamEvent,
  set: (
    fn: (
      state: ChatStore,
    ) => Partial<ChatStore>,
  ) => void,
  get: () => ChatStore,
) {
  switch (event.type) {
    case "system": {
      // System messages can optionally be shown
      if (event.message) {
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: [{ type: "text", text: event.message }],
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
          },
        }));
        persistMessage(workspaceId, msg);
      }
      break;
    }

    case "assistantText": {
      // Accumulate streaming text
      set((state) => ({
        streamingText: {
          ...state.streamingText,
          [workspaceId]:
            (state.streamingText[workspaceId] ?? "") + event.text,
        },
      }));
      break;
    }

    case "toolUse": {
      // Finalize any streaming text first, then add tool use block
      finalizeStreamingText(workspaceId, set, get);
      const block: ContentBlock = {
        type: "toolUse",
        id: event.id,
        name: event.name,
        input: event.input,
      };
      appendContentBlock(workspaceId, block, set, get);

      // Detect plan approval requests
      if (event.name.toLowerCase().includes("exitplanmode")) {
        set((state) => ({
          planApproval: { ...state.planApproval, [workspaceId]: true },
        }));
      }
      break;
    }

    case "toolResult": {
      const block: ContentBlock = {
        type: "toolResult",
        toolUseId: event.toolUseId,
        content: event.content,
      };
      appendContentBlock(workspaceId, block, set, get);
      break;
    }

    case "result": {
      // Finalize any remaining streaming text as the final assistant message
      finalizeStreamingText(workspaceId, set, get);

      // Clear plan approval state when agent finishes
      set((state) => ({
        planApproval: { ...state.planApproval, [workspaceId]: false },
      }));

      // If error, add a user-friendly error message
      if (event.isError && event.result) {
        const friendly = formatErrorMessage(event.result);
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: [{ type: "text", text: friendly }],
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
          },
        }));
        persistMessage(workspaceId, msg);
      }

      // Persist the final state of the last assistant message
      const messages = get().messages[workspaceId] ?? [];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        persistMessage(workspaceId, lastMsg);
      }
      break;
    }

    default: {
      console.warn(`[chat] Unknown stream event type: ${(event as { type: string }).type}`);
      break;
    }
  }
}

function finalizeStreamingText(
  workspaceId: string,
  set: (fn: (state: ChatStore) => Partial<ChatStore>) => void,
  get: () => ChatStore,
) {
  const text = get().streamingText[workspaceId] ?? "";
  if (text) {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
      },
      streamingText: { ...state.streamingText, [workspaceId]: "" },
    }));
    persistMessage(workspaceId, msg);
  }
}

function appendContentBlock(
  workspaceId: string,
  block: ContentBlock,
  set: (fn: (state: ChatStore) => Partial<ChatStore>) => void,
  get: () => ChatStore,
) {
  const messages = get().messages[workspaceId] ?? [];
  const lastMsg = messages[messages.length - 1];

  // Append to last assistant message, or create new one
  if (lastMsg && lastMsg.role === "assistant") {
    const updated = {
      ...lastMsg,
      content: [...lastMsg.content, block],
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...messages.slice(0, -1), updated],
      },
    }));
    // Persist after each tool result for crash durability
    if (block.type === "toolResult") {
      persistMessage(workspaceId, updated);
    }
  } else {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: [block],
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
      },
    }));
  }
}
