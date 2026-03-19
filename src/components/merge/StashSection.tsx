import { useEffect, useState } from "react";
import {
  Archive,
  Plus,
  Play,
  ArrowUpFromLine,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useStashStore } from "../../stores/stashStore";

const EMPTY_STASHES: never[] = [];

interface Props {
  workspaceId: string;
}

export function StashSection({ workspaceId }: Props) {
  const stashes = useStashStore(
    (s) => s.stashes[workspaceId] ?? EMPTY_STASHES,
  );
  const loading = useStashStore((s) => s.loading[workspaceId] ?? false);
  const error = useStashStore((s) => s.error[workspaceId] ?? null);
  const selectedStash = useStashStore(
    (s) => s.selectedStash[workspaceId] ?? null,
  );
  const stashDetail = useStashStore(
    (s) => s.stashDetail[workspaceId] ?? null,
  );

  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<number | null>(null);

  useEffect(() => {
    useStashStore.getState().loadStashes(workspaceId);
  }, [workspaceId]);

  const handleCreate = async () => {
    await useStashStore
      .getState()
      .createStash(workspaceId, message || undefined, includeUntracked);
    setMessage("");
    setShowCreateForm(false);
  };

  const handleApply = (index: number) =>
    useStashStore.getState().applyStash(workspaceId, index);

  const handlePop = (index: number) =>
    useStashStore.getState().popStash(workspaceId, index);

  const handleDrop = (index: number) => {
    if (confirmDrop === index) {
      useStashStore.getState().dropStash(workspaceId, index);
      setConfirmDrop(null);
    } else {
      setConfirmDrop(index);
    }
  };

  const handleToggleDetail = (index: number) =>
    useStashStore.getState().showStash(workspaceId, index);

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    /* v8 ignore start -- @preserve */
    } catch {
      return ts;
    }
    /* v8 ignore stop */
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 rounded p-2 text-xs"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--error) 15%, transparent)",
              color: "var(--error)",
            }}
          >
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Create Stash */}
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            <Plus className="h-3 w-3" />
            Stash Changes
          </button>
        ) : (
          <div
            className="space-y-2 rounded border p-3"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Stash message (optional)"
              className="w-full rounded px-2 py-1 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowCreateForm(false);
              }}
              autoFocus
            />
            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
              />
              Include untracked files
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                {/* v8 ignore start -- loading ternary display state */}
                {loading ? "Stashing..." : "Stash"}
                {/* v8 ignore stop */}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded px-3 py-1.5 text-xs"
                style={{
                  color: "var(--text-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stash List */}
        {stashes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Archive
              className="mb-3 h-8 w-8"
              style={{ color: "var(--text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {loading ? "Loading stashes..." : "No stashes"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stashes.map((stash) => {
              const isExpanded = selectedStash === stash.index;
              const isConfirmingDrop = confirmDrop === stash.index;

              return (
                <div
                  key={stash.index}
                  className="rounded border"
                  style={{
                    borderColor: isExpanded
                      ? "var(--accent)"
                      : "var(--border)",
                    backgroundColor: "var(--bg-secondary)",
                  }}
                >
                  {/* Stash header */}
                  <button
                    onClick={() => handleToggleDetail(stash.index)}
                    className="flex w-full items-center gap-2 p-2.5 text-left text-xs"
                  >
                    {isExpanded ? (
                      <ChevronDown
                        className="h-3 w-3 flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    ) : (
                      <ChevronRight
                        className="h-3 w-3 flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {stash.index}
                        </span>
                        <span
                          className="truncate font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {stash.message || "WIP"}
                        </span>
                      </div>
                      <div
                        className="mt-0.5 flex items-center gap-2 text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {stash.branch && (
                          <span>on {stash.branch}</span>
                        )}
                        <span>{formatTimestamp(stash.timestamp)}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      className="border-t px-2.5 py-2"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {/* Actions */}
                      <div className="mb-2 flex items-center gap-1.5">
                        <button
                          onClick={() => handleApply(stash.index)}
                          disabled={loading}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-opacity disabled:opacity-50"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <Play className="h-2.5 w-2.5" />
                          Apply
                        </button>
                        <button
                          onClick={() => handlePop(stash.index)}
                          disabled={loading}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-opacity disabled:opacity-50"
                          style={{
                            backgroundColor: "var(--accent)",
                            color: "var(--bg-primary)",
                          }}
                        >
                          <ArrowUpFromLine className="h-2.5 w-2.5" />
                          Pop
                        </button>
                        <button
                          onClick={() => handleDrop(stash.index)}
                          disabled={loading}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-opacity disabled:opacity-50"
                          style={{
                            backgroundColor: isConfirmingDrop
                              ? "var(--error)"
                              : "var(--bg-surface)",
                            color: isConfirmingDrop
                              ? "var(--bg-primary)"
                              : "var(--text-muted)",
                            border: isConfirmingDrop
                              ? "none"
                              : "1px solid var(--border)",
                          }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          {isConfirmingDrop ? "Confirm Drop" : "Drop"}
                        </button>
                      </div>

                      {/* File stats */}
                      {stashDetail && stashDetail.index === stash.index ? (
                        <div className="space-y-0.5">
                          {stashDetail.files.map((file) => (
                            <div
                              key={file.path}
                              className="flex items-center gap-2 text-[11px]"
                            >
                              <FileText
                                className="h-3 w-3 flex-shrink-0"
                                style={{ color: "var(--text-muted)" }}
                              />
                              <span
                                className="min-w-0 flex-1 truncate font-mono"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {file.path}
                              </span>
                              <span style={{ color: "var(--success)" }}>
                                +{file.additions}
                              </span>
                              <span style={{ color: "var(--error)" }}>
                                -{file.deletions}
                              </span>
                            </div>
                          ))}
                          {stashDetail.files.length === 0 && (
                            <p
                              className="text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              No file changes
                            </p>
                          )}
                        </div>
                      ) : (
                        <p
                          className="text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Loading...
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
