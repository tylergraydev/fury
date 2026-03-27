import { useState } from "react";
import { useWorkItemStore } from "../../stores/workItemStore";

const WORK_ITEM_TYPES = ["Bug", "Task", "User Story", "Feature", "Epic"] as const;

interface Props {
  workspaceId: string;
  onClose: () => void;
}

export function CreateWorkItemForm({ workspaceId, onClose }: Props) {
  const [type, setType] = useState<string>("Task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await useWorkItemStore.getState().createWorkItem({
        workspaceId,
        workItemType: type,
        title: title.trim(),
        description: description.trim() || null,
        tags: [],
      });
      onClose();
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  };

  return (
    <div
      className="space-y-2 px-3 py-2"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Type picker */}
      <div className="flex items-center gap-2">
        <label className="text-[9px]" style={{ color: "var(--text-muted)" }}>
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="flex-1 rounded px-1.5 py-0.5 text-[10px] outline-none"
          style={{
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          {WORK_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (required)"
        className="w-full rounded px-2 py-1 text-[10px] outline-none placeholder:text-[var(--text-muted)]"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            handleCreate().catch((err) => console.error("[CreateWorkItemForm]", err));
          }
          if (e.key === "Escape") onClose();
        }}
        autoFocus
      />

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full resize-none rounded px-2 py-1 text-[10px] outline-none placeholder:text-[var(--text-muted)]"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      />

      {/* Error */}
      {error && (
        <div
          className="rounded p-1.5 text-[10px]"
          style={{
            backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={onClose}
          disabled={creating}
          className="rounded px-2 py-0.5 text-[10px] disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-secondary)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={() =>
            handleCreate().catch((err) => console.error("[CreateWorkItemForm]", err))
          }
          disabled={creating || !title.trim()}
          className="rounded px-2 py-0.5 text-[10px] disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}
