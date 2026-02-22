import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MergeView } from "./MergeView";
import { useMergeStore } from "../../stores/mergeStore";

vi.mock("lucide-react", () => ({
  GitMerge: () => <span data-testid="merge-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  GitCompare: () => <span data-testid="compare-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
}));

vi.mock("./BranchSyncSection", () => ({
  BranchSyncSection: () => <div data-testid="branch-sync">Branch Sync</div>,
}));
vi.mock("./WorktreeCompareSection", () => ({
  WorktreeCompareSection: () => <div data-testid="worktree-compare">Worktree Compare</div>,
}));
vi.mock("./ConflictSection", () => ({
  ConflictSection: () => <div data-testid="conflict-section">Conflict Section</div>,
}));

vi.mock("../../lib/tauri", () => ({
  loadConflictedFiles: vi.fn().mockResolvedValue([]),
  loadBranchStatus: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useMergeStore.setState({
    activeSection: {},
    conflictedFiles: {},
    branchStatus: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

describe("MergeView", () => {
  it("renders section tabs", () => {
    render(<MergeView workspaceId="ws-1" />);
    expect(screen.getByText("Sync")).toBeInTheDocument();
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("Conflicts")).toBeInTheDocument();
  });

  it("shows BranchSyncSection by default", () => {
    render(<MergeView workspaceId="ws-1" />);
    expect(screen.getByTestId("branch-sync")).toBeInTheDocument();
  });

  it("switches to Compare section on click", () => {
    render(<MergeView workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Compare"));
    expect(screen.getByTestId("worktree-compare")).toBeInTheDocument();
  });

  it("switches to Conflicts section on click", () => {
    render(<MergeView workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Conflicts"));
    expect(screen.getByTestId("conflict-section")).toBeInTheDocument();
  });

  it("shows conflict count badge when conflicts exist", () => {
    useMergeStore.setState({
      conflictedFiles: { "ws-1": [{ path: "file1.ts", conflictType: "BothModified" }, { path: "file2.ts", conflictType: "BothModified" }] },
    });
    render(<MergeView workspaceId="ws-1" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
