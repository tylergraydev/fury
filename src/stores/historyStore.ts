import { create } from "zustand";
import { type GitLogEntry, getGitLog } from "../lib/tauri";

interface HistoryStore {
  gitLog: Record<string, GitLogEntry[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadGitLog: (workspaceId: string) => Promise<void>;
  getGitLog: (workspaceId: string) => GitLogEntry[];
}

// Module-level inflight tracker — prevent duplicate concurrent requests
// without polluting store state or triggering re-renders.
const _inflightGitLog = new Set<string>();

if (import.meta.hot) {
  import.meta.hot.dispose(() => _inflightGitLog.clear());
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  gitLog: {},
  loading: {},
  error: {},

  loadGitLog: async (workspaceId: string) => {
    if (_inflightGitLog.has(workspaceId)) return;
    _inflightGitLog.add(workspaceId);
    const hasCached = workspaceId in get().gitLog;
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: !hasCached },
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
        loading: { ...state.loading, [workspaceId]: false },
        error: hasCached
          ? state.error
          : { ...state.error, [workspaceId]: String(e) },
      }));
    } finally {
      _inflightGitLog.delete(workspaceId);
    }
  },

  getGitLog: (workspaceId: string) => {
    return get().gitLog[workspaceId] ?? [];
  },
}));
