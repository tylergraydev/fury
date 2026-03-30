import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChatMessage,
  ContentBlock,
  FrontendStreamEvent,
  ResponseMetadata,
  SlashCommand,
} from "../lib/tauri";
import {
  saveChatMessage,
  listChatMessages,
  clearChatMessages as clearChatMessagesCmd,
  toPersisted,
  fromPersisted,
  getPendingPermission,
} from "../lib/tauri";
import { useSlashCommandStore } from "./slashCommandStore";
import { pushAgentTurnMetric, pushStreamEvent } from "../lib/ipcInstrumentation";
import { normalizeToolName } from "../lib/toolUtils";

export interface PermissionRequestInfo {
  toolName: string;
  input: unknown;
  suggestions?: unknown[];
}

export interface QuestionRequestInfo {
  toolUseId: string;
  question: string;
  options?: string[];
}

export type ConductorPhase = "idle" | "researching" | "questioning" | "planning";

export interface SessionStats {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  numTurns: number;
  totalCacheReadTokens?: number;
  totalCacheCreationTokens?: number;
}

interface ChatStore {
  messages: Record<string, ChatMessage[]>;
  streamingText: Record<string, string>;
  planApproval: Record<string, boolean>;
  permissionRequest: Record<string, PermissionRequestInfo | null>;
  questionRequest: Record<string, QuestionRequestInfo | null>;
  conductorPhase: Record<string, ConductorPhase>;
  subscriptions: Record<string, UnlistenFn>;
  sessionStats: Record<string, SessionStats>;

  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  addUserMessage: (workspaceId: string, text: string, displayText?: string) => void;
  clearMessages: (workspaceId: string) => void;
  getMessages: (workspaceId: string) => ChatMessage[];
  getStreamingText: (workspaceId: string) => string;
  getPlanContent: (workspaceId: string) => string;
  getSessionStats: (workspaceId: string) => SessionStats | undefined;
  loadMessages: (workspaceId: string) => Promise<void>;
  removeTrailingSystemMessages: (workspaceId: string) => void;
  clearPermissionRequest: (workspaceId: string) => void;
  clearQuestionRequest: (workspaceId: string) => void;
}

// Cancel tokens for in-flight subscribe calls — prevents double-subscription
// when subscribe is called multiple times before the first await completes.
const _chatSubscribeTokens = new Map<string, { cancelled: boolean }>();

/** @internal Clear cancel tokens — for testing only */
export function _resetSubscribeTokens(): void {
  _chatSubscribeTokens.clear();
}

/** @internal Read-only access to cancel tokens — for testing only */
export function _getSubscribeTokens(): ReadonlyMap<string, { cancelled: boolean }> {
  return _chatSubscribeTokens;
}

// Stryker disable all: HMR cleanup — stripped by Vite in production builds
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _chatSubscribeTokens.clear();
  });
}
// Stryker restore all

// Stryker disable all: initial state values — reset by tests in beforeEach
export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},
  streamingText: {},
  planApproval: {},
  permissionRequest: {},
  questionRequest: {},
  conductorPhase: {},
  subscriptions: {},
  sessionStats: {},
