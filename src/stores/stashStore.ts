import { create } from "zustand";
import {
  type StashEntry,
  type StashDetail,
  listStashes as listStashesCmd,
  createStash as createStashCmd,
  applyStash as applyStashCmd,
  popStash as popStashCmd,
  dropStash as dropStashCmd,
  showStash as showStashCmd,
} from "../lib/tauri";
import { useToastStore } from "./toastStore";

interface StashStore {
  stashes: Record<string, StashEntry[]>;
  selectedStash: Record<string, number | null>;
  stashDetail: Record<string, StashDetail | null>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadStashes: (workspaceId: string) => Promise<void>;
  createStash: (
    workspaceId: string,
    message?: string,
    includeUntracked?: boolean,
  ) => Promise<void>;
  applyStash: (workspaceId: string, index: number) => Promise<void>;
  popStash: (workspaceId: string, index: number) => Promise<void>;
  dropStash: (workspaceId: string, index: number) => Promise<void>;
  showStash: (workspaceId: string, index: number) => Promise<void>;
  clearSelection: (workspaceId: string) => void;
}

const _inflightStashes = new Set<string>();

if (import.meta.hot) {
  import.meta.hot.dispose(() => _inflightStashes.clear());
}

export const useStashStore = create<StashStore>((set, get) => ({
  stashes: {},
  selectedStash: {},
  stashDetail: {},
  loading: {},
  error: {},

  loadStashes: async (workspaceId: string) => {
    if (_inflightStashes.has(workspaceId)) return;
    _inflightStashes.add(workspaceId);
    try {
      const stashes = await listStashesCmd(workspaceId);
      set((state) => ({
        stashes: { ...state.stashes, [workspaceId]: stashes },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    } finally {
      _inflightStashes.delete(workspaceId);
    }
  },

  createStash: async (
    workspaceId: string,
    message?: string,
    includeUntracked?: boolean,
  ) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      await createStashCmd(workspaceId, message, includeUntracked);
      const stashes = await listStashesCmd(workspaceId);
      set((state) => ({
        stashes: { ...state.stashes, [workspaceId]: stashes },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      useToastStore.getState().addToast("Changes stashed", "success");
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  applyStash: async (workspaceId: string, index: number) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      await applyStashCmd(workspaceId, index);
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
      }));
      useToastStore.getState().addToast("Stash applied", "success");
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  popStash: async (workspaceId: string, index: number) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      await popStashCmd(workspaceId, index);
      const stashes = await listStashesCmd(workspaceId);
      set((state) => ({
        stashes: { ...state.stashes, [workspaceId]: stashes },
        selectedStash: { ...state.selectedStash, [workspaceId]: null },
        stashDetail: { ...state.stashDetail, [workspaceId]: null },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      useToastStore.getState().addToast("Stash popped", "success");
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  dropStash: async (workspaceId: string, index: number) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      await dropStashCmd(workspaceId, index);
      const stashes = await listStashesCmd(workspaceId);
      set((state) => ({
        stashes: { ...state.stashes, [workspaceId]: stashes },
        selectedStash: { ...state.selectedStash, [workspaceId]: null },
        stashDetail: { ...state.stashDetail, [workspaceId]: null },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      useToastStore.getState().addToast("Stash dropped", "success");
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  showStash: async (workspaceId: string, index: number) => {
    const current = get().selectedStash[workspaceId];
    if (current === index) {
      // Toggle off
      set((state) => ({
        selectedStash: { ...state.selectedStash, [workspaceId]: null },
        stashDetail: { ...state.stashDetail, [workspaceId]: null },
      }));
      return;
    }

    set((state) => ({
      selectedStash: { ...state.selectedStash, [workspaceId]: index },
      stashDetail: { ...state.stashDetail, [workspaceId]: null },
    }));

    try {
      const detail = await showStashCmd(workspaceId, index);
      set((state) => ({
        stashDetail: { ...state.stashDetail, [workspaceId]: detail },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
      }));
    }
  },

  clearSelection: (workspaceId: string) => {
    set((state) => ({
      selectedStash: { ...state.selectedStash, [workspaceId]: null },
      stashDetail: { ...state.stashDetail, [workspaceId]: null },
    }));
  },
}));
