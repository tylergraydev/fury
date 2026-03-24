import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  GitPullRequestArrow,
  FolderGit2,
  GitBranch,
  Settings,
  Sparkles,
  MessageSquare,
  Search,
  Clock,
} from "lucide-react";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { isMac, modLabel } from "../../lib/keybindings";
import type { WorkspaceInfo } from "../../lib/tauri";
import { CloneRepoDialog } from "./CloneRepoDialog";
import { NewProjectDialog } from "./NewProjectDialog";

interface LandingPageProps {
  onOpenSettings?: () => void;
}

export function LandingPage({ onOpenSettings }: LandingPageProps) {
  const repositories = useRepositoryStore((s) => s.repositories);
  const hasRepos = repositories.length > 0;
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  return (
    <div
      className="flex h-full flex-col items-center overflow-y-auto px-8"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Draggable region for window title bar */}
      <div
        data-tauri-drag-region
        className="w-full flex-shrink-0"
        style={{
          /* v8 ignore next -- @preserve */
          height: isMac ? 52 : 32,
        }}
      />

      <div className="w-full max-w-5xl">
        <Header onOpenSettings={onOpenSettings} />
        <QuickActions
          onClone={() => setShowCloneDialog(true)}
          onNewProject={() => setShowNewProjectDialog(true)}
        />
        {hasRepos ? (
          <>
            <RecentRepositories />
            <KeyboardShortcuts />
          </>
        ) : (
          <GettingStarted />
        )}
      </div>

      {showCloneDialog && (
        <CloneRepoDialog onClose={() => setShowCloneDialog(false)} />
      )}
      {showNewProjectDialog && (
        <NewProjectDialog onClose={() => setShowNewProjectDialog(false)} />
      )}
    </div>
  );
}

