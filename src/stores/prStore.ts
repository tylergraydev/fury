import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type PrInfo,
  type PrReview,
  type PrComment,
  type WorkflowRun,
  type CreatePrRequest,
  type MergeResult,
  type SubmitReviewRequest,
  createPr as createPrCmd,
  getPrChecks as getPrChecksCmd,
  pushChanges as pushChangesCmd,
  fixFailingChecks as fixFailingChecksCmd,
  mergePr as mergePrCmd,
  getPrFullData as getPrFullDataCmd,
  getReviewsAndComments as getReviewsAndCommentsCmd,
  getWorkflowRuns as getWorkflowRunsCmd,
  getPrDiff as getPrDiffCmd,
  submitAiReview as submitAiReviewCmd,
} from "../lib/tauri";

export interface AiReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "error" | "warning" | "info";
  category: "bug" | "security" | "performance" | "style" | "logic";
  suggestedFix: string | null;
}

export interface AiReviewResult {
  summary: string;
  overallAssessment: "approve" | "request_changes" | "comment";
  comments: AiReviewComment[];
}

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

  // AI review state
  aiReviewResult: Record<string, AiReviewResult | null>;
  aiReviewLoading: Record<string, boolean>;
  aiReviewError: Record<string, string | null>;

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

  // AI review actions
  getAiReviewPrompt: (workspaceId: string) => Promise<string>;
  setAiReviewResult: (workspaceId: string, result: AiReviewResult) => void;
  submitAiReviewToProvider: (workspaceId: string) => Promise<void>;
  clearAiReview: (workspaceId: string) => void;
}

// Module-level inflight trackers — prevent duplicate concurrent requests
// without polluting store state or triggering re-renders.
const _inflightPrInfo = new Set<string>();
const _inflightReviews = new Set<string>();
const _inflightWorkflowRuns = new Set<string>();

// Cancel tokens for in-flight subscribe calls. When unsubscribe is called
// while subscribe is still awaiting, the token is marked cancelled so
// subscribe cleans up acquired listeners on resume instead of storing them.
const _subscribeTokens = new Map<string, { cancelled: boolean }>();

