import { useEffect, useState } from "react";
import { Sparkles, X, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface Props {
  onClose: () => void;
}

function toKebab(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)
    .replace(/-$/, "");
}

export function NewProjectDialog({ onClose }: Props) {
  const { initRepo } = useRepositoryStore();
  const { setActiveRepo } = useWorkspaceStore();

  const [name, setName] = useState("");
  const [basePath, setBasePath] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    homeDir().then((home) => {
      /* v8 ignore start -- homeDir() always returns trailing slash in Tauri mock */
      const base = home.endsWith("/") ? home : home + "/";
      /* v8 ignore stop */
      setBasePath(`${base}Code`);
    });
  }, []);

  const slug = toKebab(name);
  const fullPath = basePath ? `${basePath}/${slug}` : "";

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Location",
    });
    if (selected) {
      setBasePath(selected as string);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !fullPath) return;

    setCreating(true);
    setError(null);

    try {
      const repo = await initRepo(fullPath, name.trim());
      setActiveRepo(repo.id);
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
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[28rem] max-w-[90vw] rounded-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-label="New project"
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
              style={{ backgroundColor: "#4ade80" }}
            >
              <Sparkles className="h-5 w-5" style={{ color: "#1e1e2e" }} />
            </div>
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                New AI Project
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Create a new project with AI assistance
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

        {/* Project name */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-awesome-project"
            className="w-full rounded-lg px-3 py-2 text-xs"
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Location */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Location
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder="~/Code"
              className="flex-1 rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
            />
            <button
              onClick={handleBrowse}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors hover:opacity-80"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Browse
            </button>
          </div>
          {slug && (
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Will create: {fullPath}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "var(--error-bg)",
              color: "#ef4444",
              border: "1px solid var(--error-border)",
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs transition-colors hover:opacity-80"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "#4ade80",
              color: "#1e1e2e",
            }}
          >
            {creating ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
