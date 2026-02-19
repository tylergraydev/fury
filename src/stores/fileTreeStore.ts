import { create } from "zustand";
import { listWorkspaceFiles } from "../lib/tauri";

interface FileTreeStore {
  files: Record<string, string[]>;
  expandedDirs: Record<string, Set<string>>;
  loading: boolean;
  error: string | null;

  loadFiles: (workspaceId: string) => Promise<void>;
  toggleDir: (workspaceId: string, dir: string) => void;
  getFiles: (workspaceId: string) => string[];
  getExpandedDirs: (workspaceId: string) => Set<string>;
}

export const useFileTreeStore = create<FileTreeStore>((set, get) => ({
  files: {},
  expandedDirs: {},
  loading: false,
  error: null,

  loadFiles: async (workspaceId: string) => {
    set({ loading: true, error: null });
    try {
      const files = await listWorkspaceFiles(workspaceId);
      set((state) => ({
        files: { ...state.files, [workspaceId]: files },
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, error: String(e) });
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

  getFiles: (workspaceId: string) => {
    return get().files[workspaceId] ?? [];
  },

  getExpandedDirs: (workspaceId: string) => {
    return get().expandedDirs[workspaceId] ?? new Set<string>();
  },
}));
