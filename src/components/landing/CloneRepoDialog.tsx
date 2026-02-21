import { useState } from "react";
import { GitPullRequestArrow, X, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { useRepositoryStore } from "../../stores/repositoryStore";

interface Props {
  onClose: () => void;
}

function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git\/?$/, "").replace(/\/$/, "");
  const last = cleaned.split("/").pop() ?? "";
  return last || "repo";
}

export function CloneRepoDialog({ onClose }: Props) {
  const { cloneRepo } = useRepositoryStore();

  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedName = repoNameFromUrl(url);

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Clone Destination",
    });
    if (selected) {
      setPath(selected as string);
    }
  };

  const handleClone = async () => {
    if (!url.trim()) return;

    setCloning(true);
    setError(null);

    try {
      let dest = path.trim();
      if (!dest) {
        const home = await homeDir();
        dest = `${home}Code/${derivedName}`;
      }

      await cloneRepo(url.trim(), dest);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCloning(false);
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
              style={{ backgroundColor: "#a78bfa" }}
            >
              <GitPullRequestArrow
                className="h-5 w-5"
                style={{ color: "#1e1e2e" }}
              />
            </div>
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Clone Repository
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Clone a repository from a Git URL
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

        {/* Git URL */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Repository URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="w-full rounded-lg px-3 py-2 text-xs"
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Destination path */}
        <div className="mb-4">
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Clone to
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={`~/Code/${derivedName}`}
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
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
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
            onClick={handleClone}
            disabled={!url.trim() || cloning}
            className="rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "#a78bfa",
              color: "#1e1e2e",
            }}
          >
            {cloning ? "Cloning..." : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
}
