import { useEffect, useState } from "react";
import { Sparkles, X, GitFork, MessageSquare, ChevronDown } from "lucide-react";
import { listBranches } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface Props {
  repoId: string;
  repoName: string;
  onClose: () => void;
}

function generateName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)
    .replace(/-$/, "");
}

export function NewWorkspaceDialog({ repoId, repoName, onClose }: Props) {
  const { createWs } = useWorkspaceStore();

  const [taskDescription, setTaskDescription] = useState("");
  const [worktreeName, setWorktreeName] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [autoCommit, setAutoCommit] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingBranches(true);
    listBranches(repoId)
      .then((b) => {
        setBranches(b);
        if (b.length > 0) {
          // Prefer "main" or "master", otherwise first branch
          const defaultBranch =
            b.find((br) => br === "main") ??
            b.find((br) => br === "master") ??
            b[0];
          setBaseBranch(defaultBranch);
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [repoId]);

  const handleCreate = async () => {
    if (!worktreeName.trim() || !baseBranch.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const ws = await createWs({
        repoId,
        workspaceName: worktreeName.trim(),
        branchName: worktreeName.trim(),
        baseBranch: baseBranch.trim(),
        autoCommit,
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

  const canCreate = worktreeName.trim() && baseBranch.trim() && !creating;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[28rem] rounded-xl p-6"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--accent)", opacity: 0.9 }}
            >
              <Sparkles className="h-5 w-5" style={{ color: "#1e1e2e" }} />
            </div>
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                New Chat Worktree
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Create an isolated workspace for AI conversations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Repository card */}
        <div
          className="mb-4 flex items-center gap-2 rounded-lg px-4 py-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <GitFork
            className="h-4 w-4"
            style={{ color: "var(--text-muted)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Repository:
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {repoName}
          </span>
        </div>

        {/* Task description */}
        <div className="mb-4">
          <label
            className="mb-1.5 flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            What do you want to work on?
          </label>
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="e.g., Add OAuth authentication, Refactor the API layer, Fix database migrations..."
            rows={3}
            className="w-full resize-none rounded-lg px-3 py-2.5 text-xs"
            style={inputStyle}
            autoFocus
          />
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            This helps the AI understand the context and will be used to name
            your worktree
          </p>
        </div>

        {/* Worktree Name */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Worktree Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={worktreeName}
              onChange={(e) => setWorktreeName(e.target.value)}
              placeholder="feature-auth"
              className="flex-1 rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
            />
            <button
              onClick={() => {
                if (taskDescription.trim()) {
                  setWorktreeName(generateName(taskDescription));
                }
              }}
              disabled={!taskDescription.trim()}
              className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: taskDescription.trim()
                  ? "var(--accent)"
                  : "var(--bg-surface)",
                color: taskDescription.trim()
                  ? "#1e1e2e"
                  : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              Generate
            </button>
          </div>
        </div>

        {/* Base Branch */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Base Branch
          </label>
          <div className="relative">
            <select
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className="w-full appearance-none rounded-lg px-3 py-2.5 text-xs"
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
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            New worktree will be created from this branch
          </p>
        </div>

        {/* Auto-commit card */}
        <div
          className="mb-5 flex items-center justify-between rounded-lg px-4 py-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <div
              className="text-xs font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Auto-commit changes
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Automatically commit AI changes with descriptive messages
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoCommit}
            onChange={(e) => setAutoCommit(e.target.checked)}
            className="h-4 w-4 rounded"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>

        {/* Error display */}
        {error && (
          <div
            className="mb-4 rounded-lg p-3 text-xs"
            style={{
              backgroundColor: "rgba(243, 139, 168, 0.1)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors"
            style={{
              backgroundColor: canCreate ? "var(--accent)" : "var(--bg-hover)",
              color: canCreate ? "#1e1e2e" : "var(--text-muted)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {creating ? "Creating..." : "Create & Start Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
