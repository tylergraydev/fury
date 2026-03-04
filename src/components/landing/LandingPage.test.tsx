import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "./LandingPage";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { open } from "@tauri-apps/plugin-dialog";

vi.mock("./CloneRepoDialog", () => ({
  CloneRepoDialog: ({ onClose }: any) => (
    <div data-testid="clone-dialog">
      <button data-testid="close-clone" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("./NewProjectDialog", () => ({
  NewProjectDialog: ({ onClose }: any) => (
    <div data-testid="new-project-dialog">
      <button data-testid="close-new-project" onClick={onClose}>Close</button>
    </div>
  ),
}));

beforeEach(() => {
  useRepositoryStore.setState({ repositories: [], loading: false, error: null });
  useWorkspaceStore.setState({
    workspaces: [],
    archivedWorkspaces: [],
    activeWorkspaceId: null,
    activeRepoId: null,
    loading: false,
    error: null,
  });
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  vi.clearAllMocks();
});

const REPO_1 = {
  id: "r1",
  name: "test-repo",
  path: "/home/user/test-repo",
  defaultBranch: "main",
  currentBranch: null,
  provider: "git_hub" as const,
  remoteUrl: null,
};

const REPO_2 = {
  id: "r2",
  name: "other-repo",
  path: "/home/user/other-repo",
  defaultBranch: "main",
  currentBranch: null,
  provider: "git_hub" as const,
  remoteUrl: null,
};

const WS_1 = {
  id: "ws-1",
  repoId: "r1",
  name: "feature-a",
  branch: "feature-a",
  status: "Active",
  portBase: 3000,
  autoCommit: false,
  createdAt: "2025-01-01T00:00:00Z",
  archivedAt: null,
};

const WS_2 = {
  id: "ws-2",
  repoId: "r1",
  name: "feature-b",
  branch: "feature-b",
  status: "Active",
  portBase: 3001,
  autoCommit: false,
  createdAt: "2025-06-15T12:00:00Z",
  archivedAt: null,
};

describe("LandingPage", () => {
  it("renders Fury header", () => {
    render(<LandingPage />);
    expect(screen.getByText("Fury")).toBeInTheDocument();
    expect(
      screen.getByText("Multi-workspace orchestrator for Claude Code"),
    ).toBeInTheDocument();
  });

  it("shows getting started section when no repos exist", () => {
    render(<LandingPage />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Add a repository")).toBeInTheDocument();
    expect(screen.getByText("Create a workspace")).toBeInTheDocument();
    expect(screen.getByText("Start coding with Claude")).toBeInTheDocument();
  });

  it("shows recent repositories when repos exist", () => {
    useRepositoryStore.setState({ repositories: [REPO_1] });
    render(<LandingPage />);
    expect(screen.getByText("Recent Repositories")).toBeInTheDocument();
    expect(screen.getByText("test-repo")).toBeInTheDocument();
    expect(screen.getByText("/home/user/test-repo")).toBeInTheDocument();
  });

  it("renders quick action cards", () => {
    render(<LandingPage />);
    expect(screen.getByText("Open Repository")).toBeInTheDocument();
    expect(screen.getByText("Clone Repository")).toBeInTheDocument();
    expect(screen.getByText("New AI Project")).toBeInTheDocument();
  });

  it("renders settings button and calls callback", async () => {
    const user = userEvent.setup();
    const onSettings = vi.fn();
    render(<LandingPage onOpenSettings={onSettings} />);
    const settingsBtn = screen.getByTitle("Settings");
    await user.click(settingsBtn);
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("does not render settings button when no callback", () => {
    render(<LandingPage />);
    expect(screen.queryByTitle("Settings")).not.toBeInTheDocument();
  });

  it("shows workspace chips under their repo", () => {
    useRepositoryStore.setState({ repositories: [REPO_1] });
    useWorkspaceStore.setState({ workspaces: [WS_1] as any });
    render(<LandingPage />);
    expect(screen.getByText("feature-a")).toBeInTheDocument();
    expect(screen.getByText("1 worktree")).toBeInTheDocument();
  });

  it("shows keyboard shortcuts when repos exist", () => {
    useRepositoryStore.setState({ repositories: [REPO_1] });
    render(<LandingPage />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Command Palette")).toBeInTheDocument();
  });

  // --- Clone and New Project dialog triggers ---
  describe("Clone and New Project dialogs", () => {
    it("opens clone dialog when Clone Repository card is clicked", async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      expect(screen.queryByTestId("clone-dialog")).not.toBeInTheDocument();
      await user.click(screen.getByText("Clone Repository"));
      expect(screen.getByTestId("clone-dialog")).toBeInTheDocument();
    });

    it("closes clone dialog via onClose callback", async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByText("Clone Repository"));
      expect(screen.getByTestId("clone-dialog")).toBeInTheDocument();
      await user.click(screen.getByTestId("close-clone"));
      expect(screen.queryByTestId("clone-dialog")).not.toBeInTheDocument();
    });

    it("opens new project dialog when New AI Project card is clicked", async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      expect(screen.queryByTestId("new-project-dialog")).not.toBeInTheDocument();
      await user.click(screen.getByText("New AI Project"));
      expect(screen.getByTestId("new-project-dialog")).toBeInTheDocument();
    });

    it("closes new project dialog via onClose callback", async () => {
      const user = userEvent.setup();
      render(<LandingPage />);
      await user.click(screen.getByText("New AI Project"));
      expect(screen.getByTestId("new-project-dialog")).toBeInTheDocument();
      await user.click(screen.getByTestId("close-new-project"));
      expect(screen.queryByTestId("new-project-dialog")).not.toBeInTheDocument();
    });
  });

  // --- QuickActions: Open Repository ---
  describe("QuickActions - Open Repository", () => {
    it("opens directory picker on Open Repository click", async () => {
      const user = userEvent.setup();
      (open as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      render(<LandingPage />);
      await user.click(screen.getByText("Open Repository"));
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Select a Git Repository",
      });
    });

    it("adds new repo when selected path is not already registered", async () => {
      const user = userEvent.setup();
      (open as ReturnType<typeof vi.fn>).mockResolvedValue("/new/repo");
      const addRepoSpy = vi.fn().mockResolvedValue({ id: "new-r", name: "repo", path: "/new/repo" });
      useRepositoryStore.setState({
        repositories: [],
        addRepo: addRepoSpy,
      } as any);
      const setActiveRepoSpy = vi.fn();
      useWorkspaceStore.setState({ ...useWorkspaceStore.getState(), setActiveRepo: setActiveRepoSpy });
      render(<LandingPage />);
      await user.click(screen.getByText("Open Repository"));
      expect(addRepoSpy).toHaveBeenCalledWith("/new/repo");
    });

    it("activates existing repo when path matches", async () => {
      const user = userEvent.setup();
      (open as ReturnType<typeof vi.fn>).mockResolvedValue("/home/user/test-repo");
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const setActiveRepoSpy = vi.fn();
      useWorkspaceStore.setState({ ...useWorkspaceStore.getState(), setActiveRepo: setActiveRepoSpy });
      render(<LandingPage />);
      await user.click(screen.getByText("Open Repository"));
      expect(setActiveRepoSpy).toHaveBeenCalledWith("r1");
    });

    it("shows error when open fails", async () => {
      const user = userEvent.setup();
      (open as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Permission denied"));
      render(<LandingPage />);
      await user.click(screen.getByText("Open Repository"));
      expect(await screen.findByText("Error: Permission denied")).toBeInTheDocument();
    });
  });

  // --- RecentRepositories ---
  describe("RecentRepositories", () => {
    it("shows worktree count for each repo", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({ workspaces: [WS_1, WS_2] as any });
      render(<LandingPage />);
      expect(screen.getByText("2 worktrees")).toBeInTheDocument();
    });

    it("shows singular worktree text for 1 workspace", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({ workspaces: [WS_1] as any });
      render(<LandingPage />);
      expect(screen.getByText("1 worktree")).toBeInTheDocument();
    });

    it("shows zero worktrees for repo with no workspaces", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({ workspaces: [] });
      render(<LandingPage />);
      expect(screen.getByText("0 worktrees")).toBeInTheDocument();
    });

    it("shows time ago for latest workspace", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const recentWs = {
        ...WS_1,
        createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      };
      useWorkspaceStore.setState({ workspaces: [recentWs] as any });
      render(<LandingPage />);
      expect(screen.getByText("1h ago")).toBeInTheDocument();
    });

    it("clicking repo button calls setActiveRepo", async () => {
      const user = userEvent.setup();
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const setActiveRepoSpy = vi.fn();
      useWorkspaceStore.setState({ ...useWorkspaceStore.getState(), setActiveRepo: setActiveRepoSpy });
      render(<LandingPage />);
      await user.click(screen.getByText("test-repo"));
      expect(setActiveRepoSpy).toHaveBeenCalledWith("r1");
    });

    it("clicking workspace chip calls setActive", async () => {
      const user = userEvent.setup();
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const setActiveSpy = vi.fn();
      useWorkspaceStore.setState({
        ...useWorkspaceStore.getState(),
        workspaces: [WS_1] as any,
        setActive: setActiveSpy,
      });
      render(<LandingPage />);
      await user.click(screen.getByText("feature-a"));
      expect(setActiveSpy).toHaveBeenCalledWith("ws-1");
    });

    it("filters repos by search input", async () => {
      const user = userEvent.setup();
      useRepositoryStore.setState({ repositories: [REPO_1, REPO_2] });
      render(<LandingPage />);
      const searchInput = screen.getByPlaceholderText("Search repositories...");
      await user.type(searchInput, "other");
      expect(screen.getByText("other-repo")).toBeInTheDocument();
      expect(screen.queryByText("test-repo")).not.toBeInTheDocument();
    });

    it("shows no match message when search has no results", async () => {
      const user = userEvent.setup();
      useRepositoryStore.setState({ repositories: [REPO_1] });
      render(<LandingPage />);
      const searchInput = screen.getByPlaceholderText("Search repositories...");
      await user.type(searchInput, "nonexistent");
      expect(screen.getByText(/No repositories match/)).toBeInTheDocument();
    });

    it("filters repos by path", async () => {
      const user = userEvent.setup();
      useRepositoryStore.setState({ repositories: [REPO_1, REPO_2] });
      render(<LandingPage />);
      const searchInput = screen.getByPlaceholderText("Search repositories...");
      await user.type(searchInput, "/home/user/other");
      expect(screen.getByText("other-repo")).toBeInTheDocument();
      expect(screen.queryByText("test-repo")).not.toBeInTheDocument();
    });

    it("shows all repos when search is empty", async () => {
      useRepositoryStore.setState({ repositories: [REPO_1, REPO_2] });
      render(<LandingPage />);
      expect(screen.getByText("test-repo")).toBeInTheDocument();
      expect(screen.getByText("other-repo")).toBeInTheDocument();
    });
  });

  // --- WorkspaceChip ---
  describe("WorkspaceChip", () => {
    it("shows running indicator for running agent", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({ workspaces: [WS_1] as any });
      useAgentStore.setState({
        agents: {
          "ws-1": { status: "Running" } as any,
        },
      });
      render(<LandingPage />);
      const chip = screen.getByText("feature-a");
      // The running agent should have animate-pulse class on its dot
      const dot = chip.parentElement?.querySelector(".animate-pulse");
      expect(dot).toBeInTheDocument();
    });

    it("shows non-running indicator for idle agent", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({ workspaces: [WS_1] as any });
      useAgentStore.setState({
        agents: {
          "ws-1": { status: "Idle" } as any,
        },
      });
      render(<LandingPage />);
      const chip = screen.getByText("feature-a");
      const dot = chip.parentElement?.querySelector(".animate-pulse");
      expect(dot).not.toBeInTheDocument();
    });
  });

  // --- timeAgo helper ---
  describe("timeAgo display", () => {
    it("shows 'just now' for very recent", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({
        workspaces: [{
          ...WS_1,
          createdAt: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
        }] as any,
      });
      render(<LandingPage />);
      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("shows minutes ago", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({
        workspaces: [{
          ...WS_1,
          createdAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
        }] as any,
      });
      render(<LandingPage />);
      expect(screen.getByText("5m ago")).toBeInTheDocument();
    });

    it("shows hours ago", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({
        workspaces: [{
          ...WS_1,
          createdAt: new Date(Date.now() - 3 * 3600000).toISOString(), // 3 hours ago
        }] as any,
      });
      render(<LandingPage />);
      expect(screen.getByText("3h ago")).toBeInTheDocument();
    });

    it("shows days ago", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({
        workspaces: [{
          ...WS_1,
          createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), // 3 days ago
        }] as any,
      });
      render(<LandingPage />);
      expect(screen.getByText("3d ago")).toBeInTheDocument();
    });

    it("shows weeks ago", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({
        workspaces: [{
          ...WS_1,
          createdAt: new Date(Date.now() - 14 * 86400000).toISOString(), // 2 weeks ago
        }] as any,
      });
      render(<LandingPage />);
      expect(screen.getByText("2w ago")).toBeInTheDocument();
    });

    it("shows months ago", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      useWorkspaceStore.setState({
        workspaces: [{
          ...WS_1,
          createdAt: new Date(Date.now() - 60 * 86400000).toISOString(), // ~2 months ago
        }] as any,
      });
      render(<LandingPage />);
      expect(screen.getByText("2mo ago")).toBeInTheDocument();
    });
  });

  // --- GettingStarted ---
  describe("GettingStarted", () => {
    it("renders Add Repository button in getting started section", () => {
      render(<LandingPage />);
      expect(screen.getByText("Add Repository")).toBeInTheDocument();
    });

    it("Add Repository button opens directory picker", async () => {
      const user = userEvent.setup();
      (open as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      render(<LandingPage />);
      await user.click(screen.getByText("Add Repository"));
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Select a Git Repository",
      });
    });

    it("handles new repo add in GettingStarted", async () => {
      const user = userEvent.setup();
      (open as ReturnType<typeof vi.fn>).mockResolvedValue("/new/repo");
      const addRepoSpy = vi.fn().mockResolvedValue({ id: "new-r", name: "repo", path: "/new/repo" });
      useRepositoryStore.setState({
        repositories: [],
        addRepo: addRepoSpy,
      } as any);
      const setActiveRepoSpy = vi.fn();
      useWorkspaceStore.setState({ ...useWorkspaceStore.getState(), setActiveRepo: setActiveRepoSpy });
      render(<LandingPage />);
      await user.click(screen.getByText("Add Repository"));
      expect(addRepoSpy).toHaveBeenCalledWith("/new/repo");
    });

    it("handles existing repo in GettingStarted", async () => {
      const user = userEvent.setup();
      // Pre-set the repo in the store so getState() finds it when the handler runs.
      // The GettingStarted component only renders when repositories is empty,
      // but the handler reads from getState() which we set below.
      // We set repos in store for getState() lookup, but the component was rendered with empty repos.
      (open as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        // Set repos before returning so the handler finds it
        useRepositoryStore.setState({ repositories: [REPO_1] });
        return "/home/user/test-repo";
      });
      const setActiveRepoSpy = vi.fn();
      useWorkspaceStore.setState({ ...useWorkspaceStore.getState(), setActiveRepo: setActiveRepoSpy });
      render(<LandingPage />);
      await user.click(screen.getByText("Add Repository"));
      await vi.waitFor(() => {
        expect(setActiveRepoSpy).toHaveBeenCalledWith("r1");
      });
    });

    it("handles addRepo error in GettingStarted", async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      (open as ReturnType<typeof vi.fn>).mockResolvedValue("/broken/repo");
      const addRepoSpy = vi.fn().mockRejectedValue(new Error("Not a git repo"));
      useRepositoryStore.setState({
        repositories: [],
        addRepo: addRepoSpy,
      } as any);
      render(<LandingPage />);
      await user.click(screen.getByText("Add Repository"));
      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("Failed to add repo:", expect.any(Error));
      });
      consoleSpy.mockRestore();
    });
  });

  // --- Draggable region ---
  it("renders draggable region for title bar", () => {
    render(<LandingPage />);
    const dragRegion = document.querySelector("[data-tauri-drag-region]");
    expect(dragRegion).toBeInTheDocument();
  });

  // --- Latest workspace calculation ---
  describe("Latest workspace calculation", () => {
    it("picks the latest workspace by createdAt", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const olderWs = {
        ...WS_1,
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      };
      const newerWs = {
        ...WS_2,
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      };
      useWorkspaceStore.setState({ workspaces: [olderWs, newerWs] as any });
      render(<LandingPage />);
      expect(screen.getByText("2h ago")).toBeInTheDocument();
    });

    it("handles workspaces with null createdAt in reduce", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const wsWithNullCreated = {
        ...WS_1,
        createdAt: null as unknown as string,
      };
      const wsWithCreated = {
        ...WS_2,
        createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      };
      useWorkspaceStore.setState({ workspaces: [wsWithNullCreated, wsWithCreated] as any });
      render(<LandingPage />);
      // Should render without crashing and show the time from the workspace with a createdAt
      expect(screen.getByText("1h ago")).toBeInTheDocument();
    });

    it("handles both workspaces with null createdAt in reduce", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const ws1 = { ...WS_1, createdAt: null as unknown as string };
      const ws2 = { ...WS_2, createdAt: null as unknown as string };
      useWorkspaceStore.setState({ workspaces: [ws1, ws2] as any });
      render(<LandingPage />);
      // Should render without crashing - both have null createdAt, reduce falls back to ""
      expect(screen.getByText("2 worktrees")).toBeInTheDocument();
    });

    it("handles workspaces where first has createdAt and second does not", () => {
      useRepositoryStore.setState({ repositories: [REPO_1] });
      const wsWithCreated = {
        ...WS_1,
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      };
      const wsWithNullCreated = {
        ...WS_2,
        createdAt: null as unknown as string,
      };
      useWorkspaceStore.setState({ workspaces: [wsWithCreated, wsWithNullCreated] as any });
      render(<LandingPage />);
      // The workspace with createdAt should be picked as latest
      expect(screen.getByText("2h ago")).toBeInTheDocument();
    });
  });
});
