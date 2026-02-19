import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { NewWorkspaceDialog } from "../workspace/NewWorkspaceDialog";
import { RepoSettingsPanel } from "../settings/RepoSettingsPanel";
import { LinkWorkspaceDialog } from "../workspace/LinkWorkspaceDialog";
import type { WorkspaceInfo } from "../../lib/tauri";

export function Sidebar() {
  const { repositories, loadRepositories, addRepo } = useRepositoryStore();
  const {
    workspaces,
    archivedWorkspaces,
    activeWorkspaceId,
    activeRepoId,
    setActive,
    setActiveRepo,
    loadWorkspaces,
    loadArchivedWorkspaces,
    restoreWs,
    renameWs,
  } = useWorkspaceStore();
  const [newWsRepoId, setNewWsRepoId] = useState<string | null>(null);
  const [settingsRepoId, setSettingsRepoId] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [linkWs, setLinkWs] = useState<{
    id: string;
    name: string;
    repoId: string;
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRepositories();
    loadWorkspaces();
  }, [loadRepositories, loadWorkspaces]);

  useEffect(() => {
    if (showArchived) {
      loadArchivedWorkspaces();
    }
  }, [showArchived, loadArchivedWorkspaces]);

  const handleAddRepo = async () => {
    setRepoError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a Git Repository",
    });
    if (selected) {
      try {
        await addRepo(selected as string);
      } catch (e) {
        setRepoError(String(e));
      }
    }
  };

  const toggleRepo = (repoId: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
          All repos
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAddRepo}
            className="rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="Add repository"
          >
            +
          </button>
        </div>
      </div>

      {/* Error banner */}
      {repoError && (
        <div
          className="flex items-start gap-2 px-3 py-1.5 text-[10px]"
          style={{
            backgroundColor: "rgba(243, 139, 168, 0.1)",
            borderBottom: "1px solid var(--border)",
            color: "var(--error)",
          }}
        >
          <span className="flex-1">{repoError}</span>
          <button
            onClick={() => setRepoError(null)}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            x
          </button>
        </div>
      )}

      {/* Repository and workspace list */}
      <div className="flex-1 overflow-y-auto">
        {repositories.length === 0 ? (
          <div
            className="p-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No repositories added yet.
          </div>
        ) : (
          repositories.map((repo) => {
            const repoWorkspaces = workspaces.filter(
              (ws) => ws.repoId === repo.id,
            );
            const isCollapsed = collapsedRepos.has(repo.id);

            return (
              <div key={repo.id}>
                {/* Repo header */}
                <button
                  onClick={() => toggleRepo(repo.id)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span
                    className="text-[8px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {isCollapsed ? "\u25B6" : "\u25BC"}
                  </span>
                  <span className="flex-1 truncate font-medium">
                    {repo.name}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {repoWorkspaces.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsRepoId(repo.id);
                    }}
                    className="rounded px-0.5 hover:bg-[var(--bg-surface)]"
                    style={{ color: "var(--text-muted)" }}
                    title="Settings"
                  >
                    &#9881;
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewWsRepoId(repo.id);
                    }}
                    className="rounded px-0.5 hover:bg-[var(--bg-surface)]"
                    style={{ color: "var(--text-muted)" }}
                    title="New workspace"
                  >
                    +
                  </button>
                </button>

                {!isCollapsed && (
                  <>
                    {/* Base repo branch */}
                    <RepoBranchItem
                      repoId={repo.id}
                      branch={repo.currentBranch ?? repo.defaultBranch}
                      isActive={
                        activeRepoId === repo.id && !activeWorkspaceId
                      }
                      onClick={() => setActiveRepo(repo.id)}
                    />

                    {/* Workspaces */}
                    {repoWorkspaces.map((ws) => (
                      <WorkspaceItem
                        key={ws.id}
                        id={ws.id}
                        name={ws.name}
                        branch={ws.branch}
                        wsStatus={ws.status}
                        isActive={activeWorkspaceId === ws.id}
                        onClick={() => setActive(ws.id)}
                        onLink={() =>
                          setLinkWs({
                            id: ws.id,
                            name: ws.name,
                            repoId: repo.id,
                          })
                        }
                        onRename={(newName) => renameWs(ws.id, newName)}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Archived section */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="flex w-full items-center justify-between px-3 py-1 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>
            Archived
            {archivedWorkspaces.length > 0
              ? ` (${archivedWorkspaces.length})`
              : ""}
          </span>
          <span>{showArchived ? "\u25BC" : "\u25B6"}</span>
        </button>
        {showArchived &&
          archivedWorkspaces.map((ws) => (
            <ArchivedWorkspaceItem
              key={ws.id}
              workspace={ws}
              onRestore={restoreWs}
            />
          ))}
        {showArchived && archivedWorkspaces.length === 0 && (
          <div
            className="px-4 py-1 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            No archived workspaces
          </div>
        )}
      </div>

      {/* Bottom: Add repository */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          onClick={handleAddRepo}
          className="flex w-full items-center gap-1.5 rounded py-1 text-xs transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>+</span>
          <span>Add repository</span>
        </button>
      </div>

      {/* Dialogs */}
      {newWsRepoId && (
        <NewWorkspaceDialog
          repoId={newWsRepoId}
          repoName={
            repositories.find((r) => r.id === newWsRepoId)?.name ?? ""
          }
          onClose={() => setNewWsRepoId(null)}
        />
      )}

      {settingsRepoId && (
        <RepoSettingsPanel
          repoId={settingsRepoId}
          repoName={
            repositories.find((r) => r.id === settingsRepoId)?.name ?? ""
          }
          onClose={() => setSettingsRepoId(null)}
        />
      )}

      {linkWs && (
        <LinkWorkspaceDialog
          workspaceId={linkWs.id}
          workspaceName={linkWs.name}
          repoId={linkWs.repoId}
          onClose={() => setLinkWs(null)}
        />
      )}
    </div>
  );
}

function RepoBranchItem({
  repoId,
  branch,
  isActive,
  onClick,
}: {
  repoId: string;
  branch: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const agentStatus = useAgentStore((s) => s.getStatus(repoId));
  const isRunning = agentStatus === "Running";
  const isAgentError =
    typeof agentStatus === "object" && "Error" in agentStatus;

  const dotColor = isRunning
    ? "var(--success)"
    : isAgentError
      ? "var(--error)"
      : "var(--text-muted)";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 py-1 pl-7 pr-3 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "transparent",
        color: "var(--text-primary)",
      }}
    >
      <span
        className={`flex-shrink-0 text-[8px] leading-none ${isRunning ? "animate-pulse" : ""}`}
        style={{ color: dotColor }}
      >
        &#9670;
      </span>
      <span
        className="truncate text-[10px] italic"
        style={{ color: "var(--text-muted)" }}
        title="Base repository"
      >
        {branch}
      </span>
    </button>
  );
}

function WorkspaceItem({
  id,
  name,
  branch,
  wsStatus,
  isActive,
  onClick,
  onLink,
  onRename,
}: {
  id: string;
  name: string;
  branch: string;
  wsStatus: string | { Error: string };
  isActive: boolean;
  onClick: () => void;
  onLink: () => void;
  onRename: (newName: string) => void;
}) {
  const agentStatus = useAgentStore((s) => s.getStatus(id));
  const isRunning = agentStatus === "Running";
  const isAgentError =
    typeof agentStatus === "object" && "Error" in agentStatus;
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  const dotColor = isRunning
    ? "var(--success)"
    : isAgentError
      ? "var(--error)"
      : wsStatus === "Active"
        ? "var(--success)"
        : "var(--text-muted)";

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(name);
    setEditing(true);
  };

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      className="group flex w-full items-center gap-2 py-1 pl-7 pr-3 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "transparent",
        color: "var(--text-primary)",
      }}
    >
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        {editing ? (
          <input
            className="min-w-0 flex-1 rounded border-none bg-[var(--bg-primary)] px-1 text-xs outline-none"
            style={{ color: "var(--text-primary)" }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <>
            <span className="truncate" onDoubleClick={handleDoubleClick}>
              {name}
            </span>
            <span
              className="ml-auto truncate text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              {branch}
            </span>
          </>
        )}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLink();
        }}
        className="hidden flex-shrink-0 rounded px-1 text-[10px] group-hover:block hover:bg-[var(--bg-surface)]"
        style={{ color: "var(--text-muted)" }}
        title="Link workspaces"
      >
        &#8660;
      </button>
    </div>
  );
}

function ArchivedWorkspaceItem({
  workspace,
  onRestore,
}: {
  workspace: WorkspaceInfo;
  onRestore: (id: string) => Promise<void>;
}) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await onRestore(workspace.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="group flex items-center gap-2 py-1 pl-7 pr-3 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: "var(--text-muted)", opacity: 0.4 }}
      />
      <span
        className="flex-1 truncate"
        style={{ textDecoration: "line-through", opacity: 0.7 }}
        title={error ?? undefined}
      >
        {workspace.name}
      </span>
      <button
        onClick={handleRestore}
        disabled={restoring}
        className="hidden flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] group-hover:block"
        style={{ color: error ? "var(--error)" : "var(--accent)" }}
      >
        {restoring ? "..." : error ? "Failed" : "Restore"}
      </button>
    </div>
  );
}
