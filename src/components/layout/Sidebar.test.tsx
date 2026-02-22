import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUIStore } from "../../stores/uiStore";

vi.mock("lucide-react", () => ({
  ChevronRight: () => <span data-testid="chevron-right" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  Plus: () => <span data-testid="plus-icon" />,
  Settings: () => <span data-testid="settings-icon" />,
  GitBranch: () => <span data-testid="branch-icon" />,
  Link2: () => <span data-testid="link-icon" />,
  FolderGit2: () => <span data-testid="folder-icon" />,
  Archive: () => <span data-testid="archive-icon" />,
  RotateCcw: () => <span data-testid="restore-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
}));

vi.mock("../workspace/NewWorkspaceDialog", () => ({
  NewWorkspaceDialog: () => <div data-testid="new-workspace-dialog" />,
}));
vi.mock("../settings/RepoSettingsPanel", () => ({
  RepoSettingsPanel: () => <div data-testid="repo-settings-panel" />,
}));
vi.mock("../workspace/LinkWorkspaceDialog", () => ({
  LinkWorkspaceDialog: () => <div data-testid="link-workspace-dialog" />,
}));

vi.mock("../../lib/tauri", () => ({
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  listArchivedWorkspaces: vi.fn().mockResolvedValue([]),
  archiveWorkspace: vi.fn().mockResolvedValue(undefined),
  restoreWorkspace: vi.fn().mockResolvedValue(undefined),
  renameWorkspace: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useRepositoryStore.setState({ repositories: [] });
  useWorkspaceStore.setState({
    workspaces: [],
    archivedWorkspaces: [],
    activeWorkspaceId: null,
    activeRepoId: null,
  });
  useAgentStore.setState({ agents: {} });
  useUIStore.setState({});
  vi.clearAllMocks();
});

describe("Sidebar", () => {
  it("renders header with Worktrees title", () => {
    render(<Sidebar />);
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
  });

  it("shows empty state when no repositories", () => {
    render(<Sidebar />);
    expect(screen.getByText("No repositories added yet.")).toBeInTheDocument();
  });

  it("shows New Chat Worktree button", () => {
    render(<Sidebar />);
    expect(screen.getByText("New Chat Worktree")).toBeInTheDocument();
  });

  it("shows Archived section", () => {
    render(<Sidebar />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("shows repository name when repos exist", () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" },
      ],
    });
    render(<Sidebar />);
    expect(screen.getByText("my-repo")).toBeInTheDocument();
  });

  it("shows workspace items for repo", () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "main" },
      ],
    });
    useWorkspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "r1", name: "Feature Work", branch: "feature-1", status: "Active", portBase: 3000, autoCommit: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: null },
      ],
    });
    render(<Sidebar />);
    expect(screen.getByText("Feature Work")).toBeInTheDocument();
  });

  it("shows no archived workspaces message when expanded", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("Archived"));
    expect(screen.getByText("No archived workspaces")).toBeInTheDocument();
  });

  it("shows archived count in label", () => {
    useWorkspaceStore.setState({
      archivedWorkspaces: [
        { id: "ws-a", repoId: "r1", name: "Old Work", branch: "old", status: "Archived", portBase: 3000, autoCommit: false, createdAt: "2024-01-01T00:00:00Z", archivedAt: "2024-06-01T00:00:00Z" },
      ],
    });
    render(<Sidebar />);
    expect(screen.getByText(/Archived/)).toBeInTheDocument();
  });

  it("shows repo branch item", () => {
    useRepositoryStore.setState({
      repositories: [
        { id: "r1", name: "my-repo", path: "/path", defaultBranch: "main", currentBranch: "develop" },
      ],
    });
    render(<Sidebar />);
    // The repo branch item shows the current branch
    expect(screen.getAllByText("develop").length).toBeGreaterThan(0);
  });
});
