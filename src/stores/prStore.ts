import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type PrInfo,
  type PrReview,
  type PrComment,
  type WorkflowRun,
  type CreatePrRequest,
  type MergeResult,
  createPr as createPrCmd,
  getPrChecks as getPrChecksCmd,
  pushChanges as pushChangesCmd,
  fixFailingChecks as fixFailingChecksCmd,
  mergePr as mergePrCmd,
  getPrFullData as getPrFullDataCmd,
  getReviewsAndComments as getReviewsAndCommentsCmd,
  getWorkflowRuns as getWorkflowRunsCmd,
} from "../lib/tauri";

interface PrStore {
  prInfo: Record<string, PrInfo | null>;
  reviews: Record<string, PrReview[]>;
  reviewComments: Record<string, PrComment[]>;
  workflowRuns: Record<string, WorkflowRun[]>;
  workflowLoading: Record<string, boolean>;
  reviewsLoading: Record<string, boolean>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  subscriptions: Record<string, UnlistenFn[]>;
  pollIntervals: Record<string, ReturnType<typeof setInterval>>;

  subscribe: (workspaceId: string) => Promise<void>;
  unsubscribe: (workspaceId: string) => void;
  loadPrInfo: (workspaceId: string) => Promise<void>;
  loadReviews: (workspaceId: string) => Promise<void>;
  loadWorkflowRuns: (workspaceId: string) => Promise<void>;
  refreshChecks: (workspaceId: string) => Promise<void>;
  createPr: (request: CreatePrRequest) => Promise<PrInfo>;
  pushChanges: (workspaceId: string) => Promise<void>;
  getFixMessage: (workspaceId: string) => Promise<string>;
  getReviewFixMessage: (workspaceId: string) => string;
  mergePr: (workspaceId: string, method?: string) => Promise<MergeResult>;
  startPolling: (workspaceId: string) => void;
  stopPolling: (workspaceId: string) => void;
  getPrInfo: (workspaceId: string) => PrInfo | null;
  getReviews: (workspaceId: string) => PrReview[];
  getReviewComments: (workspaceId: string) => PrComment[];
  isLoading: (workspaceId: string) => boolean;
  getError: (workspaceId: string) => string | null;
}

// Module-level inflight trackers — prevent duplicate concurrent requests
// without polluting store state or triggering re-renders.
const _inflightPrInfo = new Set<string>();
const _inflightReviews = new Set<string>();
const _inflightWorkflowRuns = new Set<string>();

export const usePrStore = create<PrStore>((set, get) => ({
  prInfo: {},
  reviews: {},
  reviewComments: {},
  workflowRuns: {},
  workflowLoading: {},
  reviewsLoading: {},
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
    // Inflight set: dedup concurrent loadPrInfo calls
    // Loading guard: respect cross-function lock (pushChanges/createPr/mergePr set loading=true)
    if (_inflightPrInfo.has(workspaceId) || get().loading[workspaceId]) return;
    _inflightPrInfo.add(workspaceId);
    const hasCached = workspaceId in get().prInfo;
    set((state) => ({
      loading: { ...state.loading, [workspaceId]: !hasCached },
      error: { ...state.error, [workspaceId]: null },
    }));
    try {
      // Single optimized call: fetches info + checks + reviews + comments
      const data = await getPrFullDataCmd(workspaceId);
      set((state) => ({
        prInfo: { ...state.prInfo, [workspaceId]: data.info },
        reviews: { ...state.reviews, [workspaceId]: data.reviews },
        reviewComments: { ...state.reviewComments, [workspaceId]: data.reviewComments },
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
      _inflightPrInfo.delete(workspaceId);
    }
  },

  loadReviews: async (workspaceId: string) => {
    if (_inflightReviews.has(workspaceId)) return;
    _inflightReviews.add(workspaceId);
    try {
      // Single optimized call: shares gh pr view between reviews and comments
      const data = await getReviewsAndCommentsCmd(workspaceId);
      set((state) => ({
        reviews: { ...state.reviews, [workspaceId]: data.reviews },
        reviewComments: { ...state.reviewComments, [workspaceId]: data.reviewComments },
      }));
    } catch (e) {
      console.error(`[prStore] Failed to load reviews for ${workspaceId}:`, e);
    } finally {
      _inflightReviews.delete(workspaceId);
    }
  },

  loadWorkflowRuns: async (workspaceId: string) => {
    if (_inflightWorkflowRuns.has(workspaceId)) return;
    _inflightWorkflowRuns.add(workspaceId);
    const hasCached = workspaceId in get().workflowRuns;
    set((state) => ({
      workflowLoading: { ...state.workflowLoading, [workspaceId]: !hasCached },
    }));
    try {
      const runs = await getWorkflowRunsCmd(workspaceId);
      set((state) => ({
        workflowRuns: { ...state.workflowRuns, [workspaceId]: runs },
        workflowLoading: { ...state.workflowLoading, [workspaceId]: false },
      }));
    } catch (e) {
      console.error(`[prStore] Failed to load workflow runs for ${workspaceId}:`, e);
      set((state) => ({
        workflowLoading: { ...state.workflowLoading, [workspaceId]: false },
      }));
    } finally {
      _inflightWorkflowRuns.delete(workspaceId);
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

      // Also refresh reviews and workflow runs
      get().loadReviews(workspaceId);
      get().loadWorkflowRuns(workspaceId);

      // Stop polling if all checks are completed
      const allDone = checks.every(
        (c) => c.status === "COMPLETED" || c.conclusion !== null,
      );
      const runs = get().workflowRuns[workspaceId] ?? [];
      const allRunsDone = runs.every(
        (r) => r.status === "completed",
      );
      if (allDone && checks.length > 0 && allRunsDone) {
        get().stopPolling(workspaceId);
      }
    } catch (e) {
      console.error(`[prStore] Failed to refresh checks for ${workspaceId}:`, e);
      set((state) => ({
        error: { ...state.error, [workspaceId]: `Failed to refresh CI checks: ${String(e)}` },
      }));
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

  getReviewFixMessage: (workspaceId: string) => {
    const reviews = get().reviews[workspaceId] ?? [];
    const comments = get().reviewComments[workspaceId] ?? [];

    if (reviews.length === 0 && comments.length === 0) {
      return "No review feedback found.";
    }

    let message =
      "The following PR review feedback has been received. Please address these comments:\n\n";

    if (reviews.length > 0) {
      message += "## Reviews\n";
      for (const r of reviews) {
        if (r.body) {
          message += `- **@${r.author}** (${r.state}): ${r.body}\n`;
        } else {
          message += `- **@${r.author}** (${r.state})\n`;
        }
      }
      message += "\n";
    }

    if (comments.length > 0) {
      message += "## Inline Comments\n";
      for (const c of comments) {
        const location = c.path
          ? c.line
            ? `\`${c.path}:${c.line}\``
            : `\`${c.path}\``
          : "general";
        message += `- **@${c.author}** on ${location}: ${c.body}\n`;
      }
      message += "\n";
    }

    message += "Please review and address each piece of feedback.";
    return message;
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

  getReviews: (workspaceId: string) => {
    return get().reviews[workspaceId] ?? [];
  },

  getReviewComments: (workspaceId: string) => {
    return get().reviewComments[workspaceId] ?? [];
  },

  getError: (workspaceId: string) => {
    return get().error[workspaceId] ?? null;
  },
}));
