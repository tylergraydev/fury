import { useEffect, useState } from "react";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useTodoStore } from "../../stores/todoStore";
import type { PrInfo, PrCheck } from "../../lib/tauri";

interface PRPanelProps {
  workspaceId: string;
}

export function PRPanel({ workspaceId }: PRPanelProps) {
  const prInfo = usePrStore((s) => s.prInfo[workspaceId] ?? null);
  const loading = usePrStore((s) => s.loading[workspaceId] ?? false);
  const error = usePrStore((s) => s.error[workspaceId] ?? null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const store = usePrStore.getState();
      store.subscribe(workspaceId);
      store.loadPrInfo(workspaceId);
    });
    return () => {
      cancelAnimationFrame(id);
      usePrStore.getState().unsubscribe(workspaceId);
    };
  }, [workspaceId]);

  const hasPr = prInfo?.prNumber != null;
  const isMerged = prInfo?.state === "MERGED";

  if (loading && !prInfo) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Loading PR info...
      </div>
    );
  }

  if (isMerged && prInfo) {
    return <MergedView prInfo={prInfo} />;
  }

  if (hasPr && prInfo) {
    return (
      <PRStatusView
        workspaceId={workspaceId}
        prInfo={prInfo}
        loading={loading}
        error={error}
        onRefresh={() => usePrStore.getState().refreshChecks(workspaceId)}
        onPush={() => usePrStore.getState().pushChanges(workspaceId)}
        onFix={async () => {
          const message = await usePrStore.getState().getFixMessage(workspaceId);
          if (message === "No failing checks found.") return;
          useChatStore.getState().addUserMessage(workspaceId, message);
          useAgentStore
            .getState()
            .sendMessage(workspaceId, message, "workspace");
        }}
        onMerge={(method) => usePrStore.getState().mergePr(workspaceId, method)}
      />
    );
  }

  return (
    <CreatePRForm
      workspaceId={workspaceId}
      loading={loading}
      error={error}
      onCreate={(title, body, draft) =>
        usePrStore.getState().createPr({ workspaceId, title, body, draft })
      }
    />
  );
}

// --- Create PR Form ---

