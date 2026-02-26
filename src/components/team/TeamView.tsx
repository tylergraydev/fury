import { useEffect, useMemo } from "react";
import { Users, Square } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { TeamAgentCard } from "./TeamAgentCard";
import { BroadcastComposer } from "./BroadcastComposer";

export function TeamView() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeRepoId = useWorkspaceStore((s) => s.activeRepoId);
  const repositories = useRepositoryStore((s) => s.repositories);
  const agents = useAgentStore((s) => s.agents);

  // Determine which repo to show
  const repoId = useMemo(() => {
    if (activeRepoId) return activeRepoId;
    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
    return activeWs?.repoId ?? null;
  }, [activeRepoId, activeWorkspaceId, workspaces]);

  const repo = repositories.find((r) => r.id === repoId);

  const repoWorkspaces = useMemo(
    () => workspaces.filter((w) => w.repoId === repoId),
    [workspaces, repoId],
  );

  // Stable key for workspace IDs — avoids re-running effect on array reference changes
  const wsIdKey = useMemo(
    () => repoWorkspaces.map((w) => w.id).join(","),
    [repoWorkspaces],
  );

  // Subscribe all workspace agents/chats on mount
  useEffect(() => {
    if (!wsIdKey) return;
    const ids = wsIdKey.split(",");
    for (const id of ids) {
      useAgentStore.getState().subscribe(id);
      useChatStore.getState().subscribe(id);
      useAgentStore.getState().fetchStatus(id);
    }
  }, [wsIdKey]);

  // Auto-enable agentTeams when repo has 2+ workspaces
  useEffect(() => {
    if (repoWorkspaces.length < 2) return;
    const settings = useSettingsStore.getState().appSettings;
    if (settings && !settings.experimental.agentTeams) {
      useSettingsStore.getState().saveSettings({
        ...settings,
        experimental: { ...settings.experimental, agentTeams: true },
      });
    }
  }, [repoWorkspaces.length]);

  const runningIds = useMemo(
    () => repoWorkspaces.filter((ws) => agents[ws.id]?.status === "Running").map((ws) => ws.id),
    [repoWorkspaces, agents],
  );

  const handleStopAll = () => {
    useAgentStore.getState().stopAllAgents(runningIds);
  };

  if (!repoId || repoWorkspaces.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ color: "var(--text-muted)" }}
      >
        <Users className="h-10 w-10 opacity-40" />
        <p className="text-sm">No workspaces in this repository.</p>
        <p className="text-xs">Create 2+ workspaces to use Team View.</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Users className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {repo?.name ?? "Repository"}
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {repoWorkspaces.length} workspaces
        </span>
        {runningIds.length > 0 && (
          <>
            <span
              className="text-xs"
              style={{ color: "var(--success)" }}
            >
              {runningIds.length} running
            </span>
            <button
              onClick={handleStopAll}
              className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--error)" }}
            >
              <Square className="h-3 w-3" />
              Stop All
            </button>
          </>
        )}
      </div>

      {/* Agent card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {repoWorkspaces.map((ws) => (
            <TeamAgentCard key={ws.id} workspace={ws} />
          ))}
        </div>
      </div>

      {/* Broadcast composer */}
      <BroadcastComposer workspaces={repoWorkspaces} />
    </div>
  );
}
