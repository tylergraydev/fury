import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
      { id: "ws-1", repoId: "r1", name: "Workspace 1", branch: "main", status: "Active", portBase: 3000, autoCommit: false, createdAt: "2024-01-01", archivedAt: null },
      { id: "ws-2", repoId: "r2", name: "Workspace 2", branch: "dev", status: "Active", portBase: 3001, autoCommit: false, createdAt: "2024-01-01", archivedAt: null },
      { id: "ws-3", repoId: "r2", name: "Workspace 3", branch: "feature", status: "Active", portBase: 3002, autoCommit: false, createdAt: "2024-01-01", archivedAt: null },
    ],
  });
  useRepositoryStore.setState({
    repositories: [
      { id: "r1", name: "Repo 1", path: "/path/r1", defaultBranch: "main", currentBranch: "main" },
      { id: "r2", name: "Repo 2", path: "/path/r2", defaultBranch: "main", currentBranch: "main" },
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
});
