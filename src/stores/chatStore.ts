import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChatMessage,
  ContentBlock,
  FrontendStreamEvent,
} from "../lib/tauri";

interface ChatStore {
  messages: Record<string, ChatMessage[]>;
  streamingText: Record<string, string>;
  subscriptions: Record<string, UnlistenFn>;

  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  addUserMessage: (workspaceId: string, text: string) => void;
  clearMessages: (workspaceId: string) => void;
  getMessages: (workspaceId: string) => ChatMessage[];
  getStreamingText: (workspaceId: string) => string;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},
  streamingText: {},
  subscriptions: {},

  subscribe: async (workspaceId: string) => {
    if (get().subscriptions[workspaceId]) return;

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
    }));
  },

  clearMessages: (workspaceId: string) => {
    set((state) => ({
      messages: { ...state.messages, [workspaceId]: [] },
      streamingText: { ...state.streamingText, [workspaceId]: "" },
    }));
  },

  getMessages: (workspaceId: string) => {
    return get().messages[workspaceId] ?? [];
  },

  getStreamingText: (workspaceId: string) => {
    return get().streamingText[workspaceId] ?? "";
  },
}));

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

      // If error, add an error message
      if (event.isError && event.result) {
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: [{ type: "text", text: `Error: ${event.result}` }],
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
          },
        }));
      }
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
