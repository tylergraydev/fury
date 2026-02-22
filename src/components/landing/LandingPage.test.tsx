import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "./LandingPage";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";

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
});

describe("LandingPage", () => {
  it("renders Fury header", () => {
    render(<LandingPage />);
    expect(screen.getByText("Fury")).toBeInTheDocument();
    expect(
      screen.getByText("Multi-workspace conductor for Claude Code"),
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
    useRepositoryStore.setState({
      repositories: [
        {
          id: "r1",
          name: "test-repo",
          path: "/home/user/test-repo",
          defaultBranch: "main",
          currentBranch: null,
        },
      ],
    });
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

  it("shows workspace chips under their repo", () => {
    useRepositoryStore.setState({
      repositories: [
        {
          id: "r1",
          name: "my-repo",
          path: "/path",
          defaultBranch: "main",
          currentBranch: null,
        },
      ],
    });
    useWorkspaceStore.setState({
      workspaces: [
        {
          id: "ws-1",
          repoId: "r1",
          name: "feature-a",
          branch: "feature-a",
          status: "Active",
          portBase: 3000,
          autoCommit: false,
          createdAt: "2025-01-01T00:00:00Z",
          archivedAt: null,
        },
      ],
    });
    render(<LandingPage />);
    expect(screen.getByText("feature-a")).toBeInTheDocument();
    expect(screen.getByText("1 worktree")).toBeInTheDocument();
  });

  it("shows keyboard shortcuts when repos exist", () => {
    useRepositoryStore.setState({
      repositories: [
        {
          id: "r1",
          name: "repo",
          path: "/p",
          defaultBranch: "main",
          currentBranch: null,
        },
      ],
    });
    render(<LandingPage />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Command Palette")).toBeInTheDocument();
  });
});
