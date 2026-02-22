import { create } from "zustand";
import {
  type DiffResult,
  type FileDiffContent,
  getDiff as getDiffCmd,
  getFileDiff as getFileDiffCmd,
  getRepoDiff as getRepoDiffCmd,
  getRepoFileDiff as getRepoFileDiffCmd,
} from "../lib/tauri";

interface DiffStore {
  diffResults: Record<string, DiffResult | null>;
  fileDiffs: Record<string, FileDiffContent | null>;
  selectedFile: Record<string, string | null>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadDiff: (workspaceId: string) => Promise<void>;
  loadFileDiff: (workspaceId: string, filePath: string) => Promise<void>;
  loadRepoDiff: (repoId: string) => Promise<void>;
  loadRepoFileDiff: (repoId: string, filePath: string) => Promise<void>;
  selectFile: (contextId: string, filePath: string) => void;
  selectRepoFile: (repoId: string, filePath: string) => void;
  getDiffResult: (contextId: string) => DiffResult | null;
  getFileDiffContent: (
    contextId: string,
    filePath: string,
  ) => FileDiffContent | null;
  getSelectedFile: (contextId: string) => string | null;
  isLoading: (contextId: string) => boolean;
  getError: (contextId: string) => string | null;
  refresh: (workspaceId: string) => Promise<void>;
  refreshRepo: (repoId: string) => Promise<void>;
}

export const useDiffStore = create<DiffStore>((set, get) => ({
  diffResults: {},
  fileDiffs: {},
  selectedFile: {},
  loading: {},
  error: {},

  loadDiff: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const result = await getDiffCmd(workspaceId);
      set((state) => ({
        diffResults: { ...state.diffResults, [workspaceId]: result },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
        error: { ...state.error, [workspaceId]: String(e) },
      }));
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
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  loadRepoDiff: async (repoId: string) => {
    set((state) => ({
      loading: { ...state.loading, [repoId]: true },
      error: { ...state.error, [repoId]: null },
    }));
    try {
      const result = await getRepoDiffCmd(repoId);
      set((state) => ({
        diffResults: { ...state.diffResults, [repoId]: result },
        loading: { ...state.loading, [repoId]: false },
      }));
    } catch (e) {
      set((state) => ({
        loading: { ...state.loading, [repoId]: false },
        error: { ...state.error, [repoId]: String(e) },
      }));
    }
  },

  loadRepoFileDiff: async (repoId: string, filePath: string) => {
    const key = `${repoId}:${filePath}`;
    try {
      const result = await getRepoFileDiffCmd(repoId, filePath);
      set((state) => ({
        fileDiffs: { ...state.fileDiffs, [key]: result },
      }));
    } catch (e) {
      console.error("Failed to load repo file diff:", e);
      set((state) => ({
        error: { ...state.error, [repoId]: String(e) },
      }));
    }
  },

  selectFile: (workspaceId: string, filePath: string) => {
    set((state) => ({
      selectedFile: { ...state.selectedFile, [workspaceId]: filePath },
    }));
    get().loadFileDiff(workspaceId, filePath);
  },

  selectRepoFile: (repoId: string, filePath: string) => {
    set((state) => ({
      selectedFile: { ...state.selectedFile, [repoId]: filePath },
    }));
    get().loadRepoFileDiff(repoId, filePath);
  },

  getDiffResult: (contextId: string) => {
    return get().diffResults[contextId] ?? null;
  },

  getFileDiffContent: (contextId: string, filePath: string) => {
    const key = `${contextId}:${filePath}`;
    return get().fileDiffs[key] ?? null;
  },

  getSelectedFile: (contextId: string) => {
    return get().selectedFile[contextId] ?? null;
  },

  isLoading: (contextId: string) => {
    return get().loading[contextId] ?? false;
  },

  getError: (contextId: string) => {
    return get().error[contextId] ?? null;
  },

  refresh: async (workspaceId: string) => {
    await get().loadDiff(workspaceId);
    const selected = get().selectedFile[workspaceId];
    if (selected) {
      await get().loadFileDiff(workspaceId, selected);
    }
  },

  refreshRepo: async (repoId: string) => {
    await get().loadRepoDiff(repoId);
    const selected = get().selectedFile[repoId];
    if (selected) {
      await get().loadRepoFileDiff(repoId, selected);
    }
  },
}));
