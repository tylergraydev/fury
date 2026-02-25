import { create } from "zustand";
import { listWorkspaceFiles, listRepoFiles } from "../lib/tauri";

interface FileTreeStore {
  files: Record<string, string[]>;
  expandedDirs: Record<string, Set<string>>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadFiles: (workspaceId: string) => Promise<void>;
  loadRepoFiles: (repoId: string) => Promise<void>;
  toggleDir: (contextId: string, dir: string) => void;
}

// Module-level inflight trackers — prevent duplicate concurrent requests
// without polluting store state or triggering re-renders.
const _inflightFiles = new Set<string>();
const _inflightRepoFiles = new Set<string>();

export const useFileTreeStore = create<FileTreeStore>((set, get) => ({
  files: {},
  expandedDirs: {},
  loading: {},
  error: {},

  loadFiles: async (workspaceId: string) => {
    if (_inflightFiles.has(workspaceId)) return;
    _inflightFiles.add(workspaceId);
    const hasCached = workspaceId in get().files;
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: !hasCached },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const files = await listWorkspaceFiles(workspaceId);
      set((state) => ({
        files: { ...state.files, [workspaceId]: files },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
        error: hasCached ? state.error : { ...state.error, [workspaceId]: String(e) },
      }));
    } finally {
      _inflightFiles.delete(workspaceId);
    }
  },

  loadRepoFiles: async (repoId: string) => {
    if (_inflightRepoFiles.has(repoId)) return;
    _inflightRepoFiles.add(repoId);
    const hasCached = repoId in get().files;
    set((state) => ({
      loading: { ...state.loading, [repoId]: !hasCached },
      error: { ...state.error, [repoId]: null },
    }));
    try {
      const files = await listRepoFiles(repoId);
      set((state) => ({
        files: { ...state.files, [repoId]: files },
        loading: { ...state.loading, [repoId]: false },
      }));
    } catch (e) {
      set((state) => ({
        loading: { ...state.loading, [repoId]: false },
        error: hasCached ? state.error : { ...state.error, [repoId]: String(e) },
      }));
    } finally {
      _inflightRepoFiles.delete(repoId);
    }
  },

  toggleDir: (workspaceId: string, dir: string) => {
    set((state) => {
      const current = state.expandedDirs[workspaceId] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return {
        expandedDirs: { ...state.expandedDirs, [workspaceId]: next },
      };
    });
  },
}));
