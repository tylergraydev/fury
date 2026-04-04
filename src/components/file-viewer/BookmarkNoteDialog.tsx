import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useBookmarkStore } from "../../stores/bookmarkStore";

const COLORS = [
  { name: "blue", css: "var(--accent)" },
  { name: "green", css: "var(--success)" },
  { name: "yellow", css: "var(--warning)" },
  { name: "red", css: "var(--error)" },
  { name: "purple", css: "var(--accent-purple)" },
];

export function BookmarkNoteDialog() {
  const editing = useBookmarkStore((s) => s.editingBookmark);
  const [note, setNote] = useState("");
  const [color, setColor] = useState("blue");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setNote(editing.existing?.note ?? "");
      setColor(editing.existing?.color ?? "blue");
      // Focus the input after a brief delay so the dialog has rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editing]);

  const handleClose = useCallback(() => {
    useBookmarkStore.getState().setEditingBookmark(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    const store = useBookmarkStore.getState();
    if (editing.existing) {
      await store.editBookmark(editing.repoId, editing.existing.id, {
        note,
        color,
        lineNumber: editing.lineNumber,
      });
    } else {
      await store.addBookmark({
        repoId: editing.repoId,
        filePath: editing.filePath,
        lineNumber: editing.lineNumber,
        note: note || null,
        color,
      });
    }
    handleClose();
  }, [editing, note, color, handleClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleClose();
      }
    },
    [handleSave, handleClose],
  );

  if (!editing) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative z-50 w-80 rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {editing.existing ? "Edit Bookmark" : "Add Bookmark"}
          </span>
          <button
            onClick={handleClose}
            className="rounded p-1 hover:bg-[var(--bg-hover)]"
          >
            <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {editing.filePath.split("/").pop()} : Line {editing.lineNumber}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note..."
          className="mb-3 w-full rounded px-3 py-2 text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />

        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Color:
          </span>
          {COLORS.map((c) => (
            <button
              key={c.name}
              onClick={() => setColor(c.name)}
              className="h-5 w-5 rounded-full transition-transform"
              style={{
                backgroundColor: c.css,
                border:
                  color === c.name
                    ? "2px solid var(--text-primary)"
                    : "2px solid transparent",
                transform: color === c.name ? "scale(1.2)" : "scale(1)",
              }}
              title={c.name}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded px-3 py-1.5 text-xs transition-colors"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
