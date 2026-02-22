import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BranchSyncSection } from "./BranchSyncSection";
import { useMergeStore } from "../../stores/mergeStore";

vi.mock("lucide-react", () => ({
  GitBranch: () => <span data-testid="branch-icon" />,
  ArrowDown: () => <span data-testid="arrow-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  AlertTriangle: () => <span data-testid="alert-icon" />,
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
});
