import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Settings,
  GitBranch,
  Link2,
  FolderGit2,
  Archive,
  Pin,
  RotateCcw,
  Clock,
} from "lucide-react";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { NewWorkspaceDialog } from "../workspace/NewWorkspaceDialog";
import { RepoSettingsPanel } from "../settings/RepoSettingsPanel";
import { LinkWorkspaceDialog } from "../workspace/LinkWorkspaceDialog";
import { useUIStore } from "../../stores/uiStore";
import { isMac } from "../../lib/keybindings";
import type { WorkspaceInfo } from "../../lib/tauri";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function Sidebar() {
  const repositories = useRepositoryStore((s) => s.repositories);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const archivedWorkspaces = useWorkspaceStore((s) => s.archivedWorkspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeRepoId = useWorkspaceStore((s) => s.activeRepoId);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const setActiveRepo = useWorkspaceStore((s) => s.setActiveRepo);
  const loadArchivedWorkspaces = useWorkspaceStore((s) => s.loadArchivedWorkspaces);
  const restoreWs = useWorkspaceStore((s) => s.restoreWs);
  const renameWs = useWorkspaceStore((s) => s.renameWs);
  const archiveWs = useWorkspaceStore((s) => s.archiveWs);
  const pinWs = useWorkspaceStore((s) => s.pinWs);
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
    if (showArchived) {
      loadArchivedWorkspaces();
    }
  }, [showArchived, loadArchivedWorkspaces]);

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
      {/* Header — draggable region, extra top padding on Mac for traffic light buttons */}
      <div
        data-tauri-drag-region
        className="px-5 pb-3"
        style={{
          borderBottom: "1px solid var(--border)",
          /* v8 ignore next -- @preserve */
          paddingTop: isMac ? 42 : 10,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            <FolderGit2 className="h-4 w-4" />
            Worktrees
          </span>
          <button
            onClick={() => {
              if (repositories.length > 0) setNewWsRepoId(repositories[0].id);
            }}
            className="rounded-md p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="New worktree"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {repoError && (
        <div
          className="flex items-start gap-2 px-4 py-2 text-xs"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.1)",
            borderBottom: "1px solid var(--border)",
            color: "var(--error)",
          }}
        >
          <span className="flex-1">{repoError}</span>
          <button
            onClick={() => setRepoError(null)}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Repository and workspace list */}
      <div className="flex-1 overflow-y-auto">
        {repositories.length === 0 ? (
          <div
            className="p-4 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            No repositories added yet.
          </div>
        ) : (
          repositories.map((repo) => {
            const repoWorkspaces = workspaces
              .filter((ws) => ws.repoId === repo.id)
              .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
            const isCollapsed = collapsedRepos.has(repo.id);

            return (
              <div key={repo.id}>
                {/* Repo subtitle */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRepo(repo.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleRepo(repo.id); }}
                  className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-xs cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span className="flex-1 truncate">
                    Repository: <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{repo.name}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsRepoId(repo.id);
                    }}
                    className="rounded p-1 transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-muted)" }}
                    title="Settings"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>

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
                        createdAt={ws.createdAt}
                        wsStatus={ws.status}
                        pinned={ws.pinned}
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
                        onTogglePin={() => pinWs(ws.id, !ws.pinned)}
                        onArchive={async () => {
                          try {
                            await archiveWs(ws.id);
                          } catch (e) {
                            setRepoError(`Failed to archive "${ws.name}": ${String(e)}`);
                          }
                        }}
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
          className="flex w-full items-center justify-between px-5 py-2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="flex items-center gap-1.5">
            <Archive className="h-3 w-3" />
            Archived
            {archivedWorkspaces.length > 0
              ? ` (${archivedWorkspaces.length})`
              : ""}
          </span>
          {showArchived ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
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
            className="px-5 py-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No archived workspaces
          </div>
        )}
      </div>

      {/* Bottom: New worktree + settings */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (repositories.length > 0) setNewWsRepoId(repositories[0].id);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--accent-green)",
              color: "#000000",
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New Chat Worktree</span>
          </button>
          <button
            onClick={() => useUIStore.getState().openViewTab("settings", true)}
            className="flex-shrink-0 rounded-lg p-2 text-sm transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
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
    <div
      onClick={onClick}
      className="group mx-3 my-1.5 cursor-pointer rounded-lg px-4 py-3.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "transparent",
        border: isActive
          ? "1px solid var(--accent)"
          : "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      {/* Row 1: status dot + name */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        <span className="truncate font-semibold">{branch}</span>
      </div>

      {/* Row 2: branch */}
      <div
        className="mt-1.5 flex items-center gap-1.5 pl-[18px] text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <GitBranch className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{branch}</span>
      </div>
    </div>
  );
}

function WorkspaceItem({
  id,
  name,
  branch,
  createdAt,
  wsStatus,
  pinned,
  isActive,
  onClick,
  onLink,
  onRename,
  onTogglePin,
  onArchive,
}: {
  id: string;
  name: string;
  branch: string;
  createdAt: string;
  wsStatus: string | { Error: string };
  pinned: boolean;
  isActive: boolean;
  onClick: () => void;
  onLink: () => void;
  onRename: (newName: string) => void;
  onTogglePin: () => void;
  onArchive: () => void;
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
      onClick={onClick}
      className="group mx-3 my-1.5 cursor-pointer rounded-lg px-4 py-3.5 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "transparent",
        border: isActive
          ? "1px solid var(--accent)"
          : "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      {/* Row 1: status dot + name */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        {editing ? (
          <input
            className="min-w-0 flex-1 rounded border-none bg-[var(--bg-primary)] px-1.5 text-sm outline-none"
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
          <span className="truncate font-semibold" onDoubleClick={handleDoubleClick}>
            {name}
          </span>
        )}
        {pinned && (
          <Pin
            className="ml-auto h-3 w-3 flex-shrink-0 group-hover:hidden"
            style={{ color: "var(--accent)" }}
          />
        )}
        <div className={`${pinned ? "" : "ml-auto "}hidden flex-shrink-0 items-center gap-0.5 group-hover:flex`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className="rounded p-1 hover:bg-[var(--bg-surface)]"
            style={{ color: pinned ? "var(--accent)" : "var(--text-muted)" }}
            title={pinned ? "Unpin workspace" : "Pin workspace"}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLink();
            }}
            className="rounded p-1 hover:bg-[var(--bg-surface)]"
            style={{ color: "var(--text-muted)" }}
            title="Link workspaces"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            className="rounded p-1 hover:bg-[var(--bg-surface)]"
            style={{ color: "var(--text-muted)" }}
            title="Archive worktree"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Row 2: branch */}
      <div
        className="mt-1.5 flex items-center gap-1.5 pl-[18px] text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <GitBranch className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{branch}</span>
      </div>

      {/* Row 3: created time */}
      <div
        className="mt-1 flex items-center gap-1.5 pl-[18px] text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Clock className="h-3 w-3 flex-shrink-0" />
        <span>{relativeTime(createdAt)}</span>
      </div>
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
      className="group flex items-center gap-2.5 py-1.5 pl-8 pr-4 text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
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
        className="hidden flex-shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs group-hover:flex"
        style={{ color: error ? "var(--error)" : "var(--accent)" }}
      >
        <RotateCcw className="h-3 w-3" />
        {restoring ? "..." : error ? "Failed" : "Restore"}
      </button>
    </div>
  );
}
