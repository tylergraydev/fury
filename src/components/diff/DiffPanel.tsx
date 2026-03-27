import { useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import { useDiffStore } from "../../stores/diffStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { FileStatus } from "../../lib/tauri";

interface Props {
  contextId: string;
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

export function DiffPanel({ contextId }: Props) {
  const selectedFile = useDiffStore(
    (s) => s.selectedFile[contextId] ?? null,
  );
  const fileDiffKey = selectedFile
    ? `${contextId}:${selectedFile}`
    : null;
  const fileDiff = useDiffStore((s) =>
    fileDiffKey ? (s.fileDiffs[fileDiffKey] ?? null) : null,
  );
  const diffResult = useDiffStore((s) => s.diffResults[contextId] ?? null);
  const contextType = useWorkspaceStore((s) =>
    s.activeWorkspaceId === contextId ? "workspace" : "repo",
  );

  // Load diff on mount if not already loaded
  useEffect(() => {
    const store = useDiffStore.getState();
    if (store.diffResults[contextId] !== undefined) return;
    if (contextType === "workspace") {
      store.loadDiff(contextId);
    } else {
      store.loadRepoDiff(contextId);
    }
  }, [contextId, contextType]);

  const handleFileSelect = (filePath: string) => {
    const store = useDiffStore.getState();
    if (contextType === "workspace") {
      store.selectFile(contextId, filePath);
    } else {
      store.selectRepoFile(contextId, filePath);
    }
  };

  const files = diffResult?.files ?? [];

  return (
    <div className="flex h-full">
      {/* File list sidebar */}
      <div
        className="flex w-56 flex-shrink-0 flex-col overflow-y-auto border-r"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)" }}
      >
        <div
          className="px-3 py-2 text-xs font-medium"
          style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
        >
          Changed files {files.length > 0 && `(${files.length})`}
        </div>
        {files.length === 0 && (
          <div
            className="px-3 py-4 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No changes detected
          </div>
        )}
        {files.map((file) => {
          const fileName = file.path.split("/").pop()!;
          const isSelected = selectedFile === file.path;
          return (
            <button
              key={file.path}
              onClick={() => handleFileSelect(file.path)}
              className="flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                backgroundColor: isSelected ? "var(--bg-surface)" : undefined,
                color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
              }}
              title={file.path}
            >
              <span
                className="flex-shrink-0 text-[10px] font-bold"
                style={{ color: statusColor(file.status) }}
              >
                {statusLabel(file.status)}
              </span>
              <span className="min-w-0 truncate">{fileName}</span>
              {(file.additions > 0 || file.deletions > 0) && (
                <span className="ml-auto flex-shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {file.additions > 0 && (
                    <span style={{ color: "var(--success)" }}>+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span style={{ color: "var(--error)" }}>{file.additions > 0 ? " " : ""}-{file.deletions}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Diff editor */}
      <div className="flex flex-1 flex-col">
        {!selectedFile || !fileDiff ? (
          <div
            className="flex h-full items-center justify-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {files.length > 0
              ? "Select a file to view its diff"
              : "No changes to display"}
          </div>
        ) : (
          <>
            <div
              className="flex items-center px-4 py-2 text-xs"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--text-primary)" }}>{selectedFile}</span>
            </div>
            <div className="flex-1">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
