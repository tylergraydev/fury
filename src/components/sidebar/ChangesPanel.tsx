import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startDiffWatcher, stopDiffWatcher } from "../../lib/tauri";
import type { FileDiff, FileStatus } from "../../lib/tauri";
import type { SidebarContext } from "../../App";
import { DiffHoverPreview } from "./DiffHoverPreview";

interface Props {
  context: SidebarContext;
}

function statusLabel(status: FileStatus): string {
  if (status === "Added") return "A";
  if (status === "Modified") return "M";
  if (status === "Deleted") return "D";
  if (status === "Untracked") return "U";
  if (typeof status === "object" && "Renamed" in status) return "R";
  return "?";
}

function statusColor(status: FileStatus): string {
  if (status === "Added" || status === "Untracked") return "var(--success)";
  if (status === "Deleted") return "var(--error)";
  if (status === "Modified") return "var(--accent)";
  if (typeof status === "object" && "Renamed" in status) return "var(--accent)";
  return "var(--text-muted)";
}

function isCheckSuccess(conclusion: string | null): boolean {
  return conclusion === "SUCCESS" || conclusion === "success";
}

function isCheckFailure(conclusion: string | null): boolean {
  return conclusion === "FAILURE" || conclusion === "failure";
}

function PrStatusBar({ workspaceId }: { workspaceId: string }) {
  const prInfo = usePrStore((s) => s.prInfo[workspaceId] ?? null);
  const prLoading = usePrStore((s) => s.loading[workspaceId] ?? false);
  const prError = usePrStore((s) => s.error[workspaceId] ?? null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const store = usePrStore.getState();
      store.subscribe(workspaceId).catch((e) => {
        /* v8 ignore start -- subscribe rarely fails */
        console.error("[PrStatusBar] Failed to subscribe to PR events:", e);
        /* v8 ignore stop */
      });
      store.loadPrInfo(workspaceId);
    });
    return () => {
      cancelAnimationFrame(id);
      usePrStore.getState().unsubscribe(workspaceId);
    };
  }, [workspaceId]);

  const hasPr = prInfo?.prNumber != null;
  const checks = prInfo?.checks ?? [];
  const hasPendingChecks = checks.some(
    (c) => c.conclusion === null && c.status !== "COMPLETED",
  );
  const hasFailingChecks = checks.some((c) => isCheckFailure(c.conclusion));
  const allChecksPassed =
    checks.length > 0 && checks.every((c) => isCheckSuccess(c.conclusion));

  const handleCreatePr = async () => {
    const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
    const title = workspace?.branch ?? "PR";
    try {
      await usePrStore.getState().createPr({
        workspaceId,
        title,
        body: "",
      });
      useUIStore.getState().setRightSidebarTab("checks");
    } catch (e) {
      console.error("[ChangesPanel] Failed to create PR:", e);
    }
  };

  const handleFix = async () => {
    const status = useAgentStore.getState().agents[workspaceId]?.status;
    if (status === "Running" || status === "Stopping") return;
    try {
      const message = await usePrStore.getState().getFixMessage(workspaceId);
      if (message === "No failing checks found.") return;
      useChatStore.getState().addUserMessage(workspaceId, message);
      await useAgentStore
        .getState()
        .sendMessage(workspaceId, message, "workspace");
    } catch (e) {
      console.error("[ChangesPanel] Failed to generate fix:", e);
    }
  };

  const handleMerge = async () => {
    try {
      await usePrStore.getState().mergePr(workspaceId, "squash");
    } catch (e) {
      console.error("[ChangesPanel] Failed to merge PR:", e);
    }
  };

  // Auto-switch to checks tab when checks are pending
  useEffect(() => {
    if (hasPr && hasPendingChecks) {
      usePrStore.getState().startPolling(workspaceId);
    }
    return () => {
      usePrStore.getState().stopPolling(workspaceId);
    };
  }, [hasPr, hasPendingChecks, workspaceId]);

  const prLink = hasPr && prInfo?.prUrl ? (
    <a
      href={prInfo.prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs font-medium no-underline hover:underline"
      style={{ color: "var(--accent)" }}
    >
      PR #{prInfo.prNumber}
      <ExternalLink className="h-3 w-3" />
    </a>
  ) : hasPr ? (
    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
      PR #{prInfo?.prNumber}
    </span>
  ) : null;

  // Right-side action button
  let rightAction: React.ReactNode = null;

  if (!hasPr) {
    rightAction = (
      <button
        onClick={handleCreatePr}
        disabled={prLoading}
        className="rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50"
        style={{
          backgroundColor: "var(--accent)",
          color: "var(--bg-primary)",
        }}
      >
        {prLoading ? "Creating..." : "Create PR"}
      </button>
    );
  } else if (hasPendingChecks) {
    rightAction = (
      <span
        className="animate-pulse text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Checking...
      </span>
    );
  } else if (hasFailingChecks) {
    rightAction = (
      <button
        onClick={handleFix}
        className="rounded px-2.5 py-1 text-xs font-medium"
        style={{
          backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
          color: "var(--error)",
        }}
      >
        Fix Errors
      </button>
    );
  } else if (allChecksPassed) {
    rightAction = (
      <button
        onClick={handleMerge}
        disabled={prLoading}
        className="rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50"
        style={{
          backgroundColor: "var(--success)",
          color: "var(--bg-primary)",
        }}
      >
        {prLoading ? "Merging..." : "Merge"}
      </button>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-3 py-2">
        <div>{prLink}</div>
        <div>{rightAction}</div>
      </div>
      {prError && (
        <div
          className="truncate px-3 pb-2 text-xs"
          style={{ color: "var(--error)" }}
          title={prError}
        >
          {prError}
        </div>
      )}
    </div>
  );
}

export function ChangesPanel({ context }: Props) {
  const contextId = context.id;
  const diffResult = useDiffStore(
    (s) => s.diffResults[contextId] ?? null,
  );
  const selectedFile = useDiffStore(
    (s) => s.selectedFile[contextId] ?? null,
  );
  const loading = useDiffStore((s) => s.loading[contextId] ?? false);
  const error = useDiffStore((s) => s.error[contextId] ?? null);
  const agentStatus = useAgentStore(
    (s) => s.agents[contextId]?.status ?? "Idle",
  );
  const [hoveredFile, setHoveredFile] = useState<FileDiff | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const store = useDiffStore.getState();
    if (store.diffResults[contextId] !== undefined) return;
    const id = requestAnimationFrame(() => {
      const s = useDiffStore.getState();
      if (context.type === "workspace") {
        s.loadDiff(contextId);
      } else {
        s.loadRepoDiff(contextId);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [context.type, contextId]);

  // Auto-refresh when agent transitions to Idle (not on initial mount)
  const prevAgentStatus = useRef(agentStatus);
  useEffect(() => {
    const wasRunning = prevAgentStatus.current !== "Idle";
    prevAgentStatus.current = agentStatus;
    /* v8 ignore next -- @preserve */
    if (agentStatus === "Idle" && wasRunning) {
      const store = useDiffStore.getState();
      if (context.type === "workspace") {
        store.refresh(contextId);
      } else {
        store.refreshRepo(contextId);
      }
    }
  }, [agentStatus, context.type, contextId]);

  // Poll for changes every 3s while the panel is visible.
  // Uses loadDiff/loadRepoDiff (not refresh) to avoid clearing patch preview cache.
  // Inflight dedup in the store prevents overlapping requests.
  useEffect(() => {
    const interval = setInterval(() => {
      const store = useDiffStore.getState();
      if (context.type === "workspace") {
        store.loadDiff(contextId);
      } else {
        store.loadRepoDiff(contextId);
      }
    }, 3_000);
    return () => clearInterval(interval);
  }, [context.type, contextId]);

  // File watcher: start watching on mount, trigger reload on file changes.
  // The 3s poll above serves as a fallback if the watcher fails to start.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    const setup = async () => {
      try {
        await startDiffWatcher(contextId, context.type);
      } catch {
        // Watcher failed to start — 3s poll is the fallback
        return;
      }
      if (cancelled) return;
      try {
        unlisten = await listen(`diff-changed:${contextId}`, () => {
          const store = useDiffStore.getState();
          if (context.type === "workspace") {
            store.loadDiff(contextId);
          } else {
            store.loadRepoDiff(contextId);
          }
        });
      } catch {
        // Listen failed — 3s poll is the fallback
      }
    };
    setup();

    return () => {
      cancelled = true;
      unlisten?.();
      stopDiffWatcher(contextId).catch(() => {});
    };
  }, [context.type, contextId]);

  const handleFileClick = (filePath: string) => {
    const store = useDiffStore.getState();
    if (context.type === "workspace") {
      store.selectFile(contextId, filePath);
    } else {
      store.selectRepoFile(contextId, filePath);
    }
    useUIStore.getState().openViewTab("diff", true);
  };

  const handleRefresh = () => {
    const store = useDiffStore.getState();
    if (context.type === "workspace") {
      store.refresh(contextId);
    } else {
      store.refreshRepo(contextId);
    }
  };

  if (loading && !diffResult) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Loading changes...
      </div>
    );
  }

  if (error && !diffResult) {
    return (
      <div className="p-3 text-sm" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  if (!diffResult || diffResult.files.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {context.type === "workspace" && (
          <PrStatusBar workspaceId={contextId} />
        )}
        <div
          className="flex flex-1 items-center justify-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No changes
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* PR workflow bar (workspace only) */}
      {context.type === "workspace" && (
        <PrStatusBar workspaceId={contextId} />
      )}

      {/* Summary */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-sm"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        <span>
          {diffResult.files.length} file
          {diffResult.files.length !== 1 ? "s" : ""}
        </span>
        <span style={{ color: "var(--success)" }}>
          +{diffResult.totalAdditions}
        </span>
        <span style={{ color: "var(--error)" }}>
          -{diffResult.totalDeletions}
        </span>
        <button
          onClick={handleRefresh}
          className="ml-auto rounded px-1.5 py-0.5 text-xs hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
          }}
        >
          Refresh
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {diffResult.files.map((file) => (
          <button
            key={file.path}
            onClick={() => handleFileClick(file.path)}
            onMouseEnter={(e) => {
              setHoveredFile(file);
              setAnchorEl(e.currentTarget);
            }}
            onMouseLeave={() => {
              setHoveredFile(null);
              setAnchorEl(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]"
            style={{
              backgroundColor:
                selectedFile === file.path
                  ? "var(--bg-surface)"
                  : "transparent",
              color: "var(--text-primary)",
            }}
          >
            <span
              className="flex-shrink-0 font-mono text-xs font-bold"
              style={{ color: statusColor(file.status) }}
            >
              {statusLabel(file.status)}
            </span>
            <span className="truncate">
              {file.path.split("/").pop()}
            </span>
            <span
              className="ml-auto flex-shrink-0 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {file.additions > 0 && (
                <span style={{ color: "var(--success)" }}>
                  +{file.additions}
                </span>
              )}
              {file.deletions > 0 && (
                <span style={{ color: "var(--error)" }} className="ml-1">
                  -{file.deletions}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {hoveredFile && (
        <DiffHoverPreview
          file={hoveredFile}
          contextId={contextId}
          contextType={context.type}
          anchorEl={anchorEl}
        />
      )}
    </div>
  );
}
