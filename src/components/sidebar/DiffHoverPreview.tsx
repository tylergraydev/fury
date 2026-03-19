import { useEffect } from "react";
import { useDiffStore } from "../../stores/diffStore";
import type { FileDiff, FileStatus } from "../../lib/tauri";

interface Props {
  file: FileDiff;
  contextId: string;
  contextType: "workspace" | "repo";
  anchorEl: HTMLElement | null;
}

const DEBOUNCE_MS = 300;
const MAX_VISIBLE_LINES = 20;

function isUntracked(status: FileStatus): boolean {
  return status === "Untracked";
}

type LineType = "add" | "del" | "context" | "header";

function parsePatchLines(
  patch: string,
): Array<{ type: LineType; text: string }> {
  return patch.split("\n").map((line) => {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@")
    ) {
      return { type: "header" as const, text: line };
    }
    if (line.startsWith("+")) return { type: "add" as const, text: line };
    if (line.startsWith("-")) return { type: "del" as const, text: line };
    return { type: "context" as const, text: line };
  });
}

const lineColors: Record<LineType, string> = {
  add: "var(--success)",
  del: "var(--error)",
  header: "var(--accent)",
  context: "var(--text-secondary)",
};

const lineBgColors: Record<LineType, string> = {
  add: "color-mix(in srgb, var(--success) 10%, transparent)",
  del: "color-mix(in srgb, var(--error) 10%, transparent)",
  header: "transparent",
  context: "transparent",
};

export function DiffHoverPreview({
  file,
  contextId,
  contextType,
  anchorEl,
}: Props) {
  const preview = useDiffStore((s) =>
    s.getPatchPreview(contextId, file.path),
  );
  const loading = useDiffStore(
    (s) => s.patchLoading[`${contextId}:${file.path}`] ?? false,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      useDiffStore
        .getState()
        .loadPatchPreview(
          contextId,
          file.path,
          isUntracked(file.status),
          contextType,
        );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [contextId, file.path, file.status, contextType]);

  if (!anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.right + 8,
    top: rect.top,
    maxWidth: 480,
    maxHeight: 320,
    overflow: "auto",
    zIndex: 9999,
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    boxShadow: "0 4px 12px var(--overlay)",
    padding: "8px 0",
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    lineHeight: "1.4",
  };

  if (loading && !preview) {
    return (
      <div style={popoverStyle} data-testid="diff-hover-preview">
        <div style={{ padding: "8px 12px", color: "var(--text-muted)" }}>
          Loading preview...
        </div>
      </div>
    );
  }

  if (!preview || !preview.patch) {
    return (
      <div style={popoverStyle} data-testid="diff-hover-preview">
        <div style={{ padding: "8px 12px", color: "var(--text-muted)" }}>
          No diff available
        </div>
      </div>
    );
  }

  const lines = parsePatchLines(preview.patch);
  const displayLines = lines.slice(0, MAX_VISIBLE_LINES);

  return (
    <div style={popoverStyle} data-testid="diff-hover-preview">
      {/* File path header */}
      <div
        style={{
          padding: "4px 12px 6px",
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border)",
          marginBottom: 4,
          fontSize: 11,
        }}
      >
        {file.path}
        {preview.truncated && (
          <span style={{ marginLeft: 8, opacity: 0.6 }}>(truncated)</span>
        )}
      </div>
      {/* Diff lines */}
      <div style={{ padding: "0 4px" }}>
        {displayLines.map((line, i) => (
          <div
            key={i}
            style={{
              padding: "0 8px",
              color: lineColors[line.type],
              backgroundColor: lineBgColors[line.type],
              whiteSpace: "pre",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {/* v8 ignore next */ line.text || "\u00A0"}
          </div>
        ))}
        {lines.length > MAX_VISIBLE_LINES && (
          <div
            style={{
              padding: "4px 8px",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            ... {lines.length - MAX_VISIBLE_LINES} more lines (click to view
            full diff)
          </div>
        )}
      </div>
    </div>
  );
}
