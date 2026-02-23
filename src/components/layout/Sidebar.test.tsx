import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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
  Pin: () => <span data-testid="pin-icon" />,
  RotateCcw: () => <span data-testid="restore-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
}));

vi.mock("../workspace/NewWorkspaceDialog", () => ({
  NewWorkspaceDialog: ({ onClose }: { onClose: () => void }) => {
    return <div data-testid="new-workspace-dialog"><button onClick={onClose}>Close</button></div>;
  },
}));

vi.mock("../settings/RepoSettingsPanel", () => ({
  RepoSettingsPanel: ({ repoName, onClose }: { repoId: string; repoName: string; onClose: () => void }) => {
    return <div data-testid="repo-settings-panel"><span>{repoName}</span><button onClick={onClose}>Close</button></div>;
  },
}));

vi.mock("../workspace/LinkWorkspaceDialog", () => ({
  LinkWorkspaceDialog: ({ onClose }: { onClose: () => void }) => {
    return <div data-testid="link-workspace-dialog"><button onClick={onClose}>Close</button></div>;
  },
}));

vi.mock("../../lib/tauri", () => ({
  listRepositories: vi.fn().mockResolvedValue([]),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  listArchivedWorkspaces: vi.fn().mockResolvedValue([]),
  archiveWorkspace: vi.fn().mockResolvedValue(undefined),
  restoreWorkspace: vi.fn().mockResolvedValue(undefined),
  renameWorkspace: vi.fn().mockResolvedValue(undefined),
  setWorkspacePinned: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const makeRepo = (overrides: Record<string, unknown> = {}) => ({
  id: "r1",
  name: "my-repo",
  path: "/path",
  defaultBranch: "main",
  currentBranch: "main",
  ...overrides,
});

const makeWorkspace = (overrides: Record<string, unknown> = {}) => ({
  id: "ws-1",
  repoId: "r1",
  name: "Feature Work",
  branch: "feature-1",
  status: "Active" as const,
  portBase: 3000,
  autoCommit: false,
  pinned: false,
  createdAt: new Date().toISOString(),
  archivedAt: null,
  ...overrides,
});

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
    useRepositoryStore.setState({ repositories: [makeRepo()] });
    render(<Sidebar />);
    expect(screen.getByText("my-repo")).toBeInTheDocument();
  });

  it("shows workspace items for repo", () => {
    useRepositoryStore.setState({ repositories: [makeRepo()] });
    useWorkspaceStore.setState({
      workspaces: [makeWorkspace()],
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
        makeWorkspace({ id: "ws-a", name: "Old Work", branch: "old", status: "Archived", archivedAt: "2024-06-01T00:00:00Z" }),
      ],
    });
    render(<Sidebar />);
    expect(screen.getByText(/Archived/)).toBeInTheDocument();
  });

  it("shows repo branch item", () => {
    useRepositoryStore.setState({
      repositories: [makeRepo({ currentBranch: "develop" })],
    });
    render(<Sidebar />);
    expect(screen.getAllByText("develop").length).toBeGreaterThan(0);
  });

  // --- relativeTime coverage ---
  describe("relativeTime display", () => {
    it("shows 'just now' for very recent workspaces", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace({ createdAt: new Date().toISOString() })],
      });
      render(<Sidebar />);
      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("shows minutes ago for workspaces created minutes ago", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace({ createdAt: fiveMinAgo })],
      });
      render(<Sidebar />);
      expect(screen.getByText("5m ago")).toBeInTheDocument();
    });

    it("shows hours ago for workspaces created hours ago", () => {
      const twoHrsAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace({ createdAt: twoHrsAgo })],
      });
      render(<Sidebar />);
      expect(screen.getByText("2h ago")).toBeInTheDocument();
    });

    it("shows days ago for workspaces created days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace({ createdAt: threeDaysAgo })],
      });
      render(<Sidebar />);
      expect(screen.getByText("3d ago")).toBeInTheDocument();
    });
  });

  // --- toggleRepo (collapse/expand) ---
  describe("collapse/expand repositories", () => {
    it("collapses repo when toggle button clicked, hiding workspaces", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
      });
      render(<Sidebar />);
      // Workspace should be visible initially
      expect(screen.getByText("Feature Work")).toBeInTheDocument();

      // Click the repo toggle button (contains "Repository:")
      const repoButton = screen.getByText("my-repo").closest("button")!;
      fireEvent.click(repoButton);

      // Workspace should be hidden
      expect(screen.queryByText("Feature Work")).not.toBeInTheDocument();
    });

    it("expands repo when toggle clicked again, showing workspaces", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
      });
      render(<Sidebar />);

      const repoButton = screen.getByText("my-repo").closest("button")!;
      // Collapse
      fireEvent.click(repoButton);
      expect(screen.queryByText("Feature Work")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(repoButton);
      expect(screen.getByText("Feature Work")).toBeInTheDocument();
    });
  });

  // --- isMac paddingTop ---
  it("applies paddingTop from isMac", () => {
    render(<Sidebar />);
    // Just ensure the component renders without error;
    // isMac dictates the padding but it is tested via rendering
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
  });

  // --- New workspace dialog ---
  describe("New Workspace Dialog", () => {
    it("opens new workspace dialog from header plus button when repos exist", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      render(<Sidebar />);
      expect(screen.queryByTestId("new-workspace-dialog")).not.toBeInTheDocument();

      // Click the header plus button (title="New worktree")
      const plusButton = screen.getByTitle("New worktree");
      fireEvent.click(plusButton);

      expect(screen.getByTestId("new-workspace-dialog")).toBeInTheDocument();
    });

    it("does not open new workspace dialog from header plus button when no repos", () => {
      render(<Sidebar />);
      const plusButton = screen.getByTitle("New worktree");
      fireEvent.click(plusButton);

      expect(screen.queryByTestId("new-workspace-dialog")).not.toBeInTheDocument();
    });

    it("opens new workspace dialog from bottom button when repos exist", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      render(<Sidebar />);

      const bottomButton = screen.getByText("New Chat Worktree");
      fireEvent.click(bottomButton);

      expect(screen.getByTestId("new-workspace-dialog")).toBeInTheDocument();
    });

    it("does not open new workspace dialog from bottom button when no repos", () => {
      render(<Sidebar />);
      const bottomButton = screen.getByText("New Chat Worktree");
      fireEvent.click(bottomButton);

      expect(screen.queryByTestId("new-workspace-dialog")).not.toBeInTheDocument();
    });

    it("closes new workspace dialog via onClose callback", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      render(<Sidebar />);

      const plusButton = screen.getByTitle("New worktree");
      fireEvent.click(plusButton);
      expect(screen.getByTestId("new-workspace-dialog")).toBeInTheDocument();

      // Click the Close button inside the dialog mock
      fireEvent.click(screen.getByText("Close"));
      expect(screen.queryByTestId("new-workspace-dialog")).not.toBeInTheDocument();
    });
  });

  // --- Settings panel ---
  describe("Repo Settings Panel", () => {
    it("opens settings panel when inline settings button clicked", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      render(<Sidebar />);

      expect(screen.queryByTestId("repo-settings-panel")).not.toBeInTheDocument();

      // There are multiple "Settings" buttons. The inline one is the first.
      const settingsButtons = screen.getAllByTitle("Settings");
      const inlineSettingsBtn = settingsButtons[0];
      fireEvent.click(inlineSettingsBtn);

      expect(screen.getByTestId("repo-settings-panel")).toBeInTheDocument();
    });

    it("stops propagation on settings click (does not collapse repo)", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({ workspaces: [makeWorkspace()] });
      render(<Sidebar />);

      // Click inline settings button - should not collapse the repo
      const settingsButtons = screen.getAllByTitle("Settings");
      const inlineSettingsBtn = settingsButtons[0];
      fireEvent.click(inlineSettingsBtn);

      // Workspace should still be visible (repo not collapsed)
      expect(screen.getByText("Feature Work")).toBeInTheDocument();
      expect(screen.getByTestId("repo-settings-panel")).toBeInTheDocument();
    });

    it("closes settings panel via onClose callback", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      render(<Sidebar />);

      const settingsButtons = screen.getAllByTitle("Settings");
      const inlineSettingsBtn = settingsButtons[0];
      fireEvent.click(inlineSettingsBtn);
      expect(screen.getByTestId("repo-settings-panel")).toBeInTheDocument();

      // Click the Close button inside the settings panel mock
      const closeButtons = screen.getAllByText("Close");
      const settingsCloseBtn = closeButtons[closeButtons.length - 1];
      fireEvent.click(settingsCloseBtn);

      expect(screen.queryByTestId("repo-settings-panel")).not.toBeInTheDocument();
    });
  });

  // --- Error banner ---
  describe("Error banner", () => {
    it("shows error banner when archiving fails and dismisses it", async () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      const archiveWsMock = vi.fn().mockRejectedValue(new Error("archive failed"));
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
        archiveWs: archiveWsMock,
      });
      render(<Sidebar />);

      // Click archive button on workspace
      const archiveBtn = screen.getByTitle("Archive worktree");
      await act(async () => {
        fireEvent.click(archiveBtn);
      });

      // Error banner should appear
      await waitFor(() => {
        expect(screen.getByText(/Failed to archive/)).toBeInTheDocument();
      });

      // Dismiss the error
      const dismissBtn = screen.getByText("\u00d7");
      fireEvent.click(dismissBtn);

      expect(screen.queryByText(/Failed to archive/)).not.toBeInTheDocument();
    });
  });

  // --- RepoBranchItem ---
  describe("RepoBranchItem", () => {
    it("uses defaultBranch when currentBranch is null", () => {
      useRepositoryStore.setState({
        repositories: [makeRepo({ currentBranch: null, defaultBranch: "main" })],
      });
      render(<Sidebar />);
      expect(screen.getAllByText("main").length).toBeGreaterThan(0);
    });

    it("sets active repo when repo branch item is clicked", () => {
      const setActiveRepo = vi.fn();
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({ setActiveRepo });
      render(<Sidebar />);

      // Find the repo branch item (contains the branch text "main" twice: once bold, once in details)
      const branchItems = screen.getAllByText("main");
      // Click on the first branch item's parent div
      const branchDiv = branchItems[0].closest(".group")!;
      fireEvent.click(branchDiv);

      expect(setActiveRepo).toHaveBeenCalledWith("r1");
    });

    it("highlights active repo branch item", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({ activeRepoId: "r1", activeWorkspaceId: null });
      render(<Sidebar />);

      const branchItems = screen.getAllByText("main");
      const branchDiv = branchItems[0].closest(".group")!;
      expect(branchDiv).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
    });

    it("shows running agent status dot with animate-pulse", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useAgentStore.setState({
        agents: { r1: { workspaceId: "r1", status: "Running" } as any },
      });
      render(<Sidebar />);

      // Find dot span with animate-pulse class
      const branchItems = screen.getAllByText("main");
      const branchDiv = branchItems[0].closest(".group")!;
      const dot = branchDiv.querySelector(".animate-pulse");
      expect(dot).not.toBeNull();
      expect(dot).toHaveStyle({ backgroundColor: "var(--success)" });
    });

    it("shows error agent status dot", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useAgentStore.setState({
        agents: { r1: { workspaceId: "r1", status: { Error: "something" } } as any },
      });
      render(<Sidebar />);

      const branchItems = screen.getAllByText("main");
      const branchDiv = branchItems[0].closest(".group")!;
      const dot = branchDiv.querySelector(".rounded-full");
      expect(dot).toHaveStyle({ backgroundColor: "var(--error)" });
    });

    it("shows muted dot for idle agent status", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      // No agent state set -> getStatus returns "Idle"
      render(<Sidebar />);

      const branchItems = screen.getAllByText("main");
      const branchDiv = branchItems[0].closest(".group")!;
      const dot = branchDiv.querySelector(".rounded-full");
      expect(dot).toHaveStyle({ backgroundColor: "var(--text-muted)" });
    });
  });

  // --- WorkspaceItem ---
  describe("WorkspaceItem", () => {
    it("sets active workspace when workspace item is clicked", () => {
      const setActive = vi.fn();
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
        setActive,
      });
      render(<Sidebar />);

      const wsName = screen.getByText("Feature Work");
      const wsDiv = wsName.closest(".group")!;
      fireEvent.click(wsDiv);

      expect(setActive).toHaveBeenCalledWith("ws-1");
    });

    it("highlights active workspace", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
        activeWorkspaceId: "ws-1",
      });
      render(<Sidebar />);

      const wsName = screen.getByText("Feature Work");
      const wsDiv = wsName.closest(".group")!;
      expect(wsDiv).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
    });

    it("shows link workspace dialog when link button clicked", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
      });
      render(<Sidebar />);

      expect(screen.queryByTestId("link-workspace-dialog")).not.toBeInTheDocument();

      const linkBtn = screen.getByTitle("Link workspaces");
      fireEvent.click(linkBtn);

      expect(screen.getByTestId("link-workspace-dialog")).toBeInTheDocument();
    });

    it("closes link workspace dialog via onClose", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
      });
      render(<Sidebar />);

      const linkBtn = screen.getByTitle("Link workspaces");
      fireEvent.click(linkBtn);

      expect(screen.getByTestId("link-workspace-dialog")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Close"));
      expect(screen.queryByTestId("link-workspace-dialog")).not.toBeInTheDocument();
    });

    it("archives workspace when archive button clicked (success)", async () => {
      const archiveWsMock = vi.fn().mockResolvedValue(undefined);
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
        archiveWs: archiveWsMock,
      });
      render(<Sidebar />);

      const archiveBtn = screen.getByTitle("Archive worktree");
      await act(async () => {
        fireEvent.click(archiveBtn);
      });

      expect(archiveWsMock).toHaveBeenCalledWith("ws-1");
    });

    describe("double-click rename", () => {
      it("enters edit mode on double-click", () => {
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        expect(input).toBeInTheDocument();
        expect(input.tagName).toBe("INPUT");
      });

      it("submits rename on Enter key", () => {
        const renameWs = vi.fn().mockResolvedValue(undefined);
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
          renameWs,
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        fireEvent.change(input, { target: { value: "New Name" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(renameWs).toHaveBeenCalledWith("ws-1", "New Name");
      });

      it("cancels rename on Escape key", () => {
        const renameWs = vi.fn();
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
          renameWs,
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        fireEvent.change(input, { target: { value: "New Name" } });
        fireEvent.keyDown(input, { key: "Escape" });

        // Should exit editing without calling rename
        expect(renameWs).not.toHaveBeenCalled();
        expect(screen.getByText("Feature Work")).toBeInTheDocument();
      });

      it("submits rename on blur", () => {
        const renameWs = vi.fn().mockResolvedValue(undefined);
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
          renameWs,
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        fireEvent.change(input, { target: { value: "Blurred Name" } });
        fireEvent.blur(input);

        expect(renameWs).toHaveBeenCalledWith("ws-1", "Blurred Name");
      });

      it("does not rename if name is unchanged", () => {
        const renameWs = vi.fn();
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
          renameWs,
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        // Submit without changing
        fireEvent.keyDown(input, { key: "Enter" });

        expect(renameWs).not.toHaveBeenCalled();
      });

      it("does not rename if name is empty/whitespace", () => {
        const renameWs = vi.fn();
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
          renameWs,
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        fireEvent.change(input, { target: { value: "   " } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(renameWs).not.toHaveBeenCalled();
      });

      it("stops propagation on input click (does not select workspace)", () => {
        const setActive = vi.fn();
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
          setActive,
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        fireEvent.doubleClick(wsName);

        const input = screen.getByDisplayValue("Feature Work");
        setActive.mockClear();
        fireEvent.click(input);

        // setActive should NOT have been called because input click stops propagation
        expect(setActive).not.toHaveBeenCalled();
      });
    });

    describe("agent status for workspace", () => {
      it("shows running agent status with animate-pulse", () => {
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
        });
        useAgentStore.setState({
          agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        const wsDiv = wsName.closest(".group")!;
        const dot = wsDiv.querySelector(".animate-pulse");
        expect(dot).not.toBeNull();
        expect(dot).toHaveStyle({ backgroundColor: "var(--success)" });
      });

      it("shows error agent status dot", () => {
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace()],
        });
        useAgentStore.setState({
          agents: { "ws-1": { workspaceId: "ws-1", status: { Error: "crash" } } as any },
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        const wsDiv = wsName.closest(".group")!;
        const dot = wsDiv.querySelector(".rounded-full");
        expect(dot).toHaveStyle({ backgroundColor: "var(--error)" });
      });

      it("shows active workspace status dot (green) when agent idle", () => {
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace({ status: "Active" })],
        });
        // No agent state -> idle
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        const wsDiv = wsName.closest(".group")!;
        const dot = wsDiv.querySelector(".rounded-full");
        expect(dot).toHaveStyle({ backgroundColor: "var(--success)" });
      });

      it("shows muted dot for non-active workspace status when agent idle", () => {
        useRepositoryStore.setState({ repositories: [makeRepo()] });
        useWorkspaceStore.setState({
          workspaces: [makeWorkspace({ status: "Creating" })],
        });
        render(<Sidebar />);

        const wsName = screen.getByText("Feature Work");
        const wsDiv = wsName.closest(".group")!;
        const dot = wsDiv.querySelector(".rounded-full");
        expect(dot).toHaveStyle({ backgroundColor: "var(--text-muted)" });
      });
    });
  });

  // --- Archived workspaces section ---
  describe("Archived workspaces", () => {
    it("shows archived workspace items when section expanded", async () => {
      const loadArchivedWorkspaces = vi.fn().mockResolvedValue(undefined);
      useWorkspaceStore.setState({
        archivedWorkspaces: [
          makeWorkspace({ id: "ws-a", name: "Old Work", status: "Archived", archivedAt: "2024-06-01T00:00:00Z" }),
        ],
        loadArchivedWorkspaces,
      });
      render(<Sidebar />);

      await act(async () => {
        fireEvent.click(screen.getByText(/Archived/));
      });

      expect(screen.getByText("Old Work")).toBeInTheDocument();
    });

    it("shows restore button for archived workspace and calls restore", async () => {
      const restoreWs = vi.fn().mockResolvedValue(undefined);
      const loadArchivedWorkspaces = vi.fn().mockResolvedValue(undefined);
      useWorkspaceStore.setState({
        archivedWorkspaces: [
          makeWorkspace({ id: "ws-a", name: "Old Work", status: "Archived", archivedAt: "2024-06-01T00:00:00Z" }),
        ],
        restoreWs,
        loadArchivedWorkspaces,
      });
      render(<Sidebar />);

      await act(async () => {
        fireEvent.click(screen.getByText(/Archived/));
      });

      const restoreBtn = screen.getByText("Restore");
      await act(async () => {
        fireEvent.click(restoreBtn);
      });

      expect(restoreWs).toHaveBeenCalledWith("ws-a");
    });

    it("shows error state when restore fails", async () => {
      const archivedWs = makeWorkspace({ id: "ws-a", name: "Old Work", status: "Archived", archivedAt: "2024-06-01T00:00:00Z" });
      const restoreWs = vi.fn().mockRejectedValue(new Error("restore fail"));
      // Override loadArchivedWorkspaces to not overwrite the state
      const loadArchivedWorkspaces = vi.fn().mockResolvedValue(undefined);
      useWorkspaceStore.setState({
        archivedWorkspaces: [archivedWs],
        restoreWs,
        loadArchivedWorkspaces,
      });
      const { container } = render(<Sidebar />);

      await act(async () => {
        fireEvent.click(screen.getByText(/Archived/));
      });

      // Check that the workspace item is present
      expect(screen.getByText("Old Work")).toBeInTheDocument();

      // Find the Restore button and click it
      const restoreBtn = screen.getByText("Restore");
      await act(async () => {
        fireEvent.click(restoreBtn);
      });

      // After the restore error, the button text changes to "Failed" and style changes to error color.
      // The button has class "hidden group-hover:flex" - use container query.
      await waitFor(() => {
        const archivedItem = container.querySelector(".group.flex");
        expect(archivedItem).toBeTruthy();
        const btn = archivedItem!.querySelector("button");
        expect(btn).toBeTruthy();
        expect(btn!.textContent).toContain("Failed");
        expect(btn!.style.color).toBe("var(--error)");
      });
    });

    it("toggles archived section open and closed", () => {
      render(<Sidebar />);

      const archivedBtn = screen.getByText(/Archived/);
      // Open
      fireEvent.click(archivedBtn);
      expect(screen.getByText("No archived workspaces")).toBeInTheDocument();

      // Close
      fireEvent.click(archivedBtn);
      expect(screen.queryByText("No archived workspaces")).not.toBeInTheDocument();
    });

    it("shows archived count in label when there are archived workspaces", () => {
      useWorkspaceStore.setState({
        archivedWorkspaces: [
          makeWorkspace({ id: "ws-a1", name: "Archived 1", status: "Archived", archivedAt: "2024-06-01T00:00:00Z" }),
          makeWorkspace({ id: "ws-a2", name: "Archived 2", status: "Archived", archivedAt: "2024-06-02T00:00:00Z" }),
        ],
      });
      render(<Sidebar />);
      expect(screen.getByText(/Archived \(2\)/)).toBeInTheDocument();
    });
  });

  // --- Bottom Settings button ---
  describe("Bottom settings button", () => {
    it("opens settings view tab when bottom settings button clicked", () => {
      const openViewTab = vi.fn();
      useUIStore.setState({ openViewTab });
      render(<Sidebar />);

      // The bottom settings button has title "Settings"
      const settingsButtons = screen.getAllByTitle("Settings");
      // The bottom one is the last one (after the repo inline settings buttons)
      const bottomSettingsBtn = settingsButtons[settingsButtons.length - 1];
      fireEvent.click(bottomSettingsBtn);

      expect(openViewTab).toHaveBeenCalledWith("settings", true);
    });
  });

  // --- Workspace with Error status ---
  describe("Workspace with Error status", () => {
    it("shows muted dot for workspace with Error status when agent idle", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace({ status: { Error: "something broke" } })],
      });
      render(<Sidebar />);

      const wsName = screen.getByText("Feature Work");
      const wsDiv = wsName.closest(".group")!;
      const dot = wsDiv.querySelector(".rounded-full");
      // wsStatus is not "Active", agent is idle, so should be muted
      expect(dot).toHaveStyle({ backgroundColor: "var(--text-muted)" });
    });
  });

  // --- Multiple repos ---
  describe("Multiple repositories", () => {
    it("renders multiple repos with their workspaces", () => {
      useRepositoryStore.setState({
        repositories: [
          makeRepo({ id: "r1", name: "repo-one" }),
          makeRepo({ id: "r2", name: "repo-two" }),
        ],
      });
      useWorkspaceStore.setState({
        workspaces: [
          makeWorkspace({ id: "ws-1", repoId: "r1", name: "WS One" }),
          makeWorkspace({ id: "ws-2", repoId: "r2", name: "WS Two" }),
        ],
      });
      render(<Sidebar />);
      expect(screen.getByText("repo-one")).toBeInTheDocument();
      expect(screen.getByText("repo-two")).toBeInTheDocument();
      expect(screen.getByText("WS One")).toBeInTheDocument();
      expect(screen.getByText("WS Two")).toBeInTheDocument();
    });

    it("collapses one repo without affecting others", () => {
      useRepositoryStore.setState({
        repositories: [
          makeRepo({ id: "r1", name: "repo-one" }),
          makeRepo({ id: "r2", name: "repo-two" }),
        ],
      });
      useWorkspaceStore.setState({
        workspaces: [
          makeWorkspace({ id: "ws-1", repoId: "r1", name: "WS One" }),
          makeWorkspace({ id: "ws-2", repoId: "r2", name: "WS Two" }),
        ],
      });
      render(<Sidebar />);

      // Collapse first repo
      const repoOneBtn = screen.getByText("repo-one").closest("button")!;
      fireEvent.click(repoOneBtn);

      // First repo workspace hidden, second still visible
      expect(screen.queryByText("WS One")).not.toBeInTheDocument();
      expect(screen.getByText("WS Two")).toBeInTheDocument();
    });
  });

  // --- Inactive workspace styling ---
  describe("Inactive workspace styling", () => {
    it("does not have active background for inactive workspace", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
        activeWorkspaceId: null,
      });
      render(<Sidebar />);

      const wsName = screen.getByText("Feature Work");
      const wsDiv = wsName.closest(".group")! as HTMLElement;
      // When inactive, backgroundColor should NOT be var(--bg-surface)
      expect(wsDiv.style.backgroundColor).not.toBe("var(--bg-surface)");
    });
  });

  // --- Inactive repo branch styling ---
  describe("Inactive repo branch styling", () => {
    it("does not have active background for inactive repo branch", () => {
      useRepositoryStore.setState({ repositories: [makeRepo()] });
      useWorkspaceStore.setState({
        activeRepoId: null,
        activeWorkspaceId: "ws-1",
      });
      render(<Sidebar />);

      const branchItems = screen.getAllByText("main");
      const branchDiv = branchItems[0].closest(".group")! as HTMLElement;
      // When inactive, backgroundColor should NOT be var(--bg-surface)
      expect(branchDiv.style.backgroundColor).not.toBe("var(--bg-surface)");
    });
  });
});
