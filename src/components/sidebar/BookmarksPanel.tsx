import { useCallback, useEffect, useMemo } from "react";
import { Bookmark, Trash2, Pencil } from "lucide-react";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import type { SidebarContext } from "../../App";
import type { FileBookmark } from "../../lib/tauri";

interface Props {
  context: SidebarContext;
}

// Stable empty array to avoid infinite re-renders from Zustand selectors.
// `s.bookmarks[id] ?? []` creates a new reference each render, which
// Object.is treats as changed, triggering another render in a loop.
const EMPTY_BOOKMARKS: FileBookmark[] = [];

function bookmarkColorDot(color: string | null) {
  const colorMap: Record<string, string> = {
    blue: "var(--accent)",
    green: "var(--success)",
    yellow: "var(--warning)",
    red: "var(--error)",
    purple: "var(--accent-purple)",
  };
  return colorMap[color ?? "blue"] ?? "var(--accent)";
}

export function BookmarksPanel({ context }: Props) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const repoId = useMemo(() => {
    if (context.type === "repo") return context.id;
    const ws = workspaces.find((w) => w.id === context.id);
    return ws?.repoId ?? null;
  }, [context, workspaces]);

  const bookmarks = useBookmarkStore((s) =>
    repoId ? (s.bookmarks[repoId] ?? EMPTY_BOOKMARKS) : EMPTY_BOOKMARKS,
  );
  const loading = useBookmarkStore((s) =>
    repoId ? (s.loading[repoId] ?? false) : false,
  );

  useEffect(() => {
    if (!repoId) return;
    const id = requestAnimationFrame(() => {
      useBookmarkStore.getState().loadBookmarks(repoId);
    });
    return () => cancelAnimationFrame(id);
  }, [repoId]);

  const grouped = useMemo(() => {
    const groups: Record<string, FileBookmark[]> = {};
    for (const bm of bookmarks) {
      if (!groups[bm.filePath]) groups[bm.filePath] = [];
      groups[bm.filePath].push(bm);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([filePath, bms]) => ({
        filePath,
        fileName: filePath.split("/").pop() || filePath,
        bookmarks: bms.sort((a, b) => a.lineNumber - b.lineNumber),
      }));
  }, [bookmarks]);

  const handleBookmarkClick = useCallback(
    (bm: FileBookmark) => {
      const fvStore = useFileViewerStore.getState();
      const tabId = `${context.id}:${bm.filePath}`;
      fvStore.openFile(context.id, context.type, bm.filePath, true);
      // Set reveal line — will be consumed by FileViewerPanel
      fvStore.setRevealLine(tabId, bm.lineNumber);
      useUIStore.getState().setActiveViewTab("chat");
    },
    [context],
  );

  const handleDelete = useCallback(
    (bm: FileBookmark) => {
      if (repoId) {
        useBookmarkStore.getState().removeBookmark(repoId, bm.id);
      }
    },
    [repoId],
  );

  const handleEdit = useCallback(
    (bm: FileBookmark) => {
      if (repoId) {
        useBookmarkStore.getState().setEditingBookmark({
          repoId,
          filePath: bm.filePath,
          lineNumber: bm.lineNumber,
          existing: bm,
        });
      }
    },
    [repoId],
  );

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Loading bookmarks...
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <Bookmark
          className="h-8 w-8"
          style={{ color: "var(--text-muted)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No bookmarks yet
        </p>
        <p
          className="text-sm"
          style={{ color: "var(--text-muted)", opacity: 0.7 }}
        >
          Click the gutter margin in the editor to add a bookmark
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {grouped.map((group) => (
        <div key={group.filePath}>
          <div
            className="sticky top-0 flex items-center gap-1 px-4 py-2 text-sm font-medium"
            style={{
              color: "var(--text-secondary)",
              backgroundColor: "var(--bg-secondary)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span className="truncate" title={group.filePath}>
              {group.fileName}
            </span>
            <span
              className="ml-auto flex-shrink-0 rounded px-1.5 py-0.5"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              {group.bookmarks.length}
            </span>
          </div>
          {group.bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="group flex cursor-pointer items-center gap-2 px-4 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
              onClick={() => handleBookmarkClick(bm)}
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: bookmarkColorDot(bm.color) }}
              />
              <span
                className="flex-shrink-0 text-sm tabular-nums"
                style={{ color: "var(--text-muted)", minWidth: "2rem" }}
              >
                L{bm.lineNumber}
              </span>
              <span
                className="flex-1 truncate text-sm"
                style={{
                  color: bm.note
                    ? "var(--text-secondary)"
                    : "var(--text-muted)",
                  fontStyle: bm.note ? "normal" : "italic",
                }}
              >
                {bm.note || "No note"}
              </span>
              <div className="flex flex-shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(bm);
                  }}
                  className="rounded p-0.5 hover:bg-[var(--bg-surface)]"
                  title="Edit bookmark"
                >
                  <Pencil
                    className="h-3 w-3"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(bm);
                  }}
                  className="rounded p-0.5 hover:bg-[var(--bg-surface)]"
                  title="Delete bookmark"
                >
                  <Trash2
                    className="h-3 w-3"
                    style={{ color: "var(--error)" }}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
