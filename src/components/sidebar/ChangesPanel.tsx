import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { MONACO_THEME, configureMonacoTheme } from "../../lib/monacoTheme";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";
import type { FileStatus } from "../../lib/tauri";
import type { SidebarContext } from "../../App";

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

export function ChangesPanel({ context }: Props) {
  const contextId = context.id;
  const diffResult = useDiffStore(
    (s) => s.diffResults[contextId] ?? null,
  );
  const selectedFile = useDiffStore(
    (s) => s.selectedFile[contextId] ?? null,
  );
  const fileDiffKey = selectedFile
    ? `${contextId}:${selectedFile}`
    : null;
  const fileDiff = useDiffStore((s) =>
    fileDiffKey ? (s.fileDiffs[fileDiffKey] ?? null) : null,
  );
  const loading = useDiffStore((s) => s.loading[contextId] ?? false);
  const error = useDiffStore((s) => s.error[contextId] ?? null);
  const agentStatus = useAgentStore(
    (s) => s.agents[contextId]?.status ?? "Idle",
  );
  const [showDiffModal, setShowDiffModal] = useState(false);

  useEffect(() => {
    const store = useDiffStore.getState();
    if (context.type === "workspace") {
      store.loadDiff(contextId);
    } else {
      store.loadRepoDiff(contextId);
    }
  }, [context.type, contextId]);

  // Auto-refresh when agent finishes
  useEffect(() => {
    if (agentStatus === "Idle") {
      const store = useDiffStore.getState();
      if (context.type === "workspace") {
        store.refresh(contextId);
      } else {
        store.refreshRepo(contextId);
      }
    }
  }, [agentStatus, context.type, contextId]);

  const handleFileClick = (filePath: string) => {
    const store = useDiffStore.getState();
    if (context.type === "workspace") {
      store.selectFile(contextId, filePath);
    } else {
      store.selectRepoFile(contextId, filePath);
    }
    setShowDiffModal(true);
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
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Loading changes...
      </div>
    );
  }

  if (error && !diffResult) {
    return (
      <div className="p-3 text-xs" style={{ color: "var(--error)" }}>
        {error}
      </div>
    );
  }

  if (!diffResult || diffResult.files.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        No changes
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Summary */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[10px]"
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
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
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
              className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs hover:bg-[var(--bg-hover)]"
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
              <span className="truncate">
                {file.path.split("/").pop()}
              </span>
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
      </div>

      {/* Diff modal overlay */}
      {showDiffModal && fileDiff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowDiffModal(false)}
        >
          <div
            className="flex h-[80vh] w-[85vw] flex-col overflow-hidden rounded-lg"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-2 text-xs"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--text-primary)" }}>
                {selectedFile}
              </span>
              <button
                onClick={() => setShowDiffModal(false)}
                className="rounded px-2 py-0.5 hover:opacity-80"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                }}
              >
                Close
              </button>
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
          </div>
        </div>
      )}
    </>
  );
}
