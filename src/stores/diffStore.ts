import { create } from "zustand";
import {
  type DiffResult,
  type FileDiffContent,
  type FilePatchPreview,
  getDiff as getDiffCmd,
  getFileDiff as getFileDiffCmd,
  getFilePatch as getFilePatchCmd,
  getRepoDiff as getRepoDiffCmd,
  getRepoFileDiff as getRepoFileDiffCmd,
  getRepoFilePatch as getRepoFilePatchCmd,
} from "../lib/tauri";

interface DiffStore {
  diffResults: Record<string, DiffResult | null>;
  fileDiffs: Record<string, FileDiffContent | null>;
  selectedFile: Record<string, string | null>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  patchPreviews: Record<string, FilePatchPreview | null>;
  patchLoading: Record<string, boolean>;

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
  refresh: (workspaceId: string) => Promise<void>;
  refreshRepo: (repoId: string) => Promise<void>;
  loadPatchPreview: (
    contextId: string,
    filePath: string,
    isUntracked: boolean,
    contextType: "workspace" | "repo",
  ) => Promise<void>;
  getPatchPreview: (
    contextId: string,
    filePath: string,
  ) => FilePatchPreview | null;
  clearPatchPreviews: (contextId: string) => void;
}

// Module-level inflight trackers — prevent duplicate concurrent requests
// without polluting store state or triggering re-renders.
const _inflightDiff = new Set<string>();
const _inflightRepoDiff = new Set<string>();
const _inflightPatch = new Set<string>();

// Stryker disable all: HMR cleanup — stripped by Vite in production builds
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _inflightDiff.clear();
    _inflightRepoDiff.clear();
    _inflightPatch.clear();
  });
}
// Stryker restore all

export const useDiffStore = create<DiffStore>((set, get) => ({
  diffResults: {},
  fileDiffs: {},
  selectedFile: {},
  loading: {},
  error: {},
  patchPreviews: {},
  patchLoading: {},

  loadDiff: async (workspaceId: string) => {
    if (_inflightDiff.has(workspaceId)) return;
    _inflightDiff.add(workspaceId);
    const hasCached = workspaceId in get().diffResults;
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: !hasCached },
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
        error: hasCached
          ? state.error
          : { ...state.error, [workspaceId]: String(e) },
      }));
    } finally {
      _inflightDiff.delete(workspaceId);
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

  loadRepoDiff: async (repoId: string) => {
    if (_inflightRepoDiff.has(repoId)) return;
    _inflightRepoDiff.add(repoId);
    const hasCached = repoId in get().diffResults;
    set((state) => ({
      loading: { ...state.loading, [repoId]: !hasCached },
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
        error: hasCached
          ? state.error
          : { ...state.error, [repoId]: String(e) },
      }));
    } finally {
      _inflightRepoDiff.delete(repoId);
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

  refresh: async (workspaceId: string) => {
    get().clearPatchPreviews(workspaceId);
    await get().loadDiff(workspaceId);
    const selected = get().selectedFile[workspaceId];
    if (selected) {
      await get().loadFileDiff(workspaceId, selected);
    }
  },

  refreshRepo: async (repoId: string) => {
    get().clearPatchPreviews(repoId);
    await get().loadRepoDiff(repoId);
    const selected = get().selectedFile[repoId];
    if (selected) {
      await get().loadRepoFileDiff(repoId, selected);
    }
  },

  loadPatchPreview: async (contextId, filePath, isUntracked, contextType) => {
    const key = `${contextId}:${filePath}`;
    if (get().patchPreviews[key] || _inflightPatch.has(key)) return;
    _inflightPatch.add(key);
    set((state) => ({
      patchLoading: { ...state.patchLoading, [key]: true },
    }));
    try {
      const result =
        contextType === "workspace"
          ? await getFilePatchCmd(contextId, filePath, isUntracked)
          : await getRepoFilePatchCmd(contextId, filePath, isUntracked);
      set((state) => ({
        patchPreviews: { ...state.patchPreviews, [key]: result },
        patchLoading: { ...state.patchLoading, [key]: false },
      }));
    } catch (e) {
      console.error("Failed to load patch preview:", e);
      set((state) => ({
        patchLoading: { ...state.patchLoading, [key]: false },
      }));
    } finally {
      _inflightPatch.delete(key);
    }
  },

  getPatchPreview: (contextId, filePath) => {
    const key = `${contextId}:${filePath}`;
    return get().patchPreviews[key] ?? null;
  },

  clearPatchPreviews: (contextId) => {
    const newPreviews = { ...get().patchPreviews };
    const newLoading = { ...get().patchLoading };
    for (const key of Object.keys(newPreviews)) {
      if (key.startsWith(`${contextId}:`)) {
        delete newPreviews[key];
        delete newLoading[key];
      }
    }
    set({ patchPreviews: newPreviews, patchLoading: newLoading });
  },
}));
