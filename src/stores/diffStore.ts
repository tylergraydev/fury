import { create } from "zustand";
import {
  type DiffResult,
  type FileDiffContent,
  getDiff as getDiffCmd,
  getFileDiff as getFileDiffCmd,
} from "../lib/tauri";

interface DiffStore {
  diffResults: Record<string, DiffResult | null>;
  fileDiffs: Record<string, FileDiffContent | null>;
  selectedFile: Record<string, string | null>;
  loading: boolean;
  error: string | null;

  loadDiff: (workspaceId: string) => Promise<void>;
  loadFileDiff: (workspaceId: string, filePath: string) => Promise<void>;
  selectFile: (workspaceId: string, filePath: string) => void;
  getDiffResult: (workspaceId: string) => DiffResult | null;
  getFileDiffContent: (
    workspaceId: string,
    filePath: string,
  ) => FileDiffContent | null;
  getSelectedFile: (workspaceId: string) => string | null;
  refresh: (workspaceId: string) => Promise<void>;
}

export const useDiffStore = create<DiffStore>((set, get) => ({
  diffResults: {},
  fileDiffs: {},
  selectedFile: {},
  loading: false,
  error: null,

  loadDiff: async (workspaceId: string) => {
    set({ loading: true, error: null });
    try {
      const result = await getDiffCmd(workspaceId);
      set((state) => ({
        diffResults: { ...state.diffResults, [workspaceId]: result },
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  loadFileDiff: async (workspaceId: string, filePath: string) => {
    const key = `${workspaceId}:${filePath}`;
    try {
      const result = await getFileDiffCmd(workspaceId, filePath);
      set((state) => ({
        fileDiffs: { ...state.fileDiffs, [key]: result },
      }));
    } catch (e) {
      console.error("Failed to load file diff:", e);
    }
  },

  selectFile: (workspaceId: string, filePath: string) => {
    set((state) => ({
      selectedFile: { ...state.selectedFile, [workspaceId]: filePath },
    }));
    get().loadFileDiff(workspaceId, filePath);
  },

  getDiffResult: (workspaceId: string) => {
    return get().diffResults[workspaceId] ?? null;
  },

  getFileDiffContent: (workspaceId: string, filePath: string) => {
    const key = `${workspaceId}:${filePath}`;
    return get().fileDiffs[key] ?? null;
  },

  getSelectedFile: (workspaceId: string) => {
    return get().selectedFile[workspaceId] ?? null;
  },

  refresh: async (workspaceId: string) => {
    await get().loadDiff(workspaceId);
    const selected = get().selectedFile[workspaceId];
    if (selected) {
      await get().loadFileDiff(workspaceId, selected);
    }
  },
}));