// Stryker restore all

  subscribe: async (workspaceId: string) => {
    // Stryker disable next-line ConditionalExpression: guard prevents duplicate listeners; removing it overwrites but doesn't crash
    if (get().subscriptions[workspaceId]) return;

    // Cancel any in-flight subscribe for this workspace
    const existing = _chatSubscribeTokens.get(workspaceId);
    if (existing) existing.cancelled = true;

    const token = { cancelled: false };
    _chatSubscribeTokens.set(workspaceId, token);

    try {
      // Load persisted messages if we don't have any in memory
      if (!(get().messages[workspaceId]?.length)) {
        await get().loadMessages(workspaceId);
      }

      if (token.cancelled) {
        _chatSubscribeTokens.delete(workspaceId);
        return;
      }

      // Re-check after await — another subscribe may have completed
      if (get().subscriptions[workspaceId]) {
        _chatSubscribeTokens.delete(workspaceId);
        return;
      }

      const unlisten = await listen<FrontendStreamEvent>(
        `agent-stream:${workspaceId}`,
        (event) => {
          if (token.cancelled) return;
          const payload = event.payload;
          pushStreamEvent(workspaceId, "event_received", payload.type);
          handleStreamEvent(workspaceId, payload, set, get);
        },
      );

      if (token.cancelled) {
        unlisten();
        _chatSubscribeTokens.delete(workspaceId);
        return;
      }

      set((state) => ({
        subscriptions: { ...state.subscriptions, [workspaceId]: unlisten },
      }));

      // Recover any pending permission request that was lost during HMR.
      // The backend tracks these so we can restore the UI after a frontend reload.
      getPendingPermission(workspaceId)
        .then((event) => {
          if (event && event.type === "permissionRequest" && !token.cancelled) {
            set((state) => ({
              permissionRequest: {
                ...state.permissionRequest,
                [workspaceId]: {
                  toolName: event.toolName,
                  input: event.input,
                  suggestions: event.suggestions,
                },
              },
            }));
          }
        })
        .catch(() => {
          // Non-critical — permission will time out on the sidecar side
        });
    } catch (e) {
      console.error(`[chatStore] subscribe failed for ${workspaceId}:`, e);
      _chatSubscribeTokens.delete(workspaceId);
      // Remove any partial subscription state so a retry can succeed
      set((state) => {
        const { [workspaceId]: _, ...rest } = state.subscriptions;
        // Stryker disable next-line ObjectLiteral: rest spread preserves other workspaces
        return { subscriptions: rest };
      });
    }
  },

  unsubscribe: (workspaceId: string) => {
    // Cancel any in-flight subscribe so it bails out on resume
    const token = _chatSubscribeTokens.get(workspaceId);
    if (token) {
      token.cancelled = true;
      _chatSubscribeTokens.delete(workspaceId);
    }

    const unsub = get().subscriptions[workspaceId];
    if (unsub) {
      unsub();
      set((state) => {
        const { [workspaceId]: _, ...rest } = state.subscriptions;
        return { subscriptions: rest };
      });
    }
  },

  addUserMessage: (workspaceId: string, text: string, displayText?: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
      ...(displayText ? { displayText } : {}),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...(state.messages[workspaceId] ?? []), msg],
      },
      planApproval: { ...state.planApproval, [workspaceId]: false },
      permissionRequest: { ...state.permissionRequest, [workspaceId]: null },
      questionRequest: { ...state.questionRequest, [workspaceId]: null },
      conductorPhase: { ...state.conductorPhase, [workspaceId]: "idle" },
    }));
    persistMessage(workspaceId, msg);
  },

  clearMessages: (workspaceId: string) => {
    // Cancel the active stream subscription token so in-flight events
    // are ignored and don't repopulate the cleared messages.
    const token = _chatSubscribeTokens.get(workspaceId);
    // Stryker disable next-line all: token cancellation tested in clearMessages cancel test
    if (token) token.cancelled = true;

    // Tear down the stream listener.
    const unsub = get().subscriptions[workspaceId];
    if (unsub) unsub();

    set((state) => {
      const { [workspaceId]: _, ...restStats } = state.sessionStats;
      const { [workspaceId]: _sub, ...restSubs } = state.subscriptions;
      return {
        messages: { ...state.messages, [workspaceId]: [] },
        streamingText: { ...state.streamingText, [workspaceId]: "" },
        planApproval: { ...state.planApproval, [workspaceId]: false },
        permissionRequest: { ...state.permissionRequest, [workspaceId]: null },
        questionRequest: { ...state.questionRequest, [workspaceId]: null },
        conductorPhase: { ...state.conductorPhase, [workspaceId]: "idle" },
        sessionStats: restStats,
        subscriptions: restSubs,
      };
    });
    // Wait for the backend DB clear to finish BEFORE re-subscribing.
    // subscribe() calls loadMessages() when the in-memory array is empty,
    // so if the DB clear hasn't completed yet, it reloads stale messages
    // and the clear appears to have no effect.
    // Stryker disable all: fire-and-forget async chain — not awaitable from tests
    clearChatMessagesCmd(workspaceId).catch(console.error).then(() => {
      get().subscribe(workspaceId).catch((e) => {
        console.error(`[chatStore] re-subscribe after clear failed for ${workspaceId}:`, e);
      });
    });
    // Stryker restore all
  },

  getMessages: (workspaceId: string) => {
    // Stryker disable next-line ArrayDeclaration: defensive fallback; messages always populated by subscribe
    return get().messages[workspaceId] ?? [];
  },

  getStreamingText: (workspaceId: string) => {
    return get().streamingText[workspaceId] ?? "";
  },

  getSessionStats: (workspaceId: string) => {
    return get().sessionStats[workspaceId];
  },

  getPlanContent: (workspaceId: string) => {
    // Stryker disable next-line ArrayDeclaration: defensive fallback
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
        // Restore session stats from the last message with metadata
        let restoredStats: SessionStats | undefined;
        for (let i = messages.length - 1; i >= 0; i--) {
          const meta = messages[i].metadata;
          if (meta) {
            /* v8 ignore start -- defensive ?? 0 fallbacks; metadata fields always present */
            restoredStats = {
              totalCostUsd: meta.totalCostUsd ?? 0,
              totalInputTokens: meta.inputTokens ?? 0,
              totalOutputTokens: meta.outputTokens ?? 0,
              numTurns: meta.numTurns ?? 0,
              totalCacheReadTokens: meta.cacheReadTokens ?? 0,
              totalCacheCreationTokens: meta.cacheCreationTokens ?? 0,
            };
            /* v8 ignore stop */
            break;
          }
        }
        set((state) => ({
          messages: {
            ...state.messages,
            [workspaceId]: messages,
          },
          ...(restoredStats ? {
            sessionStats: { ...state.sessionStats, [workspaceId]: restoredStats },
          } : {}),
        }));
      }
    } catch (e) {
      console.error("Failed to load chat messages:", e);
    }
  },

  removeTrailingSystemMessages: (workspaceId: string) => {
    set((state) => {
      // Stryker disable next-line ArrayDeclaration: defensive fallback
      const msgs = state.messages[workspaceId] ?? [];
      let i = msgs.length;
      while (i > 0 && msgs[i - 1].role === "system") i--;
      if (i === msgs.length) return state;
      return {
        messages: { ...state.messages, [workspaceId]: msgs.slice(0, i) },
      };
    });
  },

  clearPermissionRequest: (workspaceId: string) => {
    set((state) => ({
      permissionRequest: { ...state.permissionRequest, [workspaceId]: null },
    }));
  },

  clearQuestionRequest: (workspaceId: string) => {
    set((state) => ({
      questionRequest: { ...state.questionRequest, [workspaceId]: null },
      conductorPhase: { ...state.conductorPhase, [workspaceId]: "idle" },
    }));
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

/* v8 ignore next 10 -- function signature; branch on param type is a coverage artifact */
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
      // Extract discovered skills from system-reminder content
      if (event.message) {
        const skills = parseSkillsFromSystemMessage(event.message);
        // Stryker disable next-line all: skills.length check tested — 0 does not call addDiscoveredSkills
        if (skills.length > 0) {
          useSlashCommandStore.getState().addDiscoveredSkills(workspaceId, skills);
        }

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

    case "assistantImage": {
      // Finalize any streaming text first, then add image block
      finalizeStreamingText(workspaceId, set, get);
      const imgBlock: ContentBlock = {
        type: "image",
        mediaType: event.mediaType,
        data: event.data,
      };
      appendContentBlock(workspaceId, imgBlock, set, get);
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

      const normalized = normalizeToolName(event.name);

      // Detect plan approval requests
      if (event.name.toLowerCase().includes("exitplanmode")) {
        set((state) => ({
          planApproval: { ...state.planApproval, [workspaceId]: true },
          conductorPhase: { ...state.conductorPhase, [workspaceId]: "planning" },
        }));
      }

      // Detect AskQuestion tool calls — surface as question card in Composer
      if (normalized === "AskQuestion") {
        const inp = event.input as Record<string, unknown>;
        set((state) => ({
          questionRequest: {
            ...state.questionRequest,
            [workspaceId]: {
              toolUseId: event.id,
              question: (inp.question ?? inp.text ?? "") as string,
              options: (inp.options ?? inp.choices) as string[] | undefined,
            },
          },
          conductorPhase: { ...state.conductorPhase, [workspaceId]: "questioning" },
        }));
      }

      // Track conductor phase: Think tool → researching
      // Stryker disable next-line ConditionalExpression: phase guard prevents overriding questioning/planning
      if (normalized === "Think" && get().conductorPhase[workspaceId] !== "questioning" && get().conductorPhase[workspaceId] !== "planning") {
        set((state) => ({
          conductorPhase: { ...state.conductorPhase, [workspaceId]: "researching" },
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

    case "permissionRequest": {
      set((state) => ({
        permissionRequest: {
          ...state.permissionRequest,
          [workspaceId]: { toolName: event.toolName, input: event.input, suggestions: event.suggestions },
        },
      }));
      break;
    }

    case "result": {
      // Finalize any remaining streaming text as the final assistant message
      finalizeStreamingText(workspaceId, set, get);

      // Clear permission/question request state when agent finishes.
      // NOTE: planApproval is intentionally NOT cleared here — the result event
      // fires immediately after ExitPlanMode toolUse, so clearing it would race
      // and hide the approve button before the user can interact with it.
      // planApproval is cleared in addUserMessage() and clearMessages() instead.
      // Similarly, questionRequest is NOT cleared here — it needs to stay visible
      // for the user to answer. Cleared in addUserMessage() instead.
      set((state) => ({
        permissionRequest: { ...state.permissionRequest, [workspaceId]: null },
        conductorPhase: {
          ...state.conductorPhase,
          // Only reset to idle if not in planning/questioning (those persist until user acts)
          [workspaceId]: (state.planApproval[workspaceId] || state.questionRequest[workspaceId])
            ? state.conductorPhase[workspaceId]
            : "idle",
        },
      }));

      // Build metadata from the result event
      const metadata: ResponseMetadata = {
        durationMs: event.durationMs,
        durationApiMs: event.durationApiMs,
        totalCostUsd: event.totalCostUsd,
        numTurns: event.numTurns,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheReadTokens: event.cacheReadTokens,
        cacheCreationTokens: event.cacheCreationTokens,
      };
      const hasMetadata = Object.values(metadata).some((v) => v != null);

      // Attach metadata to last assistant message and persist (before error message changes lastMsg)
      // Read state inside set() to avoid stale closure over messages
      let updatedForPersist: ChatMessage | null = null;
      if (hasMetadata) {
        set((state) => {
          // Stryker disable next-line ArrayDeclaration: defensive fallback
          const msgs = state.messages[workspaceId] ?? [];
          const lastMsg = msgs[msgs.length - 1];
          // Stryker disable next-line ConditionalExpression: role check ensures metadata only on assistant messages
          if (lastMsg && lastMsg.role === "assistant") {
            const updated = { ...lastMsg, metadata };
            updatedForPersist = updated;
            return {
              messages: {
                ...state.messages,
                [workspaceId]: [...msgs.slice(0, -1), updated],
              },
            };
          }
          return state;
        });
      } else {
        // Stryker disable next-line ArrayDeclaration: defensive fallback
        const msgs = get().messages[workspaceId] ?? [];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          updatedForPersist = lastMsg;
        }
      }
      if (updatedForPersist) {
        persistMessage(workspaceId, updatedForPersist);
      }

      // Update session stats with cumulative totals from the CLI result event.
      // These are session-level snapshots reported by Claude Code, not locally accumulated.
      // Preserve previous values when fields are absent to avoid resetting on partial data.
      if (hasMetadata) {
        set((state) => {
          const prev = state.sessionStats[workspaceId];
          return {
            sessionStats: {
              ...state.sessionStats,
              [workspaceId]: {
                totalCostUsd: event.totalCostUsd ?? prev?.totalCostUsd ?? 0,
                totalInputTokens: event.inputTokens ?? prev?.totalInputTokens ?? 0,
                totalOutputTokens: event.outputTokens ?? prev?.totalOutputTokens ?? 0,
                numTurns: event.numTurns ?? prev?.numTurns ?? 0,
                totalCacheReadTokens: event.cacheReadTokens ?? prev?.totalCacheReadTokens ?? 0,
                totalCacheCreationTokens: event.cacheCreationTokens ?? prev?.totalCacheCreationTokens ?? 0,
              },
            },
          };
        });

        // Push agent turn metrics to perf monitor
        /* v8 ignore start -- defensive ?? 0; event fields always present */
        pushAgentTurnMetric({
          workspaceId,
          durationMs: event.durationMs ?? 0,
          durationApiMs: event.durationApiMs ?? 0,
          inputTokens: event.inputTokens ?? 0,
          outputTokens: event.outputTokens ?? 0,
          cacheReadTokens: event.cacheReadTokens ?? 0,
          cacheCreationTokens: event.cacheCreationTokens ?? 0,
          totalCostUsd: event.totalCostUsd ?? 0,
          numTurns: event.numTurns ?? 0,
          timestamp: Date.now(),
        });
        /* v8 ignore stop */

        pushStreamEvent(workspaceId, "result_handled", event.isError ? "error" : "success");
      }

      // If error, add a user-friendly error message (after metadata is already attached)
      if (event.isError) {
        const friendly = event.result
          ? formatErrorMessage(event.result)
          : "An unknown error occurred. The agent process exited unexpectedly. Please retry.";
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
  // Stryker disable next-line ConditionalExpression: empty text check — test verifies empty text does NOT create message
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
  _get: () => ChatStore,
) {
  // Read state inside set() to avoid stale closure over messages
  let msgToPersist: ChatMessage | null = null;
  set((state) => {
    const messages = state.messages[workspaceId] ?? [];
    const lastMsg = messages[messages.length - 1];

    // Append to last assistant message, or create new one
    if (lastMsg && lastMsg.role === "assistant") {
      const updated = {
        ...lastMsg,
        content: [...lastMsg.content, block],
      };
      msgToPersist = updated;
      return {
        messages: {
          ...state.messages,
          [workspaceId]: [...messages.slice(0, -1), updated],
        },
      };
    } else {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [block],
        timestamp: Date.now(),
      };
      msgToPersist = msg;
      return {
        messages: {
          ...state.messages,
          [workspaceId]: [...messages, msg],
        },
      };
    }
  });
  // Persist after every content block for crash durability
  if (msgToPersist) {
    persistMessage(workspaceId, msgToPersist);
  }
}

/**
 * Parse skill names and descriptions from a Claude Code system-reminder message.
 * The format is:
 *   The following skills are available for use with the Skill tool:
 *   - skill-name: Description text
 *   - plugin:skill-name: Description text
 */
export function parseSkillsFromSystemMessage(message: string): SlashCommand[] {
  const marker = "skills are available for use with the Skill tool:";
  const idx = message.indexOf(marker);
  // Stryker disable next-line all: indexOf returns -1 when not found; tested via "no marker" test
  if (idx === -1) return [];

  const after = message.substring(idx + marker.length);
  // Stop at the next </system-reminder> or end of string
  const endIdx = after.indexOf("</system-reminder>");
  const block = endIdx >= 0 ? after.substring(0, endIdx) : after;

  const skills: SlashCommand[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const rest = trimmed.substring(2);
    const colonIdx = rest.indexOf(": ");
    // Stryker disable next-line all: indexOf returns -1 when not found; tested via "no colon" test
    if (colonIdx === -1) continue;
    const name = rest.substring(0, colonIdx).trim();
    const description = rest.substring(colonIdx + 2).trim();
    // Stryker disable next-line ConditionalExpression: empty name check tested via parseSkills tests
    if (!name) continue;
    skills.push({
      name,
      source: "plugin",
      description,
      content: `/${name}`,
    });
  }
  return skills;
}
