import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MergeView, MergeViewWrapper } from "./MergeView";
import { useMergeStore } from "../../stores/mergeStore";
import { useStashStore } from "../../stores/stashStore";

vi.mock("lucide-react", () => ({
  GitMerge: () => <span data-testid="merge-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  GitCompare: () => <span data-testid="compare-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
  Archive: () => <span data-testid="archive-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FileText: () => <span data-testid="icon-filetext" />,
  FolderSearch: () => <span data-testid="icon-foldersearch" />,
  Globe: () => <span data-testid="icon-globe" />,
  ListChecks: () => <span data-testid="icon-listchecks" />,
  ListPlus: () => <span data-testid="icon-listplus" />,
  NotebookPen: () => <span data-testid="icon-notebookpen" />,
  Pencil: () => <span data-testid="icon-pencil" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,

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
vi.mock("./StashSection", () => ({
  StashSection: () => <div data-testid="stash-section">Stash Section</div>,
}));

vi.mock("../../lib/tauri", () => ({
  loadConflictedFiles: vi.fn().mockResolvedValue([]),
  loadBranchStatus: vi.fn().mockResolvedValue(null),
  listStashes: vi.fn().mockResolvedValue([]),
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
  useStashStore.setState({
    stashes: {},
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
    expect(screen.getByText("Stash")).toBeInTheDocument();
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

  it("switches to Stash section on click", () => {
    render(<MergeView workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Stash"));
    expect(screen.getByTestId("stash-section")).toBeInTheDocument();
  });

  it("shows conflict count badge when conflicts exist", () => {
    useMergeStore.setState({
      conflictedFiles: { "ws-1": [{ path: "file1.ts", conflictType: "BothModified" }, { path: "file2.ts", conflictType: "BothModified" }] },
    });
    render(<MergeView workspaceId="ws-1" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not show conflict badge when count is 0", () => {
    useMergeStore.setState({
      conflictedFiles: { "ws-1": [] },
    });
    render(<MergeView workspaceId="ws-1" />);
    // There should be no badge number
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows stash count badge when stashes exist", () => {
    useStashStore.setState({
      stashes: {
        "ws-1": [
          { index: 0, message: "s1", branch: "main", timestamp: "" },
          { index: 1, message: "s2", branch: "main", timestamp: "" },
          { index: 2, message: "s3", branch: "main", timestamp: "" },
        ],
      },
    });
    render(<MergeView workspaceId="ws-1" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show stash badge when count is 0", () => {
    useStashStore.setState({
      stashes: { "ws-1": [] },
    });
    useMergeStore.setState({
      conflictedFiles: { "ws-1": [] },
    });
    render(<MergeView workspaceId="ws-1" />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("MergeViewWrapper", () => {
  it("renders the no-workspace message", () => {
    render(<MergeViewWrapper />);
    expect(screen.getByText("Select a workspace to use merge tools")).toBeInTheDocument();
    expect(screen.getByTestId("merge-icon")).toBeInTheDocument();
  });
});
