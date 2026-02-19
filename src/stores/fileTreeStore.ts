import { create } from "zustand";
import { listWorkspaceFiles } from "../lib/tauri";

interface FileTreeStore {
  files: Record<string, string[]>;
  expandedDirs: Record<string, Set<string>>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadFiles: (workspaceId: string) => Promise<void>;
  toggleDir: (workspaceId: string, dir: string) => void;
}

export const useFileTreeStore = create<FileTreeStore>((set) => ({
  files: {},
  expandedDirs: {},
  loading: {},
  error: {},

  loadFiles: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
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
        error: { ...state.error, [workspaceId]: String(e) },
      }));
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
