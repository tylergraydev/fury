import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({ original, modified }: any) => (
    <div data-testid="diff-editor">{original} → {modified}</div>
  ),
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "test-theme",
  configureMonacoTheme: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  Link2: () => <span data-testid="link-icon" />,
  GitCompare: () => <span data-testid="git-compare-icon" />,
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

vi.mock("../../lib/tauri", () => ({
  getLinkedWorkspaces: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { WorktreeCompareSection } from "./WorktreeCompareSection";
import { useMergeStore } from "../../stores/mergeStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { getLinkedWorkspaces } from "../../lib/tauri";

beforeEach(() => {
  useMergeStore.setState({
    conflictedFiles: {},
    conflictContent: {},
    loading: {},
    error: {},
    branchStatus: {},
    comparisonTarget: {},
    comparisonDiff: {},
    comparisonSelectedFile: {},
    comparisonFileDiff: {},
    activeSection: {},
    selectedConflictFile: {},
  });
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", name: "main-ws", branch: "main", repoId: "r1" },
      { id: "ws-2", name: "feature-ws", branch: "feature", repoId: "r1" },
    ] as any,
    activeWorkspaceId: "ws-1",
  });
  vi.clearAllMocks();
});

describe("WorktreeCompareSection", () => {
  it("shows loading state initially", () => {
    // Default mock resolves to [] but we want to see the loading state before it resolves
    vi.mocked(getLinkedWorkspaces).mockReturnValue(new Promise(() => {}));
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    expect(screen.getByText("Loading linked workspaces...")).toBeInTheDocument();
  });

  it("shows empty state when no linked workspaces", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue([]);
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No linked workspaces")).toBeInTheDocument();
    });
    expect(screen.getByTestId("link-icon")).toBeInTheDocument();
  });

  it("shows 'Compare with:' dropdown when linked workspaces exist", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Compare with:")).toBeInTheDocument();
    });
  });

  it("dropdown contains linked workspace options", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("feature-ws (feature)")).toBeInTheDocument();
    });
    // Also verify the default placeholder option
    expect(screen.getByText("Select workspace...")).toBeInTheDocument();
  });

  it("shows 'Select a workspace to compare' when no target", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Select a workspace to compare")).toBeInTheDocument();
    });
  });

  it("shows file list when comparison diff exists", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 5, deletions: 2 },
            { path: "src/index.ts", status: "Added", additions: 10, deletions: 0 },
          ],
          totalAdditions: 15,
          totalDeletions: 2,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    });
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
  });

  it("shows 'No differences between branches' for empty diff", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No differences between branches")).toBeInTheDocument();
    });
  });

  it("shows diff stats (additions/deletions)", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 15,
          totalDeletions: 3,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("+15")).toBeInTheDocument();
    });
    expect(screen.getByText("-3")).toBeInTheDocument();
    expect(screen.getByText("1 file changed")).toBeInTheDocument();
  });

  it("shows all status labels (Deleted, Untracked, Renamed, Unknown)", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "a.ts", status: "Deleted", additions: 0, deletions: 5 },
            { path: "b.ts", status: "Untracked", additions: 3, deletions: 0 },
            { path: "c.ts", status: { Renamed: { from: "old.ts" } }, additions: 0, deletions: 0 },
            { path: "d.ts", status: "SomethingElse" as any, additions: 0, deletions: 0 },
          ],
          totalAdditions: 3,
          totalDeletions: 5,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("D")).toBeInTheDocument();
    });
    expect(screen.getByText("U")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("clicking a file calls selectComparisonFile", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    const spy = vi.spyOn(useMergeStore.getState(), "selectComparisonFile");
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("src/app.ts"));
    expect(spy).toHaveBeenCalledWith("ws-1", "src/app.ts");
    spy.mockRestore();
  });

  it("shows DiffEditor when file diff is available", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
      comparisonSelectedFile: { "ws-1": "src/app.ts" },
      comparisonFileDiff: {
        "ws-1:ws-2:src/app.ts": {
          path: "src/app.ts",
          original: "old content",
          modified: "new content",
          language: "typescript",
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
    });
  });

  it("shows 'Select a file to view diff' when no file selected", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Select a file to view diff")).toBeInTheDocument();
    });
  });

  it("shows 'Loading diff...' when loading and no comparison diff", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      loading: { "ws-1": true },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Loading diff...")).toBeInTheDocument();
    });
  });

  it("changing the dropdown calls setComparisonTarget", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    const spy = vi.spyOn(useMergeStore.getState(), "setComparisonTarget");
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Compare with:")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ws-2" } });
    expect(spy).toHaveBeenCalledWith("ws-1", "ws-2");
    spy.mockRestore();
  });

  it("does not call setComparisonTarget when empty option selected", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    const spy = vi.spyOn(useMergeStore.getState(), "setComparisonTarget");
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Compare with:")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("handles getLinkedWorkspaces failure gracefully", async () => {
    vi.mocked(getLinkedWorkspaces).mockRejectedValue(new Error("fail"));
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No linked workspaces")).toBeInTheDocument();
    });
  });

  it("shows workspace id when workspace not found in store", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-unknown"]);
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("ws-unknown")).toBeInTheDocument();
    });
  });

  it("shows file-level addition/deletion counts in file list", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 8, deletions: 3 },
          ],
          totalAdditions: 99,
          totalDeletions: 88,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("+8")).toBeInTheDocument();
    });
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("highlights selected file in file list", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
      comparisonSelectedFile: { "ws-1": "src/app.ts" },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      const btn = screen.getByText("src/app.ts").closest("button");
      expect(btn).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
    });
  });

  it("shows multiple files changed (plural)", async () => {
    vi.mocked(getLinkedWorkspaces).mockResolvedValue(["ws-2"]);
    useMergeStore.setState({
      comparisonTarget: { "ws-1": "ws-2" },
      comparisonDiff: {
        "ws-1": {
          files: [
            { path: "a.ts", status: "Modified", additions: 1, deletions: 0 },
            { path: "b.ts", status: "Added", additions: 2, deletions: 0 },
          ],
          totalAdditions: 3,
          totalDeletions: 0,
        },
      },
    });
    render(<WorktreeCompareSection workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("2 files changed")).toBeInTheDocument();
    });
  });
});
