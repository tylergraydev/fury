import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LinkWorkspaceDialog } from "./LinkWorkspaceDialog";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";

const mockGetLinkedWorkspaces = vi.fn().mockResolvedValue([]);
const mockLinkWorkspaces = vi.fn().mockResolvedValue(undefined);
const mockUnlinkWorkspaces = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/tauri", () => ({
  getLinkedWorkspaces: (...args: unknown[]) => mockGetLinkedWorkspaces(...args),
  linkWorkspaces: (...args: unknown[]) => mockLinkWorkspaces(...args),
  unlinkWorkspaces: (...args: unknown[]) => mockUnlinkWorkspaces(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  listRepositories: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", repoId: "r1", name: "Workspace 1", branch: "main", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      { id: "ws-2", repoId: "r2", name: "Workspace 2", branch: "dev", status: "Active", portBase: 3001, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      { id: "ws-3", repoId: "r2", name: "Workspace 3", branch: "feature", status: "Active", portBase: 3002, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
    ],
  });
  useRepositoryStore.setState({
    repositories: [
      { id: "r1", name: "Repo 1", path: "/path/r1", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null },
      { id: "r2", name: "Repo 2", path: "/path/r2", defaultBranch: "main", currentBranch: "main", provider: "git_hub" as const, remoteUrl: null },
    ],
  });
  vi.clearAllMocks();
});

describe("LinkWorkspaceDialog", () => {
  it("renders dialog title", async () => {
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Link Workspaces")).toBeInTheDocument();
  });

  it("shows workspace name in description", async () => {
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Workspace 1")).toBeInTheDocument();
  });

  it("shows Done button", async () => {
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockGetLinkedWorkspaces.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows other repo workspaces after loading", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    // Workspaces from r2 (different repo) should appear
    await waitFor(() => {
      expect(screen.getByText("Workspace 2")).toBeInTheDocument();
      expect(screen.getByText("Workspace 3")).toBeInTheDocument();
    });
  });

  it("groups workspaces by repo name", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Repo 2")).toBeInTheDocument();
    });
  });

  it("calls onClose when Done is clicked", async () => {
    const onClose = vi.fn();
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={onClose}
      />,
    );
    screen.getByText("Done").click();
    expect(onClose).toHaveBeenCalled();
  });

  // --- New tests for full coverage ---

  it("shows error when getLinkedWorkspaces fails", async () => {
    mockGetLinkedWorkspaces.mockRejectedValueOnce(new Error("Load linked failed"));
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Load linked failed/)).toBeInTheDocument();
    });
  });

  it("shows Link button for unlinked workspaces", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Workspace 2")).toBeInTheDocument();
    });
    // Both should have Link buttons
    const linkButtons = screen.getAllByText("Link");
    expect(linkButtons).toHaveLength(2);
  });

  it("shows Unlink button for already-linked workspaces", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue(["ws-2"]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Unlink")).toBeInTheDocument();
    });
    // ws-2 should show Unlink, ws-3 should show Link
    expect(screen.getByText("Unlink")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();
  });

  it("links a workspace when Link button is clicked", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Workspace 2")).toBeInTheDocument();
    });

    const linkButtons = screen.getAllByText("Link");
    fireEvent.click(linkButtons[0]); // Link ws-2

    await waitFor(() => {
      expect(mockLinkWorkspaces).toHaveBeenCalledWith("ws-1", "ws-2");
    });

    // After linking, it should show Unlink for that workspace
    await waitFor(() => {
      expect(screen.getByText("Unlink")).toBeInTheDocument();
    });
  });

  it("unlinks a workspace when Unlink button is clicked", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue(["ws-2"]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Unlink")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Unlink"));

    await waitFor(() => {
      expect(mockUnlinkWorkspaces).toHaveBeenCalledWith("ws-1", "ws-2");
    });

    // After unlinking, should show Link again
    await waitFor(() => {
      const linkButtons = screen.getAllByText("Link");
      expect(linkButtons).toHaveLength(2);
    });
  });

  it("shows error when link fails", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    mockLinkWorkspaces.mockRejectedValueOnce(new Error("Link error"));
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Workspace 2")).toBeInTheDocument();
    });

    const linkButtons = screen.getAllByText("Link");
    fireEvent.click(linkButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Link error/)).toBeInTheDocument();
    });
  });

  it("shows error when unlink fails", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue(["ws-2"]);
    mockUnlinkWorkspaces.mockRejectedValueOnce(new Error("Unlink error"));
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Unlink")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Unlink"));

    await waitFor(() => {
      expect(screen.getByText(/Unlink error/)).toBeInTheDocument();
    });
  });

  it("shows branch name next to workspace name", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("dev")).toBeInTheDocument();
      expect(screen.getByText("feature")).toBeInTheDocument();
    });
  });

  it("calls onClose when clicking backdrop overlay", () => {
    const onClose = vi.fn();
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={onClose}
      />,
    );
    const backdrop = screen.getByText("Link Workspaces").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside dialog", () => {
    const onClose = vi.fn();
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("Link Workspaces"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows 'No workspaces from other repos available to link' when no other repos", async () => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "r1", name: "Workspace 1", branch: "main", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      ],
    });
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("No workspaces from other repos available to link.")).toBeInTheDocument();
    });
  });

  it("shows repo ID when repo is not found in repositories", async () => {
    useRepositoryStore.setState({
      repositories: [], // Empty - no repo matches
    });
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      // Should fall back to showing the repo ID
      expect(screen.getByText("r2")).toBeInTheDocument();
    });
  });

  it("clears error when a new link action succeeds", async () => {
    mockGetLinkedWorkspaces.mockResolvedValue([]);
    mockLinkWorkspaces.mockRejectedValueOnce(new Error("Link error"));
    render(
      <LinkWorkspaceDialog
        workspaceId="ws-1"
        workspaceName="Workspace 1"
        repoId="r1"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Workspace 2")).toBeInTheDocument();
    });

    // First link attempt fails
    const linkButtons = screen.getAllByText("Link");
    fireEvent.click(linkButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(/Link error/)).toBeInTheDocument();
    });

    // Second attempt succeeds (mock is reset to default)
    mockLinkWorkspaces.mockResolvedValueOnce(undefined);
    const linkButtons2 = screen.getAllByText("Link");
    fireEvent.click(linkButtons2[0]);
    await waitFor(() => {
      expect(screen.queryByText(/Link error/)).not.toBeInTheDocument();
    });
  });
});
