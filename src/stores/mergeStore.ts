import { create } from "zustand";
import {
  type BranchStatus,
  type ConflictContent,
  type ConflictedFile,
  type DiffResult,
  type FileDiffContent,
  type PullResult,
  getBranchStatus,
  fetchUpstream as fetchUpstreamCmd,
  pullRebase as pullRebaseCmd,
  pullMerge as pullMergeCmd,
  getConflictedFiles as getConflictedFilesCmd,
  getConflictContent as getConflictContentCmd,
  resolveConflict as resolveConflictCmd,
  abortMerge as abortMergeCmd,
  continueMerge as continueMergeCmd,
  crossWorktreeDiff,
  getCrossWorktreeFileDiff,
} from "../lib/tauri";

export type MergeSection = "sync" | "compare" | "conflicts";

interface MergeStore {
  // Branch status
  branchStatus: Record<string, BranchStatus | null>;

  // Cross-worktree comparison
  comparisonTarget: Record<string, string | null>;
  comparisonDiff: Record<string, DiffResult | null>;
  comparisonFileDiff: Record<string, FileDiffContent | null>;
  comparisonSelectedFile: Record<string, string | null>;

  // Conflict state
  conflictedFiles: Record<string, ConflictedFile[]>;
  conflictContent: Record<string, ConflictContent | null>;
  selectedConflictFile: Record<string, string | null>;

  // Loading/error
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  // Active sub-tab
  activeSection: Record<string, MergeSection>;

  // Actions
  loadBranchStatus: (workspaceId: string) => Promise<void>;
  fetchUpstream: (workspaceId: string) => Promise<void>;
  pullRebase: (workspaceId: string) => Promise<PullResult>;
  pullMerge: (workspaceId: string) => Promise<PullResult>;

  setComparisonTarget: (workspaceId: string, linkedId: string) => void;
  loadComparisonDiff: (workspaceId: string) => Promise<void>;
  selectComparisonFile: (
    workspaceId: string,
    filePath: string,
  ) => Promise<void>;

  loadConflictedFiles: (workspaceId: string) => Promise<void>;
  loadConflictContent: (
    workspaceId: string,
    filePath: string,
  ) => Promise<void>;
  resolveConflict: (
    workspaceId: string,
    filePath: string,
    strategy: string,
  ) => Promise<void>;
  abortMerge: (workspaceId: string) => Promise<void>;
  continueMerge: (workspaceId: string) => Promise<void>;

  setActiveSection: (workspaceId: string, section: MergeSection) => void;
}

