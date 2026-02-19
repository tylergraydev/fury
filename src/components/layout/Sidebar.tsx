import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { NewWorkspaceDialog } from "../workspace/NewWorkspaceDialog";
import { RepoSettingsPanel } from "../settings/RepoSettingsPanel";
import { LinkWorkspaceDialog } from "../workspace/LinkWorkspaceDialog";

export function Sidebar() {
  const { repositories, loadRepositories, addRepo } = useRepositoryStore();
  const {
    workspaces,
    activeWorkspaceId,
    activeRepoId,
    setActive,
    setActiveRepo,
    loadWorkspaces,
  } = useWorkspaceStore();
  const [newWsRepoId, setNewWsRepoId] = useState<string | null>(null);
  const [settingsRepoId, setSettingsRepoId] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [linkWs, setLinkWs] = useState<{
    id: string;
    name: string;
    repoId: string;
  } | null>(null);

  useEffect(() => {
    loadRepositories();
    loadWorkspaces();
  }, [loadRepositories, loadWorkspaces]);

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

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Repositories header */}
      <div
        className="px-3 py-2 text-xs font-semibold uppercase"
        style={{
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        Repositories
      </div>

      {/* Error banner */}
      {repoError && (
        <div
          className="flex items-start gap-2 px-3 py-2 text-xs"
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
            No repositories added. Click the button below to add one.
          </div>
        ) : (
          repositories.map((repo) => (
            <div key={repo.id}>
              {/* Repo header */}
              <div
                className="flex items-center justify-between px-3 py-1.5 text-xs font-medium"
                style={{
                  color: "var(--text-secondary)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span className="truncate">{repo.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSettingsRepoId(repo.id)}
                    className="rounded px-1 text-xs hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-muted)" }}
                    title="Repository settings"
                  >
                    ⚙
                  </button>
                  <button
                    onClick={() => setNewWsRepoId(repo.id)}
                    className="rounded px-1 text-xs hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-muted)" }}
                    title="New workspace"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Current branch (base repo) */}
              <RepoBranchItem
                repoId={repo.id}
                branch={repo.currentBranch ?? repo.defaultBranch}
                isActive={activeRepoId === repo.id && !activeWorkspaceId}
                onClick={() => setActiveRepo(repo.id)}
              />

              {/* Worktree workspaces */}
              {workspaces
                .filter((ws) => ws.repoId === repo.id)
                .map((ws) => (
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
                  />
                ))}
            </div>
          ))
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleAddRepo}
          className="w-full rounded px-3 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          + Add Repository
        </button>
      </div>

      {/* New workspace dialog */}
      {newWsRepoId && (
        <NewWorkspaceDialog
          repoId={newWsRepoId}
          repoName={
            repositories.find((r) => r.id === newWsRepoId)?.name ?? ""
          }
          onClose={() => setNewWsRepoId(null)}
        />
      )}

      {/* Repo settings dialog */}
      {settingsRepoId && (
        <RepoSettingsPanel
          repoId={settingsRepoId}
          repoName={
            repositories.find((r) => r.id === settingsRepoId)?.name ?? ""
          }
          onClose={() => setSettingsRepoId(null)}
        />
      )}

      {/* Link workspace dialog */}
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

/** The repo's current branch — shown as the first item under a repo, visually distinct from worktrees. */
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
      className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs"
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "transparent",
        color: "var(--text-primary)",
      }}
    >
      <span
        className={`flex-shrink-0 text-[8px] leading-none ${isRunning ? "animate-pulse" : ""}`}
        style={{ color: dotColor }}
      >
        ◆
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
}: {
  id: string;
  name: string;
  branch: string;
  wsStatus: string | { Error: string };
  isActive: boolean;
  onClick: () => void;
  onLink: () => void;
}) {
  const agentStatus = useAgentStore((s) => s.getStatus(id));
  const isRunning = agentStatus === "Running";
  const isAgentError =
    typeof agentStatus === "object" && "Error" in agentStatus;

  const dotColor = isRunning
    ? "var(--success)"
    : isAgentError
      ? "var(--error)"
      : wsStatus === "Active"
        ? "var(--success)"
        : "var(--text-muted)";

  return (
    <div
      className="group flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs"
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "transparent",
        color: "var(--text-primary)",
      }}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        <span className="truncate">{name}</span>
        <span
          className="ml-auto truncate text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {branch}
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLink();
        }}
        className="hidden flex-shrink-0 rounded px-1 text-[10px] group-hover:block hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-muted)" }}
        title="Link workspaces"
      >
        ⇔
      </button>
    </div>
  );
}
