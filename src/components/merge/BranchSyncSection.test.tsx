import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BranchSyncSection } from "./BranchSyncSection";
import { useMergeStore } from "../../stores/mergeStore";

vi.mock("lucide-react", () => ({
  GitBranch: () => <span data-testid="branch-icon" />,
  ArrowDown: () => <span data-testid="arrow-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  AlertTriangle: () => <span data-testid="alert-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FileText: () => <span data-testid="icon-filetext" />,
  FolderSearch: () => <span data-testid="icon-foldersearch" />,
  GitCompare: () => <span data-testid="icon-gitcompare" />,
  Globe: () => <span data-testid="icon-globe" />,
  ListChecks: () => <span data-testid="icon-listchecks" />,
  ListPlus: () => <span data-testid="icon-listplus" />,
  NotebookPen: () => <span data-testid="icon-notebookpen" />,
  Pencil: () => <span data-testid="icon-pencil" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,

}));

const mockGetBranchStatus = vi.fn().mockResolvedValue(null);

vi.mock("../../lib/tauri", () => ({
  getBranchStatus: (...args: unknown[]) => mockGetBranchStatus(...args),
  fetchUpstream: vi.fn().mockResolvedValue(undefined),
  pullRebase: vi.fn().mockResolvedValue(undefined),
  pullMerge: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useMergeStore.setState({
    branchStatus: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

import { fireEvent } from "@testing-library/react";

describe("BranchSyncSection", () => {
  it("shows error when load fails", async () => {
    mockGetBranchStatus.mockRejectedValueOnce(new Error("Sync failed"));
    render(<BranchSyncSection workspaceId="ws-1" />);
    expect(await screen.findByText(/Sync failed/)).toBeInTheDocument();
  });

  it("shows branch status when loaded", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 3,
      behind: 1,
      hasUpstream: true,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("feature-1")).toBeInTheDocument();
    });
  });

  it("shows no branch information when status is null", async () => {
    mockGetBranchStatus.mockResolvedValueOnce(null);
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No branch information")).toBeInTheDocument();
    });
  });

  it("shows ahead/behind counts", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 3,
      behind: 1,
      hasUpstream: true,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("3 ahead")).toBeInTheDocument();
      expect(screen.getByText("1 behind")).toBeInTheDocument();
    });
  });

  it("shows up to date when ahead and behind are 0", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "main",
      defaultBranch: "main",
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Up to date")).toBeInTheDocument();
    });
  });

  it("clicking Fetch calls fetchUpstream", async () => {
    const mockFetchUpstream = vi.fn();
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    useMergeStore.setState({ fetchUpstream: mockFetchUpstream });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fetch")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Fetch"));
    expect(mockFetchUpstream).toHaveBeenCalledWith("ws-1");
  });

  it("clicking Pull (Rebase) calls pullRebase", async () => {
    const mockPullRebase = vi.fn().mockResolvedValue(undefined);
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 3,
      hasUpstream: true,
    });
    useMergeStore.setState({ pullRebase: mockPullRebase });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pull (Rebase)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Pull (Rebase)"));
    expect(mockPullRebase).toHaveBeenCalledWith("ws-1");
  });

  it("clicking Pull (Merge) calls pullMerge", async () => {
    const mockPullMerge = vi.fn().mockResolvedValue(undefined);
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 3,
      hasUpstream: true,
    });
    useMergeStore.setState({ pullMerge: mockPullMerge });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pull (Merge)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Pull (Merge)"));
    expect(mockPullMerge).toHaveBeenCalledWith("ws-1");
  });

  it("shows 'No upstream' when hasUpstream is false", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 0,
      hasUpstream: false,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No upstream")).toBeInTheDocument();
    });
  });

  it("shows 'Tracking upstream' when hasUpstream is true", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Tracking upstream")).toBeInTheDocument();
    });
  });

  it("shows 'Loading branch status...' when loading and no status", () => {
    useMergeStore.setState({ loading: { "ws-1": true } });
    render(<BranchSyncSection workspaceId="ws-1" />);
    expect(screen.getByText("Loading branch status...")).toBeInTheDocument();
  });

  it("shows Fetching... text when loading", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 3,
      hasUpstream: true,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fetch")).toBeInTheDocument();
    });
    // Set loading
    useMergeStore.setState({ loading: { "ws-1": true } });
    await waitFor(() => {
      expect(screen.getByText("Fetching...")).toBeInTheDocument();
    });
    // The pull buttons show "Pulling..." too
    const pullingElements = screen.getAllByText("Pulling...");
    expect(pullingElements.length).toBeGreaterThan(0);
  });

  it("does not show Pull buttons when not behind", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 3,
      behind: 0,
      hasUpstream: true,
    });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fetch")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pull (Rebase)")).not.toBeInTheDocument();
    expect(screen.queryByText("Pull (Merge)")).not.toBeInTheDocument();
  });

  it("pullRebase handles rejected promise gracefully", async () => {
    const mockPullRebase = vi.fn().mockRejectedValue(new Error("conflict"));
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 3,
      hasUpstream: true,
    });
    useMergeStore.setState({ pullRebase: mockPullRebase });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pull (Rebase)")).toBeInTheDocument();
    });
    // Should not throw
    fireEvent.click(screen.getByText("Pull (Rebase)"));
    expect(mockPullRebase).toHaveBeenCalledWith("ws-1");
  });

  it("pullMerge handles rejected promise gracefully", async () => {
    const mockPullMerge = vi.fn().mockRejectedValue(new Error("conflict"));
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 0,
      behind: 3,
      hasUpstream: true,
    });
    useMergeStore.setState({ pullMerge: mockPullMerge });
    render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pull (Merge)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Pull (Merge)"));
    expect(mockPullMerge).toHaveBeenCalledWith("ws-1");
  });

  it("shows visual bar when ahead or behind", async () => {
    mockGetBranchStatus.mockResolvedValueOnce({
      branch: "feature-1",
      defaultBranch: "main",
      ahead: 5,
      behind: 3,
      hasUpstream: true,
    });
    const { container } = render(<BranchSyncSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("5 ahead")).toBeInTheDocument();
    });
    // Visual bars should be present
    const bars = container.querySelectorAll(".h-1\\.5.rounded-full");
    expect(bars.length).toBe(2);
  });
});
