import { useEffect, useState } from "react";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTodoStore } from "../../stores/todoStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import type { PrCheck } from "../../lib/tauri";

interface Props {
  workspaceId: string;
}

function isCheckSuccess(conclusion: string | null): boolean {
  return conclusion === "SUCCESS" || conclusion === "success";
}

function isCheckFailure(conclusion: string | null): boolean {
  return conclusion === "FAILURE" || conclusion === "failure";
}

function CheckRow({ check }: { check: PrCheck }) {
  const isSuccess = isCheckSuccess(check.conclusion);
  const isFailure = isCheckFailure(check.conclusion);
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
      <span className="truncate" style={{ color: "var(--text-primary)" }}>
        {check.name}
      </span>
      <span
        className="ml-auto flex-shrink-0"
        style={{
          color: isSuccess
            ? "var(--success)"
            : isFailure
              ? "var(--error)"
              : "var(--text-muted)",
        }}
      >
        {check.conclusion?.toLowerCase() ?? "pending"}
      </span>
    </div>
  );
}

function CreatePRInline({
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

  return (
    <div className="space-y-3 p-3">
      <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        Create Pull Request
      </div>

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

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded px-2 py-1 text-xs outline-none"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
        placeholder="PR title"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full resize-none rounded px-2 py-1 text-xs outline-none"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
        placeholder="Description..."
      />

      <div className="flex items-center gap-2">
        <label
          className="flex items-center gap-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
          />
          Draft
        </label>

        <button
          onClick={async () => {
            if (title.trim()) await onCreate(title, body, draft);
          }}
          disabled={loading || !title.trim()}
          className="ml-auto rounded px-3 py-1 text-xs disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          {loading ? "Creating..." : "Create PR"}
        </button>
      </div>
    </div>
  );
}

export function ChecksPanel({ workspaceId }: Props) {
  const prInfo = usePrStore((s) => s.prInfo[workspaceId] ?? null);
  const loading = usePrStore((s) => s.loading[workspaceId] ?? false);
  const error = usePrStore((s) => s.error[workspaceId] ?? null);

  const [mergeMethod, setMergeMethod] = useState("squash");

  useEffect(() => {
    const store = usePrStore.getState();
    store.subscribe(workspaceId);
    store.loadPrInfo(workspaceId);
    return () => usePrStore.getState().unsubscribe(workspaceId);
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

  const todoTotal = useTodoStore(
    (s) => (s.todos[workspaceId] ?? []).length,
  );
  const todoCompleted = useTodoStore(
    (s) => (s.todos[workspaceId] ?? []).filter((t) => t.completed).length,
  );
  const todosAllCompleted = todoTotal > 0 && todoCompleted === todoTotal;
  const hasPendingTodos = todoTotal > 0 && !todosAllCompleted;

  useEffect(() => {
    useTodoStore.getState().loadTodos(workspaceId);
    if (hasPendingChecks) {
      usePrStore.getState().startPolling(workspaceId);
    }
  }, [hasPendingChecks, workspaceId]);

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

  // No PR yet - show creation form
  if (!hasPr) {
    return (
      <CreatePRInline
        workspaceId={workspaceId}
        loading={loading}
        error={error}
        onCreate={(title, body, draft) =>
          usePrStore.getState().createPr({ workspaceId, title, body, draft })
        }
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
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          #{prInfo!.prNumber}
        </span>
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
