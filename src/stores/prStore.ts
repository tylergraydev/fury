import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type PrInfo,
  type CreatePrRequest,
  type MergeResult,
  createPr as createPrCmd,
  getPrInfo as getPrInfoCmd,
  getPrChecks as getPrChecksCmd,
  pushChanges as pushChangesCmd,
  fixFailingChecks as fixFailingChecksCmd,
  mergePr as mergePrCmd,
} from "../lib/tauri";

interface PrStore {
  prInfo: Record<string, PrInfo | null>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  subscriptions: Record<string, UnlistenFn[]>;
  pollIntervals: Record<string, ReturnType<typeof setInterval>>;

  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  loadPrInfo: (workspaceId: string) => Promise<void>;
  refreshChecks: (workspaceId: string) => Promise<void>;
  createPr: (request: CreatePrRequest) => Promise<PrInfo>;
  pushChanges: (workspaceId: string) => Promise<void>;
  getFixMessage: (workspaceId: string) => Promise<string>;
  mergePr: (workspaceId: string, method?: string) => Promise<MergeResult>;
  startPolling: (workspaceId: string) => void;
  stopPolling: (workspaceId: string) => void;
  getPrInfo: (workspaceId: string) => PrInfo | null;
  isLoading: (workspaceId: string) => boolean;
  getError: (workspaceId: string) => string | null;
}

export const usePrStore = create<PrStore>((set, get) => ({
  prInfo: {},
  loading: {},
  error: {},
  subscriptions: {},
  pollIntervals: {},

  subscribe: async (workspaceId: string) => {
    if (get().subscriptions[workspaceId]) return;

    const unlistenUpdated = await listen<PrInfo>(
      `pr-updated:${workspaceId}`,
      (event) => {
        set((state) => ({
          prInfo: { ...state.prInfo, [workspaceId]: event.payload },
        }));
      },
    );

    const unlistenMerged = await listen<MergeResult>(
      `pr-merged:${workspaceId}`,
      () => {
        // Reload PR info after merge
        get().loadPrInfo(workspaceId);
        get().stopPolling(workspaceId);
      },
    );

    set((state) => ({
      subscriptions: {
        ...state.subscriptions,
        [workspaceId]: [unlistenUpdated, unlistenMerged],
      },
    }));
  },

  unsubscribe: (workspaceId: string) => {
    const unsubs = get().subscriptions[workspaceId];
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      set((state) => {
        const { [workspaceId]: _, ...rest } = state.subscriptions;
        return { subscriptions: rest };
      });
    }
    get().stopPolling(workspaceId);
  },

  loadPrInfo: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const info = await getPrInfoCmd(workspaceId);
      set((state) => ({
        prInfo: { ...state.prInfo, [workspaceId]: info },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
    }
  },

  refreshChecks: async (workspaceId: string) => {
    try {
      const checks = await getPrChecksCmd(workspaceId);
      set((state) => {
        const current = state.prInfo[workspaceId];
        if (!current) return state;
        return {
          prInfo: {
            ...state.prInfo,
            [workspaceId]: { ...current, checks },
          },
        };
      });

      // Stop polling if all checks are completed
      const allDone = checks.every(
        (c) => c.status === "COMPLETED" || c.conclusion !== null,
      );
      if (allDone && checks.length > 0) {
        get().stopPolling(workspaceId);
      }
    } catch (e) {
      // Silently ignore check refresh errors
    }
  },

  createPr: async (request: CreatePrRequest) => {
    const workspaceId = request.workspaceId;
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const info = await createPrCmd(request);
      set((state) => ({
        prInfo: { ...state.prInfo, [workspaceId]: info },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      get().startPolling(workspaceId);
      return info;
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      throw e;
    }
  },

  pushChanges: async (workspaceId: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      await pushChangesCmd(workspaceId);
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
      }));
      get().startPolling(workspaceId);
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      throw e;
    }
  },

  getFixMessage: async (workspaceId: string) => {
    return fixFailingChecksCmd(workspaceId);
  },

  mergePr: async (workspaceId: string, method?: string) => {
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: true },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      const result = await mergePrCmd(workspaceId, method);
      set((state) => ({
        loading: { ...state.loading, [workspaceId]: false },
      }));
      // Reload to get merged state
      get().loadPrInfo(workspaceId);
      return result;
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [workspaceId]: String(e) },
        loading: { ...state.loading, [workspaceId]: false },
      }));
      throw e;
    }
  },

  startPolling: (workspaceId: string) => {
    // Don't start if already polling
    if (get().pollIntervals[workspaceId]) return;

    const interval = setInterval(() => {
      get().refreshChecks(workspaceId);
    }, 30000);

    set((state) => ({
      pollIntervals: { ...state.pollIntervals, [workspaceId]: interval },
    }));
  },

  stopPolling: (workspaceId: string) => {
    const interval = get().pollIntervals[workspaceId];
    if (interval) {
      clearInterval(interval);
      set((state) => {
        const { [workspaceId]: _, ...rest } = state.pollIntervals;
        return { pollIntervals: rest };
      });
    }
  },

  getPrInfo: (workspaceId: string) => {
    return get().prInfo[workspaceId] ?? null;
  },

  isLoading: (workspaceId: string) => {
    return get().loading[workspaceId] ?? false;
  },

  getError: (workspaceId: string) => {
    return get().error[workspaceId] ?? null;
  },
}));
