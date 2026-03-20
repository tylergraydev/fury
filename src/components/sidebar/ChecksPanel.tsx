import { useEffect, useState } from "react";
import { usePrStore } from "../../stores/prStore";
import { useTodoStore } from "../../stores/todoStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { ExternalLink, RotateCw } from "lucide-react";
import type {
  PrReview,
  PrComment,
  WorkflowRun,
} from "../../lib/tauri";
import { CheckRow, isCheckSuccess, isCheckFailure } from "./CheckRow";
import { ReviewRow, ReviewCommentRow } from "./ReviewRow";
import { WorkflowRunRow, runIsInProgress } from "./WorkflowRunRow";

const EMPTY_REVIEWS: PrReview[] = [];
const EMPTY_COMMENTS: PrComment[] = [];
const EMPTY_RUNS: WorkflowRun[] = [];

interface Props {
  workspaceId: string;
}

function CreatePRInline({
  workspaceId,
  error,
}: {
  workspaceId: string;
  error: string | null;
}) {
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!creating) return;
    /* v8 ignore start -- timer callbacks tested via integration */
    const interval = setInterval(() => {
      usePrStore.getState().loadPrInfo(workspaceId);
    }, 5000);
    const timeout = setTimeout(() => {
      setCreating(false);
    }, 120000);
    /* v8 ignore stop */
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [creating, workspaceId]);

  // Stop the creating state once a PR is detected
  const hasPr = usePrStore((s) => s.prInfo[workspaceId]?.prNumber != null);
  useEffect(() => {
    /* v8 ignore start -- creating is always false when hasPr transitions */
    if (hasPr && creating) setCreating(false);
    /* v8 ignore stop */
  }, [hasPr, creating]);

  const handleCreate = () => {
    setCreating(true);
    const message =
      "Create a pull request for this branch. Look at the git log and diff to generate a concise, descriptive title and a clear description summarizing the changes. Use `gh pr create` to create the PR.";
    useChatStore.getState().addUserMessage(workspaceId, message);
    useAgentStore
      .getState()
      .sendMessage(workspaceId, message, "workspace");
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        No pull request
      </div>

      {error && (
        <div
          className="w-full rounded p-2 text-xs"
          style={{
            backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={creating}
        className="rounded px-4 py-1.5 text-xs disabled:opacity-50"
        style={{
          backgroundColor: "var(--accent)",
          color: "var(--bg-primary)",
        }}
      >
        {creating ? "Creating..." : "Create PR"}
      </button>

      {creating && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Claude is generating title and description...
        </div>
      )}
    </div>
  );
}

export function ChecksPanel({ workspaceId }: Props) {
  const prInfo = usePrStore((s) => s.prInfo[workspaceId] ?? null);
  const reviews = usePrStore((s) => s.reviews[workspaceId] ?? EMPTY_REVIEWS);
  const reviewComments = usePrStore((s) => s.reviewComments[workspaceId] ?? EMPTY_COMMENTS);
  const loading = usePrStore((s) => s.loading[workspaceId] ?? false);
  const error = usePrStore((s) => s.error[workspaceId] ?? null);
  const workflowRuns = usePrStore((s) => s.workflowRuns[workspaceId] ?? EMPTY_RUNS);
  const workflowLoading = usePrStore((s) => s.workflowLoading[workspaceId] ?? false);
  const isAdo = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;
    const repo = useRepositoryStore.getState().repositories.find((r) => r.id === ws.repoId);
    return repo?.provider === "azure_dev_ops";
  });

  const [mergeMethod, setMergeMethod] = useState("squash");
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const store = usePrStore.getState();
      store.subscribe(workspaceId);
      store.loadPrInfo(workspaceId);
      store.loadWorkflowRuns(workspaceId);
    });
    return () => {
      cancelAnimationFrame(id);
      usePrStore.getState().unsubscribe(workspaceId);
    };
  }, [workspaceId]);

  const hasPr = prInfo?.prNumber != null;
  const isMerged = prInfo?.state === "MERGED";
  const checks = prInfo?.checks ?? [];
  const hasFailingChecks = checks.some((c) => isCheckFailure(c.conclusion));
  const allChecksPassed =
    checks.length > 0 && checks.every((c) => isCheckSuccess(c.conclusion));
  const hasPendingChecks = checks.some(
    (c) => c.conclusion === null && c.status !== "COMPLETED",
  );
  const hasInProgressRuns = workflowRuns.some((r) => runIsInProgress(r));

  const todoTotal = useTodoStore(
    (s) => (s.todos[workspaceId] ?? []).length,
  );
  const todoCompleted = useTodoStore(
    (s) => (s.todos[workspaceId] ?? []).filter((t) => t.completed).length,
  );
  const todosAllCompleted = todoTotal > 0 && todoCompleted === todoTotal;
  const hasPendingTodos = todoTotal > 0 && !todosAllCompleted;
  const hasReviewFeedback = reviews.length > 0 || reviewComments.length > 0;

  useEffect(() => {
    useTodoStore.getState().loadTodos(workspaceId);
    if (hasPendingChecks || hasInProgressRuns) {
      usePrStore.getState().startPolling(workspaceId);
    }
    return () => {
      usePrStore.getState().stopPolling(workspaceId);
    };
  }, [hasPendingChecks, hasInProgressRuns, workspaceId]);

  const handleFix = async () => {
    try {
      const message = await usePrStore.getState().getFixMessage(workspaceId);
      if (message === "No failing checks found.") return;
      useChatStore.getState().addUserMessage(workspaceId, message);
      useAgentStore
        .getState()
        .sendMessage(workspaceId, message, "workspace");
    } catch (e) {
      console.error("[ChecksPanel] Failed to generate fix:", e);
    }
  };

  const handleSendReviews = () => {
    const message = usePrStore.getState().getReviewFixMessage(workspaceId);
    if (message === "No review feedback found.") return;
    useChatStore.getState().addUserMessage(workspaceId, message);
    useAgentStore
      .getState()
      .sendMessage(workspaceId, message, "workspace");
  };

  // No PR yet - show creation button
  if (!hasPr) {
    return (
      <CreatePRInline
        workspaceId={workspaceId}
        error={error}
      />
    );
  }

  // Merged
  if (isMerged && prInfo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <div
          className="rounded-full px-3 py-0.5 text-xs"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--accent) 15%, transparent)",
            color: "var(--accent)",
          }}
        >
          PR #{prInfo.prNumber} Merged
        </div>
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {prInfo.title}
        </p>
      </div>
    );
  }

  // PR exists - show status
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* PR header */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {prInfo!.prUrl ? (
          <a
            href={prInfo!.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-medium no-underline hover:underline"
            style={{ color: "var(--accent)" }}
          >
            #{prInfo!.prNumber}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            #{prInfo!.prNumber}
          </span>
        )}
        <span
          className="truncate text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {prInfo!.title}
        </span>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1 px-3 py-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px]"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--success) 15%, transparent)",
            color: "var(--success)",
          }}
        >
          {prInfo!.state}
        </span>
        {prInfo!.mergeable && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor:
                prInfo!.mergeable === "MERGEABLE"
                  ? "color-mix(in srgb, var(--success) 15%, transparent)"
                  : "color-mix(in srgb, var(--error) 15%, transparent)",
              color:
                prInfo!.mergeable === "MERGEABLE"
                  ? "var(--success)"
                  : "var(--error)",
            }}
          >
            {prInfo!.mergeable === "MERGEABLE"
              ? "No conflicts"
              : prInfo!.mergeable}
          </span>
        )}
        {todoTotal > 0 && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: todosAllCompleted
                ? "color-mix(in srgb, var(--success) 15%, transparent)"
                : "color-mix(in srgb, var(--warning) 15%, transparent)",
              color: todosAllCompleted
                ? "var(--success)"
                : "var(--warning)",
            }}
          >
            Todos: {todoCompleted}/{todoTotal}
          </span>
        )}
      </div>

      {error && (
        <div
          className="mx-3 rounded p-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--error) 15%, transparent)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      {/* Checks */}
      <div className="px-3 py-1">
        <div
          className="mb-1 flex items-center justify-between text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>CI Checks {checks.length > 0 && `(${checks.length})`}</span>
          <button
            onClick={() => usePrStore.getState().refreshChecks(workspaceId)}
            className="rounded px-1.5 py-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
          >
            Refresh
          </button>
        </div>

        {checks.length === 0 ? (
          <div
            className="rounded p-2 text-center text-[10px]"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-muted)",
            }}
          >
            No checks found
          </div>
        ) : (
          <div
            className="space-y-0.5 rounded p-1"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            {checks.map((check) => (
              <CheckRow key={check.name} check={check} />
            ))}
          </div>
        )}
      </div>

      {/* Actions (Workflow Runs) */}
      <div className="px-3 py-1">
        <div
          className="mb-1 flex items-center justify-between text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>{isAdo ? "Pipelines" : "Actions"} {workflowRuns.length > 0 && `(${workflowRuns.length})`}</span>
          <button
            onClick={() => usePrStore.getState().loadWorkflowRuns(workspaceId)}
            className="rounded px-1.5 py-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
          >
            {workflowLoading ? (
              <RotateCw className="h-3 w-3 animate-spin" />
            ) : (
              "Refresh"
            )}
          </button>
        </div>

        {workflowRuns.length === 0 ? (
          <div
            className="rounded p-2 text-center text-[10px]"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-muted)",
            }}
          >
            {workflowLoading ? "Loading..." : "No workflow runs found"}
          </div>
        ) : (
          <div
            className="space-y-0.5 rounded p-1"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            {workflowRuns.map((run) => (
              <WorkflowRunRow
                key={run.id}
                run={run}
                workspaceId={workspaceId}
                expanded={expandedRunId === run.id}
                onToggle={() =>
                  setExpandedRunId(expandedRunId === run.id ? null : run.id)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Reviews */}
      {hasReviewFeedback && (
        <div className="px-3 py-1">
          <div
            className="mb-1 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            Reviews ({reviews.length + reviewComments.length})
          </div>

          <div
            className="space-y-0.5 rounded p-1"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            {reviews.map((review) => (
              <ReviewRow key={review.id} review={review} />
            ))}
            {reviewComments.map((comment) => (
              <ReviewCommentRow key={comment.id} comment={comment} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-3 py-2">
        <button
          onClick={() => usePrStore.getState().pushChanges(workspaceId)}
          disabled={loading}
          className="rounded px-2 py-0.5 text-[10px] disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
          }}
        >
          {loading ? "Pushing..." : "Push"}
        </button>

        {hasFailingChecks && (
          <button
            onClick={handleFix}
            className="rounded px-2 py-0.5 text-[10px]"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            Fix with Claude
          </button>
        )}

        {hasReviewFeedback && (
          <button
            onClick={handleSendReviews}
            className="rounded px-2 py-0.5 text-[10px]"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            Send to agent
          </button>
        )}

        {(allChecksPassed || checks.length === 0) &&
          prInfo!.mergeable === "MERGEABLE" && (
            <div className="ml-auto flex items-center gap-1">
              <select
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value)}
                className="rounded px-1 py-0.5 text-[10px] outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="squash">Squash</option>
                <option value="merge">Merge</option>
                <option value="rebase">Rebase</option>
              </select>
              <button
                onClick={() => usePrStore.getState().mergePr(workspaceId, mergeMethod)}
                disabled={loading || hasPendingTodos}
                title={
                  hasPendingTodos
                    ? "Complete all todos first"
                    : "Merge this PR"
                }
                className="rounded px-2 py-0.5 text-[10px] disabled:opacity-50"
                style={{
                  backgroundColor: "var(--success)",
                  color: "var(--bg-primary)",
                }}
              >
                Merge
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
