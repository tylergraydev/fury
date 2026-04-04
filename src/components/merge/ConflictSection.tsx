import { useEffect } from "react";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { useMergeStore } from "../../stores/mergeStore";
import { useAgentStore } from "../../stores/agentStore";
import { ConflictResolver } from "./ConflictResolver";
import type { ConflictType, ConflictedFile } from "../../lib/tauri";

// Stable empty-array reference to avoid infinite re-render loops
// with Zustand 5's useSyncExternalStore integration.
const EMPTY_CONFLICTED_FILES: ConflictedFile[] = [];

interface Props {
  workspaceId: string;
}

function conflictTypeLabel(ct: ConflictType): string {
  switch (ct) {
    case "bothModified":
      return "Both Modified";
    case "deletedByUs":
      return "Deleted by Us";
    case "deletedByThem":
      return "Deleted by Them";
    case "addedByBoth":
      return "Added by Both";
    case "bothDeleted":
      return "Both Deleted";
    default:
      return "Unknown";
  }
}

export function ConflictSection({ workspaceId }: Props) {
  const conflictedFiles = useMergeStore(
    (s) => s.conflictedFiles[workspaceId] ?? EMPTY_CONFLICTED_FILES,
  );
  const selectedFile = useMergeStore(
    (s) => s.selectedConflictFile[workspaceId] ?? null,
  );
  const conflictContentKey = selectedFile
    ? `${workspaceId}:${selectedFile}`
    : null;
  const conflictContent = useMergeStore((s) =>
    conflictContentKey
      ? (s.conflictContent[conflictContentKey] ?? null)
      : null,
  );
  const error = useMergeStore((s) => s.error[workspaceId] ?? null);
  const agentStatus = useAgentStore(
    (s) => s.agents[workspaceId]?.status ?? "Idle",
  );

  // Auto-refresh when agent finishes (for AI resolution)
  useEffect(() => {
    /* v8 ignore next -- @preserve */
    if (agentStatus === "Idle") {
      useMergeStore.getState().loadConflictedFiles(workspaceId);
    }
  }, [agentStatus, workspaceId]);

  const hasConflicts = conflictedFiles.length > 0;

  if (!hasConflicts && !selectedFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <CheckCircle
          className="h-10 w-10"
          style={{ color: "var(--success)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          No conflicts
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          All clear. Conflicts will appear here after a merge or rebase.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center gap-2">
          <AlertCircle
            className="h-3 w-3"
            style={{ color: "var(--error)" }}
          />
          <span style={{ color: "var(--text-primary)" }}>
            {conflictedFiles.length} conflicted file
            {conflictedFiles.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              useMergeStore.getState().abortMerge(workspaceId)
            }
            className="rounded px-2 py-0.5 text-[10px] transition-opacity hover:opacity-80"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--error) 15%, transparent)",
              color: "var(--error)",
            }}
          >
            Abort Merge
          </button>
          {conflictedFiles.length === 0 && (
            <button
              onClick={() =>
                useMergeStore.getState().continueMerge(workspaceId)
              }
              className="rounded px-2 py-0.5 text-[10px] transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "var(--success)",
                color: "var(--bg-primary)",
              }}
            >
              Continue Merge
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mx-3 mt-2 rounded p-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--error) 15%, transparent)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      {/* Content: file list + resolver */}
      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <div
          className="w-52 flex-shrink-0 overflow-y-auto"
          style={{
            borderRight: "1px solid var(--border)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          {conflictedFiles.map((file) => (
            <button
              key={file.path}
              onClick={() =>
                useMergeStore
                  .getState()
                  .loadConflictContent(workspaceId, file.path)
              }
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:opacity-80"
              style={{
                backgroundColor:
                  selectedFile === file.path
                    ? "var(--bg-surface)"
                    : "transparent",
                color: "var(--text-primary)",
              }}
            >
              <XCircle
                className="h-3 w-3 flex-shrink-0"
                style={{ color: "var(--error)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate">{file.path}</div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {conflictTypeLabel(file.conflictType)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Resolver */}
        <div className="flex-1">
          {conflictContent ? (
            <ConflictResolver
              workspaceId={workspaceId}
              conflict={conflictContent}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Select a file to resolve
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
