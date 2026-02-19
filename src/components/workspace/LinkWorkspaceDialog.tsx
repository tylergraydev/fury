import { useEffect, useState } from "react";
import {
  getLinkedWorkspaces,
  linkWorkspaces,
  unlinkWorkspaces,
} from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";

interface LinkWorkspaceDialogProps {
  workspaceId: string;
  workspaceName: string;
  repoId: string;
  onClose: () => void;
}

export function LinkWorkspaceDialog({
  workspaceId,
  workspaceName,
  repoId,
  onClose,
}: LinkWorkspaceDialogProps) {
  const { workspaces } = useWorkspaceStore();
  const { repositories } = useRepositoryStore();
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getLinkedWorkspaces(workspaceId)
      .then(setLinkedIds)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleLink = async (targetId: string) => {
    setError(null);
    try {
      await linkWorkspaces(workspaceId, targetId);
      setLinkedIds((prev) => [...prev, targetId]);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleUnlink = async (targetId: string) => {
    setError(null);
    try {
      await unlinkWorkspaces(workspaceId, targetId);
      setLinkedIds((prev) => prev.filter((id) => id !== targetId));
    } catch (e) {
      setError(String(e));
    }
  };

  // Group available workspaces by repo (exclude current workspace's repo)
  const otherWorkspaces = workspaces.filter(
    (ws) => ws.id !== workspaceId && ws.repoId !== repoId,
  );

  const grouped = new Map<string, typeof otherWorkspaces>();
  for (const ws of otherWorkspaces) {
    const list = grouped.get(ws.repoId) ?? [];
    list.push(ws);
    grouped.set(ws.repoId, list);
  }

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
          className="mb-1 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Link Workspaces
        </h2>
        <div
          className="mb-3 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Link other repo workspaces to{" "}
          <span style={{ color: "var(--accent)" }}>{workspaceName}</span> so
          Claude can access them via --add-dir.
        </div>

        {error && (
          <div
            className="mb-2 rounded p-2 text-xs"
            style={{
              backgroundColor: "rgba(243, 139, 168, 0.1)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : grouped.size === 0 ? (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            No workspaces from other repos available to link.
          </div>
        ) : (
          <div className="max-h-60 space-y-3 overflow-y-auto">
            {Array.from(grouped.entries()).map(([rId, wsList]) => {
              const repo = repositories.find((r) => r.id === rId);
              return (
                <div key={rId}>
                  <div
                    className="mb-1 text-[10px] font-medium uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {repo?.name ?? rId}
                  </div>
                  {wsList.map((ws) => {
                    const isLinked = linkedIds.includes(ws.id);
                    return (
                      <div
                        key={ws.id}
                        className="flex items-center justify-between rounded px-2 py-1"
                        style={{
                          backgroundColor: isLinked
                            ? "rgba(166, 227, 161, 0.1)"
                            : "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          marginBottom: 2,
                        }}
                      >
                        <div>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {ws.name}
                          </span>
                          <span
                            className="ml-2 text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {ws.branch}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            isLinked
                              ? handleUnlink(ws.id)
                              : handleLink(ws.id)
                          }
                          className="rounded px-2 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: isLinked
                              ? "transparent"
                              : "var(--accent)",
                            color: isLinked
                              ? "var(--error)"
                              : "var(--bg-primary)",
                            border: isLinked
                              ? "1px solid var(--error)"
                              : "none",
                          }}
                        >
                          {isLinked ? "Unlink" : "Link"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
