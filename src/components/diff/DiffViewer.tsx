import { useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";
import type { FileStatus } from "../../lib/tauri";

interface Props {
  workspaceId: string;
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

export function DiffViewer({ workspaceId }: Props) {
  const diffResult = useDiffStore(
    (s) => s.diffResults[workspaceId] ?? null,
  );
  const selectedFile = useDiffStore(
    (s) => s.selectedFile[workspaceId] ?? null,
  );
  const fileDiffKey = selectedFile
    ? `${workspaceId}:${selectedFile}`
    : null;
  const fileDiff = useDiffStore((s) =>
    fileDiffKey ? (s.fileDiffs[fileDiffKey] ?? null) : null,
  );
  const loading = useDiffStore((s) => s.loading[workspaceId] ?? false);
  const agentStatus = useAgentStore(
    (s) => s.agents[workspaceId]?.status ?? "Idle",
  );

  useEffect(() => {
    useDiffStore.getState().loadDiff(workspaceId);
  }, [workspaceId]);

  // Auto-refresh when agent finishes
  useEffect(() => {
    if (agentStatus === "Idle") {
      useDiffStore.getState().refresh(workspaceId);
    }
  }, [agentStatus, workspaceId]);

  if (loading && !diffResult) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading diff...
        </p>
      </div>
    );
  }

  if (!diffResult || diffResult.files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No changes
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--text-secondary)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <span>
          {diffResult.files.length} file
          {diffResult.files.length !== 1 ? "s" : ""} changed
        </span>
        <span style={{ color: "var(--success)" }}>
          +{diffResult.totalAdditions}
        </span>
        <span style={{ color: "var(--error)" }}>
          -{diffResult.totalDeletions}
        </span>
        <button
          onClick={() => useDiffStore.getState().refresh(workspaceId)}
          className="ml-auto rounded px-2 py-0.5 text-[10px] transition-colors hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File list sidebar */}
        <div
          className="w-52 flex-shrink-0 overflow-y-auto"
          style={{
            borderRight: "1px solid var(--border)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          {diffResult.files.map((file) => (
            <button
              key={file.path}
              onClick={() => useDiffStore.getState().selectFile(workspaceId, file.path)}
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
    </div>
  );
}
