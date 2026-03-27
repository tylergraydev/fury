import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  Users: ({ className }: { className?: string }) => <span className={className} data-testid="users-icon" />,
  Square: ({ className }: { className?: string }) => <span className={className} data-testid="square-icon" />,
  GitBranch: ({ className }: { className?: string }) => <span className={className} data-testid="branch-icon" />,
  Send: ({ className }: { className?: string }) => <span className={className} data-testid="send-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
}));

import { TeamView } from "./TeamView";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";

const defaultSettings = {
  agentType: "claude_code" as const,
  theme: "blend" as const,
  provider: { providerType: "Anthropic" as const, envVars: {} },
  systemPromptAdditions: null,
  analyticsEnabled: false,
  experimental: {
    spotlightTesting: false,
    agentTeams: false,
    persistentProcesses: false,
    safeMode: false,
  },
  copilot: { enabled: false },
  linear: { apiKey: null },
  claudeContext: { enabled: false, openaiApiKey: null, zillizUri: null, zillizToken: null },
  azureDevops: { pat: null, defaultOrg: null },
};

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [],
    archivedWorkspaces: [],
    activeWorkspaceId: null,
    activeRepoId: null,
  });
  useRepositoryStore.setState({ repositories: [] });
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  useChatStore.setState({ messages: {}, streamingText: {}, sessionStats: {} });
  useSettingsStore.setState({ appSettings: { ...defaultSettings } });
  vi.clearAllMocks();
});

describe("TeamView", () => {
  it("shows empty state when no repoId and no activeWorkspaceId", () => {
    useWorkspaceStore.setState({ activeRepoId: null, activeWorkspaceId: null, workspaces: [] });
    render(<TeamView />);
    expect(screen.getByText("No workspaces in this repository.")).toBeInTheDocument();
  });

  it("falls back to activeWorkspace repoId when activeRepoId is null", () => {
    useWorkspaceStore.setState({
      activeRepoId: null,
      activeWorkspaceId: "ws-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    render(<TeamView />);
    expect(screen.getByText("my-app")).toBeInTheDocument();
  });

  it("shows 'Repository' fallback when repo is not found", () => {
    useWorkspaceStore.setState({
      activeRepoId: "repo-missing",
      workspaces: [
        { id: "ws-1", repoId: "repo-missing", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({ repositories: [] });
    render(<TeamView />);
    expect(screen.getByText("Repository")).toBeInTheDocument();
  });

  it("shows empty state when no workspaces", () => {
    useWorkspaceStore.setState({ activeRepoId: "repo-1" });
    render(<TeamView />);
    expect(screen.getByText("No workspaces in this repository.")).toBeInTheDocument();
    expect(screen.getByText("Create 2+ workspaces to use Team View.")).toBeInTheDocument();
  });

  it("renders workspace cards for all workspaces in the repo", () => {
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-2", repoId: "repo-1", name: "backend", branch: "feat/api", status: "Active", portBase: 3001, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    render(<TeamView />);
    // Names appear in both card and broadcast composer checkbox
    expect(screen.getAllByText("frontend")).toHaveLength(2);
    expect(screen.getAllByText("backend")).toHaveLength(2);
    expect(screen.getByText("my-app")).toBeInTheDocument();
    expect(screen.getByText("2 workspaces")).toBeInTheDocument();
  });

  it("shows workspace cards filtered by active workspace repo", () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: "ws-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-2", repoId: "repo-1", name: "backend", branch: "feat/api", status: "Active", portBase: 3001, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-3", repoId: "repo-2", name: "other-repo-ws", branch: "main", status: "Active", portBase: 3002, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [
        { id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null },
        { id: "repo-2", name: "other", path: "/tmp/other", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null },
      ],
    });
    render(<TeamView />);
    // Names appear in both card and broadcast composer checkbox
    expect(screen.getAllByText("frontend")).toHaveLength(2);
    expect(screen.getAllByText("backend")).toHaveLength(2);
    expect(screen.queryByText("other-repo-ws")).not.toBeInTheDocument();
  });

  it("shows running count and Stop All button when agents are running", () => {
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-2", repoId: "repo-1", name: "backend", branch: "feat/api", status: "Active", portBase: 3001, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
        "ws-2": { workspaceId: "ws-2", sessionId: null, status: "Running", startedAt: null } as any,
      },
    });
    render(<TeamView />);
    expect(screen.getByText("2 running")).toBeInTheDocument();
    expect(screen.getByText("Stop All")).toBeInTheDocument();
  });

  it("Stop All button calls stopAllAgents with running workspace ids", () => {
    const stopAllAgents = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-2", repoId: "repo-1", name: "backend", branch: "feat/api", status: "Active", portBase: 3001, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
      },
      stopAllAgents,
    });
    render(<TeamView />);
    fireEvent.click(screen.getByText("Stop All"));
    expect(stopAllAgents).toHaveBeenCalledWith(["ws-1"]);
  });

  it("does not show Stop All when no agents running", () => {
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    render(<TeamView />);
    expect(screen.queryByText("Stop All")).not.toBeInTheDocument();
  });

  it("auto-enables agentTeams setting when 2+ workspaces", () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-2", repoId: "repo-1", name: "backend", branch: "feat/api", status: "Active", portBase: 3001, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    useSettingsStore.setState({
      appSettings: { ...defaultSettings, experimental: { ...defaultSettings.experimental, agentTeams: false } },
      saveSettings,
    });
    render(<TeamView />);
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: expect.objectContaining({ agentTeams: true }),
      }),
    );
  });

  it("does not call saveSettings when agentTeams already enabled", () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
        { id: "ws-2", repoId: "repo-1", name: "backend", branch: "feat/api", status: "Active", portBase: 3001, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    useSettingsStore.setState({
      appSettings: { ...defaultSettings, experimental: { ...defaultSettings.experimental, agentTeams: true } },
      saveSettings,
    });
    render(<TeamView />);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("renders broadcast composer", () => {
    useWorkspaceStore.setState({
      activeRepoId: "repo-1",
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "frontend", branch: "feat/ui", status: "Active", portBase: 3000, autoCommit: true, pinned: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ] as any[],
    });
    useRepositoryStore.setState({
      repositories: [{ id: "repo-1", name: "my-app", path: "/tmp/app", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null }],
    });
    render(<TeamView />);
    expect(screen.getByPlaceholderText("Broadcast message to selected workspaces...")).toBeInTheDocument();
  });
});
