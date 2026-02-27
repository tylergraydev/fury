import { create } from "zustand";
import { getGitLog } from "../lib/tauri";
import { useWorkspaceStore } from "./workspaceStore";

export type ActivityType =
  | "commit"
  | "agent-started"
  | "agent-completed"
  | "chat-user"
  | "chat-agent"
  | "script-started"
  | "script-succeeded"
  | "script-failed"
  | "pr-opened"
  | "pr-checks-pass"
  | "pr-checks-fail"
  | "pr-merged"
  | "merge-conflict-detected"
  | "merge-conflict-resolved";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  timestamp: number;
  workspaceId: string;
  workspaceName: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface ActivityLogStore {
  entries: ActivityEntry[];
  commitEntries: Record<string, ActivityEntry[]>;
  activeFilters: Set<ActivityType>;

  addEntry: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
  clearEntries: () => void;
  toggleFilter: (type: ActivityType) => void;
  clearFilters: () => void;
  loadCommits: (workspaceId: string) => Promise<void>;
  getFilteredEntries: (workspaceId?: string) => ActivityEntry[];
}

const MAX_ENTRIES = 500;
let nextId = 0;

function getWorkspaceName(workspaceId: string): string {
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
  return ws?.name ?? workspaceId.slice(0, 8);
}

export const useActivityLogStore = create<ActivityLogStore>((set, get) => ({
  entries: [],
  commitEntries: {},
  activeFilters: new Set(),

  addEntry: (entry) => {
    const full: ActivityEntry = {
      ...entry,
      id: String(++nextId),
      timestamp: Date.now(),
    };
    set((state) => ({
      entries: [full, ...state.entries].slice(0, MAX_ENTRIES),
    }));
  },

  clearEntries: () => set({ entries: [], commitEntries: {} }),

  toggleFilter: (type) => {
    set((state) => {
      const next = new Set(state.activeFilters);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { activeFilters: next };
    });
  },

  clearFilters: () => set({ activeFilters: new Set() }),

  loadCommits: async (workspaceId: string) => {
    try {
      const log = await getGitLog(workspaceId, 50);
      const entries: ActivityEntry[] = log.map((commit) => ({
        id: `commit-${workspaceId}-${commit.hash}`,
        type: "commit" as const,
        timestamp: new Date(commit.timestamp).getTime(),
        workspaceId,
        workspaceName: getWorkspaceName(workspaceId),
        title: commit.message,
        message: `${commit.author} committed ${commit.hash}`,
        metadata: { hash: commit.hash, fullHash: commit.fullHash, author: commit.author },
      }));
      set((state) => ({
        commitEntries: { ...state.commitEntries, [workspaceId]: entries },
      }));
    } catch (e) {
      console.error("[activityLog] Failed to load commits:", e);
    }
  },

  getFilteredEntries: (workspaceId?: string) => {
    const { entries, commitEntries, activeFilters } = get();
    const wsId = workspaceId ?? useWorkspaceStore.getState().activeWorkspaceId;
    const commits = wsId ? (commitEntries[wsId] ?? []) : [];

    // Merge and deduplicate by id
    const allEntries = [...entries, ...commits];
    const seen = new Set<string>();
    const deduped = allEntries.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    // Filter by workspace
    const wsFiltered = wsId ? deduped.filter((e) => e.workspaceId === wsId) : deduped;

    // Apply type filters
    const typeFiltered =
      activeFilters.size === 0
        ? wsFiltered
        : wsFiltered.filter((e) => activeFilters.has(e.type));

    // Sort by timestamp descending
    return typeFiltered.sort((a, b) => b.timestamp - a.timestamp);
  },
}));
