import { create } from "zustand";
import { type GitLogEntry, getGitLog } from "../lib/tauri";

interface HistoryStore {
  gitLog: Record<string, GitLogEntry[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadGitLog: (workspaceId: string) => Promise<void>;
  getGitLog: (workspaceId: string) => GitLogEntry[];
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  gitLog: {},
  loading: {},
  error: {},

  loadGitLog: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const log = await getGitLog(workspaceId);
      set((state) => ({
        gitLog: { ...state.gitLog, [workspaceId]: log },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  getGitLog: (workspaceId: string) => {
    return get().gitLog[workspaceId] ?? [];
  },
}));
