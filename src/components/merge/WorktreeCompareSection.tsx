import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { Link2, GitCompare } from "lucide-react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import { useMergeStore } from "../../stores/mergeStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { getLinkedWorkspaces } from "../../lib/tauri";
import type { FileStatus } from "../../lib/tauri";

interface Props {
  workspaceId: string;
}

function statusLabel(status: FileStatus): string {
  if (status === "added") return "A";
  if (status === "modified") return "M";
  if (status === "deleted") return "D";
  if (status === "untracked") return "U";
  if (typeof status === "object" && "renamed" in status) return "R";
  return "?";
}

function statusColor(status: FileStatus): string {
  if (status === "added" || status === "untracked") return "var(--success)";
  if (status === "deleted") return "var(--error)";
  if (status === "modified") return "var(--accent)";
  if (typeof status === "object" && "renamed" in status) return "var(--accent)";
  return "var(--text-muted)";
}

export function WorktreeCompareSection({ workspaceId }: Props) {
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const comparisonTarget = useMergeStore(
    (s) => s.comparisonTarget[workspaceId] ?? null,
  );
  const comparisonDiff = useMergeStore(
    (s) => s.comparisonDiff[workspaceId] ?? null,
  );
  const selectedFile = useMergeStore(
    (s) => s.comparisonSelectedFile[workspaceId] ?? null,
  );
  const loading = useMergeStore((s) => s.loading[workspaceId] ?? false);

  // Build key for file diff lookup
  const fileDiffKey =
    comparisonTarget && selectedFile
      ? `${workspaceId}:${comparisonTarget}:${selectedFile}`
      : null;
  const fileDiff = useMergeStore((s) =>
    fileDiffKey ? (s.comparisonFileDiff[fileDiffKey] ?? null) : null,
  );

  useEffect(() => {
    setLoadingLinks(true);
    getLinkedWorkspaces(workspaceId)
      .then(setLinkedIds)
      .catch(() => setLinkedIds([]))
      .finally(() => setLoadingLinks(false));
  }, [workspaceId]);

  if (loadingLinks) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading linked workspaces...
        </p>
      </div>
    );
  }

  if (linkedIds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Link2
          className="h-10 w-10"
          style={{ color: "var(--text-muted)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No linked workspaces
        </p>
        <p
          className="max-w-xs text-center text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Link a workspace from the sidebar to compare changes between branches
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Target selector */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <GitCompare
          className="h-3 w-3"
          style={{ color: "var(--text-muted)" }}
        />
        <span style={{ color: "var(--text-muted)" }}>Compare with:</span>
        <select
          value={comparisonTarget ?? ""}
          onChange={(e) => {
            if (e.target.value) {
              useMergeStore
                .getState()
                .setComparisonTarget(workspaceId, e.target.value);
            }
          }}
          className="rounded px-2 py-0.5 text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <option value="">Select workspace...</option>
          {linkedIds.map((id) => {
            const ws = workspaces.find((w) => w.id === id);
            return (
              <option key={id} value={id}>
                {ws ? `${ws.name} (${ws.branch})` : id}
              </option>
            );
          })}
        </select>

        {comparisonDiff && (
          <>
            <span style={{ color: "var(--text-secondary)" }}>
              {comparisonDiff.files.length} file
              {comparisonDiff.files.length !== 1 ? "s" : ""} changed
            </span>
            <span style={{ color: "var(--success)" }}>
              +{comparisonDiff.totalAdditions}
            </span>
            <span style={{ color: "var(--error)" }}>
              -{comparisonDiff.totalDeletions}
            </span>
          </>
        )}
      </div>

      {/* Content */}
      {!comparisonTarget ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Select a workspace to compare
          </p>
        </div>
      ) : loading && !comparisonDiff ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading diff...
          </p>
        </div>
      ) : comparisonDiff && comparisonDiff.files.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No differences between branches
          </p>
        </div>
      ) : comparisonDiff ? (
        <div className="flex flex-1 overflow-hidden">
          {/* File list sidebar */}
          <div
            className="w-52 flex-shrink-0 overflow-y-auto"
            style={{
              borderRight: "1px solid var(--border)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            {comparisonDiff.files.map((file) => (
              <button
                key={file.path}
                onClick={() =>
                  useMergeStore
                    .getState()
                    .selectComparisonFile(workspaceId, file.path)
                }
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs transition-colors hover:opacity-80"
                style={{
                  backgroundColor:
                    selectedFile === file.path
                      ? "var(--bg-surface)"
                      : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                <span
                  className="flex-shrink-0 font-mono text-[10px] font-bold"
                  style={{ color: statusColor(file.status) }}
                >
                  {statusLabel(file.status)}
                </span>
                <span className="truncate">{file.path}</span>
                <span
                  className="ml-auto flex-shrink-0 text-[10px]"
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

          {/* Diff editor */}
          <div className="flex-1">
            {fileDiff ? (
              <DiffEditor
                original={fileDiff.original}
                modified={fileDiff.modified}
                language={fileDiff.language}
                theme={MONACO_THEME}
                beforeMount={configureMonacoTheme}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  scrollBeyondLastLine: false,
                  minimap: { enabled: false },
                  fontSize: 12,
                  automaticLayout: true,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Select a file to view diff
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
