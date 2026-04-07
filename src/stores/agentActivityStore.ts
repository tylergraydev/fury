import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

export type ActivityStatus = "running" | "completed" | "error";

export interface ActivityEntry {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ActivityStatus;
  result?: string;
  startedAt: number;
  completedAt?: number;
}

interface AgentActivityStore {
  /** Live activity entries per workspace, keyed by workspace ID */
  entries: Record<string, ActivityEntry[]>;
  /** Clear all entries for a workspace */
  clear: (workspaceId: string) => void;
}

const MAX_ENTRIES = 200;

export const useAgentActivityStore = create<AgentActivityStore>((set) => ({
  entries: {},

  clear: (workspaceId) =>
    set((state) => ({
      entries: { ...state.entries, [workspaceId]: [] },
    })),
}));

function pushEntry(workspaceId: string, entry: ActivityEntry) {
  useAgentActivityStore.setState((state) => {
    const existing = state.entries[workspaceId] ?? [];
    const updated = [...existing, entry];
    // Cap at MAX_ENTRIES
    if (updated.length > MAX_ENTRIES) updated.splice(0, updated.length - MAX_ENTRIES);
    return { entries: { ...state.entries, [workspaceId]: updated } };
  });
}

function updateEntry(workspaceId: string, id: string, patch: Partial<ActivityEntry>) {
  useAgentActivityStore.setState((state) => {
    const existing = state.entries[workspaceId];
    if (!existing) return state;
    return {
      entries: {
        ...state.entries,
        [workspaceId]: existing.map((e) =>
          e.id === id ? { ...e, ...patch } : e,
        ),
      },
    };
  });
}

// Tool names to hide from the feed (internal/noisy)
const HIDDEN_TOOLS = new Set(["Think", "think"]);

function formatToolName(name: string): string {
  // MCP tools come as "mcp__server__tool" — extract the readable part
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    return parts[parts.length - 1];
  }
  return name;
}

interface StreamEvent {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
  content?: string;
  isError?: boolean;
}

/** Subscribe to agent stream events for a given workspace. */
export function subscribeToAgentActivity(workspaceId: string): () => void {
  let unlisten: (() => void) | null = null;

  listen<StreamEvent>(`agent-stream:${workspaceId}`, (event) => {
    const data = event.payload;

    switch (data.type) {
      case "toolUse": {
        if (!data.id || !data.name) break;
        if (HIDDEN_TOOLS.has(data.name)) break;

        pushEntry(workspaceId, {
          id: data.id,
          toolName: formatToolName(data.name),
          input: data.input ?? {},
          status: "running",
          startedAt: Date.now(),
        });
        break;
      }

      case "toolResult": {
        if (!data.toolUseId) break;
        const content = data.content ?? "";
        const isError = content.toLowerCase().includes("error") || (data.isError ?? false);
        updateEntry(workspaceId, data.toolUseId, {
          status: isError ? "error" : "completed",
          result: content.length > 500 ? content.slice(0, 500) + "…" : content,
          completedAt: Date.now(),
        });
        break;
      }

      case "result": {
        // Agent turn completed — mark any still-running entries as completed
        const entries = useAgentActivityStore.getState().entries[workspaceId] ?? [];
        const stillRunning = entries.filter((e) => e.status === "running");
        for (const entry of stillRunning) {
          updateEntry(workspaceId, entry.id, {
            status: "completed",
            completedAt: Date.now(),
          });
        }
        break;
      }
    }
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    unlisten?.();
  };
}