function Header({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <img src="/logo.png" alt="Fury" className="h-14 w-14 rounded-xl" />
      <div>
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Fury
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Multi-workspace orchestrator for Claude Code
        </p>
      </div>
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="ml-auto rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function QuickActions({
  onClone,
  onNewProject,
}: {
  onClone: () => void;
  onNewProject: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleOpenRepo = async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select a Git Repository",
      });
      if (selected) {
        const path = selected as string;
        // Check if this repo is already registered
        const existing = useRepositoryStore.getState().repositories.find(
          (r) => r.path === path,
        );
        if (existing) {
          useWorkspaceStore.getState().setActiveRepo(existing.id);
          return;
        }
        const repo = await useRepositoryStore.getState().addRepo(path);
        useWorkspaceStore.getState().setActiveRepo(repo.id);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="mb-8">
      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--error-bg)",
            color: "#ef4444",
            border: "1px solid var(--error-border)",
          }}
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
      <ActionCard
        icon={<FolderOpen className="h-7 w-7" />}
        color="var(--accent)"
        title="Open Repository"
        description="Browse and select a git repository"
        onClick={handleOpenRepo}
      />
      <ActionCard
        icon={<GitPullRequestArrow className="h-7 w-7" />}
        color="#a78bfa"
        title="Clone Repository"
        description="Clone from Git URL"
        onClick={onClone}
      />
      <ActionCard
        icon={<Sparkles className="h-7 w-7" />}
        color="#4ade80"
        title="New AI Project"
        description="Start with AI assistance"
        onClick={onNewProject}
      />
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-5 rounded-xl px-12 py-10 text-center transition-colors hover:border-[var(--accent)]"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          /* v8 ignore next -- @preserve */
          backgroundColor: color ?? "var(--accent)",
        }}
      >
        <span style={{ color: "#1e1e2e" }}>{icon}</span>
      </div>
      <div>
        <div
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </div>
        <div
          className="mt-1.5 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function RecentRepositories() {
  const repositories = useRepositoryStore((s) => s.repositories);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const setActiveRepo = useWorkspaceStore((s) => s.setActiveRepo);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return repositories;
    const q = search.toLowerCase();
    return repositories.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q),
    );
  }, [repositories, search]);

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Recent Repositories
        </h2>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="bg-transparent text-xs outline-none"
            style={{ color: "var(--text-primary)", width: 160 }}
          />
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((repo) => {
          const repoWorkspaces = workspaces.filter(
            (ws) => ws.repoId === repo.id,
          );
          const latestWs = repoWorkspaces.length > 0
            ? repoWorkspaces.reduce((a, b) =>
                (a.createdAt ?? "") > (b.createdAt ?? "") ? a : b
              )
            : null;

          return (
            <div
              key={repo.id}
              className="rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border)",
              }}
            >
              <button
                onClick={() => setActiveRepo(repo.id)}
                className="flex w-full items-center gap-4 rounded-lg px-5 py-4 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <FolderGit2
                  className="h-5 w-5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <span
                    className="text-base font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {repo.name}
                  </span>
                  <p
                    className="truncate text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {repo.path}
                  </p>
                </div>
                <span
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {repoWorkspaces.length} worktree{repoWorkspaces.length !== 1 ? "s" : ""}
                </span>
                {latestWs && (
                  <span
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {timeAgo(latestWs.createdAt)}
                  </span>
                )}
              </button>

              {repoWorkspaces.length > 0 && (
                <div
                  className="flex flex-wrap gap-1.5 px-4 pb-3"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  {repoWorkspaces.map((ws) => (
                    <WorkspaceChip
                      key={ws.id}
                      ws={ws}
                      onClick={() => setActive(ws.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && search.trim() && (
          <p className="py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            No repositories match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

function WorkspaceChip({
  ws,
  onClick,
}: {
  ws: WorkspaceInfo;
  onClick: () => void;
}) {
  const status = useAgentStore((s) => s.getStatus(ws.id));
  const isRunning = status === "Running";

  return (
    <button
      onClick={onClick}
      className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isRunning ? "animate-pulse" : ""}`}
        style={{
          backgroundColor: isRunning ? "var(--success)" : "var(--text-muted)",
        }}
      />
      {ws.name}
    </button>
  );
}

function KeyboardShortcuts() {
  const shortcuts = [
    { keys: `${modLabel}K`, label: "Command Palette" },
    { keys: `${modLabel}N`, label: "New Workspace" },
    { keys: `${modLabel},`, label: "Settings" },
    { keys: `${modLabel}B`, label: "Toggle Sidebar" },
  ];

  return (
    <div>
      <h2
        className="mb-3 text-xs font-medium uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        Keyboard Shortcuts
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {shortcuts.map((s) => (
          <div
            key={s.keys}
            className="flex items-center justify-between rounded-lg px-3 py-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {s.label}
            </span>
            <kbd
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function GettingStarted() {
  const [error, setError] = useState<string | null>(null);

  const handleAddRepo = async () => {
    setError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a Git Repository",
    });
    if (selected) {
      const path = selected as string;
      const existing = useRepositoryStore.getState().repositories.find(
        (r) => r.path === path,
      );
      if (existing) {
        useWorkspaceStore.getState().setActiveRepo(existing.id);
        return;
      }
      try {
        const repo = await useRepositoryStore.getState().addRepo(path);
        useWorkspaceStore.getState().setActiveRepo(repo.id);
      } catch (e) {
        setError(String(e));
      }
    }
  };

  const steps = [
    {
      number: 1,
      title: "Add a repository",
      description: "Import a git repository to get started.",
      action: { label: "Add Repository", onClick: handleAddRepo },
      icon: <FolderGit2 className="h-4 w-4" />,
    },
    {
      number: 2,
      title: "Create a workspace",
      description:
        "Each workspace is an isolated branch with its own Claude agent.",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      number: 3,
      title: "Start coding with Claude",
      description: "Chat, review diffs, merge changes, and run checks.",
      icon: <MessageSquare className="h-4 w-4" />,
    },
  ];

  return (
    <div>
      <h2
        className="mb-3 text-xs font-medium uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        Getting Started
      </h2>
      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--error-bg)",
            color: "#ef4444",
            border: "1px solid var(--error-border)",
          }}
        >
          {error}
        </div>
      )}
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.number}
            className="flex items-start gap-4 rounded-lg p-4"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--accent)",
              }}
            >
              {step.number}
            </div>
            <div className="flex-1">
              <div
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {step.icon}
                {step.title}
              </div>
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {step.description}
              </div>
              {step.action && (
                <button
                  onClick={step.action.onClick}
                  className="mt-2 rounded px-3 py-1.5 text-xs"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--bg-primary)",
                  }}
                >
                  {step.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