function CreatePRForm({
  workspaceId,
  loading,
  error,
  onCreate,
}: {
  workspaceId: string;
  loading: boolean;
  error: string | null;
  onCreate: (title: string, body: string, draft: boolean) => Promise<unknown>;
}) {
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId),
  );
  const [title, setTitle] = useState(workspace?.branch ?? "");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      await onCreate(title, body, draft);
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center px-4 py-2 text-xs font-medium"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        Create Pull Request
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-lg space-y-4">
          {error && (
            <div
              className="rounded p-2 text-xs"
              style={{
                backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label
              className="mb-1 block text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded px-3 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              placeholder="PR title"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Description
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full resize-none rounded px-3 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              placeholder="Describe your changes..."
            />
          </div>

          <label
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
            />
            Create as draft
          </label>

          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
            className="rounded px-4 py-1.5 text-sm transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            {loading ? "Creating..." : "Create Pull Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- PR Status View ---

function PRStatusView({
  workspaceId,
  prInfo,
  loading,
  error,
  onRefresh,
  onPush,
  onFix,
  onMerge,
}: {
  workspaceId: string;
  prInfo: PrInfo;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPush: () => void;
  onFix: () => void;
  onMerge: (method: string) => void;
}) {
  const [mergeMethod, setMergeMethod] = useState("squash");
  const checks = prInfo.checks ?? [];
  const hasFailingChecks = checks.some(
    (c: PrCheck) =>
      c.conclusion === "FAILURE" ||
      c.conclusion === "failure",
  );
  const hasPendingChecks = checks.some(
    (c: PrCheck) => c.conclusion === null && c.status !== "COMPLETED",
  );
  const allChecksPassed =
    checks.length > 0 &&
    checks.every(
      (c: PrCheck) => c.conclusion === "SUCCESS" || c.conclusion === "success",
    );

  // Todo merge blocking
  const todoTotal = useTodoStore(
    (s) => (s.todos[workspaceId] ?? []).length,
  );
  const todoCompleted = useTodoStore(
    (s) => (s.todos[workspaceId] ?? []).filter((t) => t.completed).length,
  );
  const todosAllCompleted = todoTotal > 0 && todoCompleted === todoTotal;
  const hasPendingTodos = todoTotal > 0 && !todosAllCompleted;

  // Load todos and start polling when checks are pending
  useEffect(() => {
    useTodoStore.getState().loadTodos(workspaceId);
    if (hasPendingChecks) {
      usePrStore.getState().startPolling(workspaceId);
    }
    return () => {
      usePrStore.getState().stopPolling(workspaceId);
    };
  }, [hasPendingChecks, workspaceId]);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span className="font-medium">
          PR #{prInfo.prNumber}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {prInfo.title}
        </span>
        {prInfo.prUrl && (
          <a
            href={prInfo.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[10px] underline"
            style={{ color: "var(--accent)" }}
          >
            View on GitHub
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-lg space-y-4">
          {error && (
            <div
              className="rounded p-2 text-xs"
              style={{
                backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded px-2 py-0.5"
              style={{
                backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)",
                color: "var(--success)",
              }}
            >
              {prInfo.state}
            </span>
            {prInfo.mergeable && (
              <span
                className="rounded px-2 py-0.5"
                style={{
                  backgroundColor:
                    prInfo.mergeable === "MERGEABLE"
                      ? "color-mix(in srgb, var(--success) 15%, transparent)"
                      : "color-mix(in srgb, var(--error) 15%, transparent)",
                  color:
                    prInfo.mergeable === "MERGEABLE"
                      ? "var(--success)"
                      : "var(--error)",
                }}
              >
                {prInfo.mergeable === "MERGEABLE"
                  ? "No conflicts"
                  : prInfo.mergeable}
              </span>
            )}
            {todoTotal > 0 && (
              <span
                className="rounded px-2 py-0.5"
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

          {/* Todo merge blocking warning */}
          {hasPendingTodos && (
            <div
              className="rounded p-2 text-xs"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--warning) 15%, transparent)",
                color: "var(--warning)",
              }}
            >
              {todoCompleted} of {todoTotal} todos completed.
              Complete all todos before merging.
              <span className="ml-2 underline">
                View Todos
              </span>
            </div>
          )}

          {/* Checks */}
          <div>
            <div
              className="mb-2 flex items-center justify-between text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <span>
                CI Checks{" "}
                {checks.length > 0 && `(${checks.length})`}
              </span>
              <button
                onClick={onRefresh}
                className="rounded px-2 py-0.5"
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
                className="rounded p-3 text-center text-xs"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                }}
              >
                No checks found
              </div>
            ) : (
              <div
                className="space-y-1 rounded p-2"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                {checks.map((check: PrCheck) => (
                  <CheckRow key={check.name} check={check} />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onPush}
              disabled={loading}
              className="rounded px-3 py-1 text-xs transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
              }}
            >
              {loading ? "Pushing..." : "Push Updates"}
            </button>

            {hasFailingChecks && (
              <button
                onClick={onFix}
                className="rounded px-3 py-1 text-xs"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                Fix with Claude
              </button>
            )}

            {(allChecksPassed || checks.length === 0) &&
              prInfo.mergeable === "MERGEABLE" && (
                <div className="ml-auto flex items-center gap-1">
                  <select
                    value={mergeMethod}
                    onChange={(e) => setMergeMethod(e.target.value)}
                    className="rounded px-2 py-1 text-xs outline-none"
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
                    onClick={() => onMerge(mergeMethod)}
                    disabled={loading || hasPendingTodos}
                    title={
                      hasPendingTodos
                        ? "Complete all todos first"
                        : "Merge this PR"
                    }
                    className="rounded px-3 py-1 text-xs transition-opacity disabled:opacity-50"
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
      </div>
    </div>
  );
}

// --- Check Row ---

function CheckRow({ check }: { check: PrCheck }) {
  const isSuccess =
    check.conclusion === "SUCCESS" || check.conclusion === "success";
  const isFailure =
    check.conclusion === "FAILURE" || check.conclusion === "failure";
  const isPending = check.conclusion === null;

  const dotColor = isSuccess
    ? "var(--success)"
    : isFailure
      ? "var(--error)"
      : "var(--text-muted)";

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs">
      <span
        className={`h-2 w-2 rounded-full ${isPending ? "animate-pulse" : ""}`}
        style={{ backgroundColor: dotColor }}
      />
      <span style={{ color: "var(--text-primary)" }}>{check.name}</span>
      {check.conclusion && (
        <span
          className="ml-auto"
          style={{
            color: isSuccess ? "var(--success)" : isFailure ? "var(--error)" : "var(--text-muted)",
          }}
        >
          {check.conclusion.toLowerCase()}
        </span>
      )}
      {isPending && (
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          pending
        </span>
      )}
    </div>
  );
}

// --- Merged View ---

function MergedView({ prInfo }: { prInfo: PrInfo }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="rounded-full px-4 py-1 text-sm"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
          color: "var(--accent)",
        }}
      >
        PR #{prInfo.prNumber} Merged
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {prInfo.title}
      </p>
      {prInfo.prUrl && (
        <a
          href={prInfo.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline"
          style={{ color: "var(--accent)" }}
        >
          View on GitHub
        </a>
      )}
    </div>
  );
}