export const useMergeStore = create<MergeStore>((set, get) => ({
  branchStatus: {},
  comparisonTarget: {},
  comparisonDiff: {},
  comparisonFileDiff: {},
  comparisonSelectedFile: {},
  conflictedFiles: {},
  conflictContent: {},
  selectedConflictFile: {},
  loading: {},
  error: {},
  activeSection: {},

  loadBranchStatus: async (workspaceId: string) => {
    try {
      const status = await getBranchStatus(workspaceId);
      set((state) => ({
        branchStatus: { ...state.branchStatus, [workspaceId]: status },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  fetchUpstream: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      await fetchUpstreamCmd(workspaceId);
      // Reload branch status after fetch
      const status = await getBranchStatus(workspaceId);
      set((state) => ({
        branchStatus: { ...state.branchStatus, [workspaceId]: status },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  pullRebase: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const result = await pullRebaseCmd(workspaceId);
      if (result.hasConflicts) {
        const files = await getConflictedFilesCmd(workspaceId);
        set((state) => ({
          conflictedFiles: { ...state.conflictedFiles, [workspaceId]: files },
          activeSection: { ...state.activeSection, [workspaceId]: "conflicts" },
          loading: { ...state.loading, [workspaceId]: false },
        }));
      } else {
        // Refresh branch status
        const status = await getBranchStatus(workspaceId);
        set((state) => ({
          branchStatus: { ...state.branchStatus, [workspaceId]: status },
          loading: { ...state.loading, [workspaceId]: false },
        }));
      }
      return result;
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      throw e;
    }
  },

  pullMerge: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const result = await pullMergeCmd(workspaceId);
      if (result.hasConflicts) {
        const files = await getConflictedFilesCmd(workspaceId);
        set((state) => ({
          conflictedFiles: { ...state.conflictedFiles, [workspaceId]: files },
          activeSection: { ...state.activeSection, [workspaceId]: "conflicts" },
          loading: { ...state.loading, [workspaceId]: false },
        }));
      } else {
        const status = await getBranchStatus(workspaceId);
        set((state) => ({
          branchStatus: { ...state.branchStatus, [workspaceId]: status },
          loading: { ...state.loading, [workspaceId]: false },
        }));
      }
      return result;
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      throw e;
    }
  },

  setComparisonTarget: (workspaceId: string, linkedId: string) => {
    set((state) => ({
      comparisonTarget: { ...state.comparisonTarget, [workspaceId]: linkedId },
      comparisonDiff: { ...state.comparisonDiff, [workspaceId]: null },
      comparisonFileDiff: { ...state.comparisonFileDiff, [workspaceId]: null },
      comparisonSelectedFile: {
        ...state.comparisonSelectedFile,
        [workspaceId]: null,
      },
    }));
    get().loadComparisonDiff(workspaceId);
  },

  loadComparisonDiff: async (workspaceId: string) => {
    const linkedId = get().comparisonTarget[workspaceId];
    if (!linkedId) return;

    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
    }));
    try {
      const diff = await crossWorktreeDiff(workspaceId, linkedId);
      set((state) => ({
        comparisonDiff: { ...state.comparisonDiff, [workspaceId]: diff },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  selectComparisonFile: async (workspaceId: string, filePath: string) => {
    const linkedId = get().comparisonTarget[workspaceId];
    if (!linkedId) return;

    set((state) => ({
      comparisonSelectedFile: {
        ...state.comparisonSelectedFile,
        [workspaceId]: filePath,
      },
    }));

    try {
      const diff = await getCrossWorktreeFileDiff(
        workspaceId,
        linkedId,
        filePath,
      );
      const key = `${workspaceId}:${linkedId}:${filePath}`;
      set((state) => ({
        comparisonFileDiff: { ...state.comparisonFileDiff, [key]: diff },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  loadConflictedFiles: async (workspaceId: string) => {
    try {
      const files = await getConflictedFilesCmd(workspaceId);
      set((state) => ({
        conflictedFiles: { ...state.conflictedFiles, [workspaceId]: files },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  loadConflictContent: async (workspaceId: string, filePath: string) => {
    set((state) => ({
      selectedConflictFile: {
        ...state.selectedConflictFile,
        [workspaceId]: filePath,
      },
    }));
    try {
      const content = await getConflictContentCmd(workspaceId, filePath);
      const key = `${workspaceId}:${filePath}`;
      set((state) => ({
        conflictContent: { ...state.conflictContent, [key]: content },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  resolveConflict: async (
    workspaceId: string,
    filePath: string,
    strategy: string,
  ) => {
    try {
      await resolveConflictCmd(workspaceId, filePath, strategy);
      // Remove resolved file from list
      set((state) => ({
        conflictedFiles: {
          ...state.conflictedFiles,
          [workspaceId]: (state.conflictedFiles[workspaceId] ?? []).filter(
            (f) => f.path !== filePath,
          ),
        },
        selectedConflictFile: {
          ...state.selectedConflictFile,
          [workspaceId]: null,
        },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  abortMerge: async (workspaceId: string) => {
    try {
      await abortMergeCmd(workspaceId);
      set((state) => ({
        conflictedFiles: { ...state.conflictedFiles, [workspaceId]: [] },
        selectedConflictFile: {
          ...state.selectedConflictFile,
          [workspaceId]: null,
        },
        activeSection: { ...state.activeSection, [workspaceId]: "sync" },
      }));
      // Refresh branch status
      const status = await getBranchStatus(workspaceId);
      set((state) => ({
        branchStatus: { ...state.branchStatus, [workspaceId]: status },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  continueMerge: async (workspaceId: string) => {
    try {
      await continueMergeCmd(workspaceId);
      set((state) => ({
        conflictedFiles: { ...state.conflictedFiles, [workspaceId]: [] },
        activeSection: { ...state.activeSection, [workspaceId]: "sync" },
      }));
      // Refresh branch status
      const status = await getBranchStatus(workspaceId);
      set((state) => ({
        branchStatus: { ...state.branchStatus, [workspaceId]: status },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  setActiveSection: (workspaceId: string, section: MergeSection) => {
    set((state) => ({
      activeSection: { ...state.activeSection, [workspaceId]: section },
    }));
  },
}));