// Module-level poll intervals — kept outside Zustand state to avoid
// unnecessary re-renders when timers are set/cleared.
export const _pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _pollIntervals.forEach((id) => clearInterval(id));
    _pollIntervals.clear();
    _inflightPrInfo.clear();
    _inflightReviews.clear();
    _inflightWorkflowRuns.clear();
    _subscribeTokens.clear();
  });
}

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
  aiReviewResult: {},
  aiReviewLoading: {},
  aiReviewError: {},

  subscribe: async (workspaceId: string) => {
    if (get().subscriptions[workspaceId]) return;

    // Cancel any in-flight subscribe for this workspace
    const existing = _subscribeTokens.get(workspaceId);
    if (existing) existing.cancelled = true;

    const token = { cancelled: false };
    _subscribeTokens.set(workspaceId, token);

    const unlistenUpdated = await listen<PrInfo>(
      `pr-updated:${workspaceId}`,
      (event) => {
        if (token.cancelled) return;
        set((state) => ({
          prInfo: { ...state.prInfo, [workspaceId]: event.payload },
        }));
      },
    );

    if (token.cancelled) {
      unlistenUpdated();
      _subscribeTokens.delete(workspaceId);
      return;
    }

    const unlistenMerged = await listen<MergeResult>(
      `pr-merged:${workspaceId}`,
      () => {
        /* v8 ignore start -- cancel guard; token is never cancelled during active listener */
        if (token.cancelled) return;
        /* v8 ignore stop */
        get().loadPrInfo(workspaceId);
        get().stopPolling(workspaceId);
      },
    );

    if (token.cancelled) {
      unlistenUpdated();
      unlistenMerged();
      _subscribeTokens.delete(workspaceId);
      return;
    }

    // Keep token in map so unsubscribe can cancel event handlers later
    set((state) => ({
      subscriptions: {
        ...state.subscriptions,
        [workspaceId]: [unlistenUpdated, unlistenMerged],
      },
    }));
  },

  unsubscribe: (workspaceId: string) => {
    // Cancel the token so in-flight subscribes bail out and
    // already-registered event handlers no-op on future events.
    const token = _subscribeTokens.get(workspaceId);
    if (token) {
      token.cancelled = true;
      _subscribeTokens.delete(workspaceId);
    }

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

      // Refresh reviews and workflow runs in parallel
      await Promise.all([
        get().loadReviews(workspaceId),
        get().loadWorkflowRuns(workspaceId),
      ]);

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
    if (_pollIntervals.has(workspaceId)) return;

    // Jitter interval 30-40s to stagger polls across workspaces
    const jitter = 30000 + Math.floor(Math.random() * 10000);
    const interval = setInterval(() => {
      get().refreshChecks(workspaceId);
    }, jitter);

    _pollIntervals.set(workspaceId, interval);
  },

  stopPolling: (workspaceId: string) => {
    const interval = _pollIntervals.get(workspaceId);
    if (interval) {
      clearInterval(interval);
      _pollIntervals.delete(workspaceId);
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

  getAiReviewPrompt: async (workspaceId: string) => {
    set((state) => ({
      aiReviewLoading: { ...state.aiReviewLoading, [workspaceId]: true },
      aiReviewError: { ...state.aiReviewError, [workspaceId]: null },
    }));
    try {
      const diff = await getPrDiffCmd(workspaceId);
      const prInfo = get().prInfo[workspaceId];
      const title = prInfo?.title ?? undefined;

      let prompt =
        "You are reviewing a pull request. Analyze the diff below for bugs, logic errors, " +
        "security issues, and performance problems. Focus on substantive issues — ignore " +
        "formatting and style unless it introduces a bug.\n\n";

      if (title) {
        prompt += `**PR Title:** ${title}\n\n`;
      }

      prompt += `**Diff:**\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;

      prompt +=
        "Respond with a JSON object matching this exact schema (no markdown fencing, use camelCase keys):\n" +
        "{\n" +
        '  "summary": "Brief overall assessment of the PR",\n' +
        '  "overallAssessment": "approve" | "request_changes" | "comment",\n' +
        '  "comments": [\n' +
        "    {\n" +
        '      "path": "file/path.rs",\n' +
        '      "line": 42,\n' +
        '      "body": "Description of the issue",\n' +
        '      "severity": "error" | "warning" | "info",\n' +
        '      "category": "bug" | "security" | "performance" | "style" | "logic",\n' +
        '      "suggestedFix": "Optional code suggestion or null"\n' +
        "    }\n" +
        "  ]\n" +
        "}\n\n" +
        "Rules:\n" +
        "- Only include comments for genuine issues found in the diff\n" +
        '- Use "error" severity for bugs and security issues\n' +
        '- Use "warning" for potential problems and performance issues\n' +
        '- Use "info" for minor suggestions\n' +
        "- The \"line\" must reference a line number from the new side of the diff\n" +
        '- If no issues found, return an empty comments array and "approve" assessment\n' +
        "- For suggestedFix, provide the corrected code snippet or null\n";

      set((state) => ({
        aiReviewLoading: { ...state.aiReviewLoading, [workspaceId]: false },
      }));

      return prompt;
    } catch (e) {
      set((state) => ({
        aiReviewLoading: { ...state.aiReviewLoading, [workspaceId]: false },
        aiReviewError: {
          ...state.aiReviewError,
          [workspaceId]: String(e),
        },
      }));
      throw e;
    }
  },

  setAiReviewResult: (workspaceId: string, result: AiReviewResult) => {
    set((state) => ({
      aiReviewResult: { ...state.aiReviewResult, [workspaceId]: result },
    }));
  },

  submitAiReviewToProvider: async (workspaceId: string) => {
    const review = get().aiReviewResult[workspaceId];
    if (!review) return;

    set((state) => ({
      aiReviewLoading: { ...state.aiReviewLoading, [workspaceId]: true },
      aiReviewError: { ...state.aiReviewError, [workspaceId]: null },
    }));

    try {
      const eventMap: Record<string, string> = {
        approve: "APPROVE",
        request_changes: "REQUEST_CHANGES",
        comment: "COMMENT",
      };

      const request: SubmitReviewRequest = {
        workspaceId,
        body: review.summary,
        event: eventMap[review.overallAssessment] ?? "COMMENT",
        comments: review.comments.map((c) => {
          let body = `**${c.severity} (${c.category}):** ${c.body}`;
          if (c.suggestedFix) {
            body += `\n\n\`\`\`suggestion\n${c.suggestedFix}\n\`\`\``;
          }
          return { path: c.path, line: c.line, body };
        }),
      };

      await submitAiReviewCmd(request);

      set((state) => ({
        aiReviewLoading: { ...state.aiReviewLoading, [workspaceId]: false },
      }));
    } catch (e) {
      set((state) => ({
        aiReviewLoading: { ...state.aiReviewLoading, [workspaceId]: false },
        aiReviewError: {
          ...state.aiReviewError,
          [workspaceId]: String(e),
        },
      }));
      throw e;
    }
  },

  clearAiReview: (workspaceId: string) => {
    set((state) => ({
      aiReviewResult: { ...state.aiReviewResult, [workspaceId]: null },
      aiReviewError: { ...state.aiReviewError, [workspaceId]: null },
    }));
  },
}));
