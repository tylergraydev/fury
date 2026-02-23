import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type AgentInfo,
  type AgentStatus,
  type AgentStatusEvent,
  sendMessage as sendMessageCmd,
  stopAgent as stopAgentCmd,
  getAgentStatus,
} from "../lib/tauri";

interface AgentStore {
  agents: Record<string, AgentInfo>;
  subscriptions: Record<string, UnlistenFn>;

  getStatus: (workspaceId: string) => AgentStatus;
  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  sendMessage: (
    contextId: string,
    message: string,
    contextType?: "workspace" | "repo",
    model?: string,
    disableThinking?: boolean,
    disablePlanMode?: boolean,
  ) => Promise<void>;
  stopAgent: (workspaceId: string) => Promise<void>;
  fetchStatus: (workspaceId: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: {},
  subscriptions: {},

  getStatus: (workspaceId: string): AgentStatus => {
    return get().agents[workspaceId]?.status ?? "Idle";
  },

  subscribe: async (workspaceId: string) => {
    // Don't double-subscribe
    if (get().subscriptions[workspaceId]) return;

    const unlisten = await listen<AgentStatusEvent>(
      `agent-status:${workspaceId}`,
      (event) => {
        set((state) => ({
          agents: {
            ...state.agents,
            [workspaceId]: {
              ...state.agents[workspaceId],
              workspaceId,
              status: event.payload.status,
            } as AgentInfo,
          },
        }));
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

  sendMessage: async (
    contextId: string,
    message: string,
    contextType: "workspace" | "repo" = "workspace",
    model?: string,
    disableThinking?: boolean,
    disablePlanMode?: boolean,
  ) => {
    try {
      const request =
        contextType === "workspace"
          ? { workspaceId: contextId, message, model: model || undefined, disableThinking, disablePlanMode }
          : { repoId: contextId, message, model: model || undefined, disableThinking, disablePlanMode };
      await sendMessageCmd(request);
    } catch (e) {
      console.error(`[agentStore] Failed to send message:`, e);
      throw e;
    }
  },

  stopAgent: async (workspaceId: string) => {
    try {
      await stopAgentCmd(workspaceId);
    } catch (e) {
      console.error(`[agentStore] Failed to stop agent:`, e);
      throw e;
    }
  },

  fetchStatus: async (workspaceId: string) => {
    try {
      const info = await getAgentStatus(workspaceId);
      set((state) => ({
        agents: { ...state.agents, [workspaceId]: info },
      }));
    } catch (e) {
      console.error(`[agentStore] Failed to fetch status:`, e);
    }
  },
}));
