import { useEffect, useState } from "react";
import { listBranches } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface Props {
  repoId: string;
  repoName: string;
  onClose: () => void;
}

export function NewWorkspaceDialog({ repoId, repoName, onClose }: Props) {
  const { createWs } = useWorkspaceStore();
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch branches on mount
  useEffect(() => {
    setLoadingBranches(true);
    listBranches(repoId)
      .then((b) => {
        setBranches(b);
        if (b.length > 0) {
          setBranch(b[0]);
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [repoId]);

  // Reset branch when switching modes
  useEffect(() => {
    if (mode === "existing" && branches.length > 0) {
      setBranch(branches[0]);
    } else if (mode === "new") {
      setBranch("");
    }
  }, [mode]);

  const handleCreate = async () => {
    if (!name.trim() || !branch.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createWs({
        repoId,
        workspaceName: name.trim(),
        branchName: branch.trim(),
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const inputStyle = {
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    outline: "none",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-96 rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        <h2
          className="mb-4 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          New Workspace
          <span
            className="ml-2 text-xs font-normal"
            style={{ color: "var(--text-muted)" }}
          >
            {repoName}
          </span>
        </h2>

        <div className="mb-3">
          <label
            className="mb-1 block text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Workspace Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-feature"
            className="w-full rounded px-2 py-1.5 text-xs"
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Branch mode toggle */}
        <div className="mb-2">
          <label
            className="mb-1 block text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Branch
          </label>
          <div className="mb-2 flex gap-1">
            <button
              onClick={() => setMode("existing")}
              className="rounded px-2 py-1 text-[10px]"
              style={{
                backgroundColor:
                  mode === "existing" ? "var(--accent)" : "var(--bg-surface)",
                color: mode === "existing" ? "#1e1e2e" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              Existing branch
            </button>
            <button
              onClick={() => setMode("new")}
              className="rounded px-2 py-1 text-[10px]"
              style={{
                backgroundColor:
                  mode === "new" ? "var(--accent)" : "var(--bg-surface)",
                color: mode === "new" ? "#1e1e2e" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              New branch
            </button>
          </div>
        </div>

        <div className="mb-4">
          {mode === "existing" ? (
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-xs"
              style={inputStyle}
              disabled={loadingBranches || branches.length === 0}
            >
              {loadingBranches ? (
                <option>Loading...</option>
              ) : branches.length === 0 ? (
                <option>No branches found</option>
              ) : (
                branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              )}
            </select>
          ) : (
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/my-feature"
              className="w-full rounded px-2 py-1.5 text-xs"
              style={inputStyle}
            />
          )}
        </div>

        {error && (
          <div
            className="mb-3 rounded p-2 text-xs"
            style={{
              backgroundColor: "rgba(243, 139, 168, 0.1)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim() || !branch.trim()}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              backgroundColor: creating ? "var(--bg-hover)" : "var(--accent)",
              color: creating ? "var(--text-muted)" : "#1e1e2e",
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
