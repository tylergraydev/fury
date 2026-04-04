import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConflictSection } from "./ConflictSection";
import { useMergeStore } from "../../stores/mergeStore";
import { useAgentStore } from "../../stores/agentStore";

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="alert-icon" />,
  CheckCircle: () => <span data-testid="check-icon" />,
  XCircle: () => <span data-testid="x-icon" />,
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

vi.mock("./ConflictResolver", () => ({
  ConflictResolver: ({ conflict }: any) => (
    <div data-testid="conflict-resolver">{conflict.path}</div>
  ),
}));

vi.mock("../../lib/tauri", () => ({
  getConflictedFiles: vi.fn().mockResolvedValue([]),
  getConflictContent: vi.fn().mockResolvedValue(null),
  resolveConflict: vi.fn().mockResolvedValue(undefined),
  abortMerge: vi.fn().mockResolvedValue(undefined),
  continueMerge: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useMergeStore.setState({
    conflictedFiles: {},
    selectedConflictFile: {},
    conflictContent: {},
    error: {},
  });
  useAgentStore.setState({ agents: {} });
  vi.clearAllMocks();
});

import { fireEvent } from "@testing-library/react";

describe("ConflictSection", () => {
  it("shows no conflicts message when empty", () => {
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("No conflicts")).toBeInTheDocument();
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });

  it("shows conflicted file count", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
          { path: "src/file2.ts", conflictType: "deletedByUs" },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("2 conflicted files")).toBeInTheDocument();
  });

  it("shows single conflicted file with correct grammar", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("1 conflicted file")).toBeInTheDocument();
  });

  it("shows file paths in list", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("src/file1.ts")).toBeInTheDocument();
    expect(screen.getByText("Both Modified")).toBeInTheDocument();
  });

  it("shows Abort Merge button", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Abort Merge")).toBeInTheDocument();
  });

  it("shows select a file message when no file selected", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Select a file to resolve")).toBeInTheDocument();
  });

  it("shows error when present", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
      error: { "ws-1": "Merge failed" },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Merge failed")).toBeInTheDocument();
  });

  it("shows all conflict type labels", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "file1.ts", conflictType: "bothModified" },
          { path: "file2.ts", conflictType: "deletedByUs" },
          { path: "file3.ts", conflictType: "deletedByThem" },
          { path: "file4.ts", conflictType: "addedByBoth" },
          { path: "file5.ts", conflictType: "bothDeleted" },
          { path: "file6.ts", conflictType: "UnknownType" as any },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Both Modified")).toBeInTheDocument();
    expect(screen.getByText("Deleted by Us")).toBeInTheDocument();
    expect(screen.getByText("Deleted by Them")).toBeInTheDocument();
    expect(screen.getByText("Added by Both")).toBeInTheDocument();
    expect(screen.getByText("Both Deleted")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("clicking a file calls loadConflictContent", () => {
    const mockLoadConflictContent = vi.fn();
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
      loadConflictContent: mockLoadConflictContent,
    });
    render(<ConflictSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("src/file1.ts"));
    expect(mockLoadConflictContent).toHaveBeenCalledWith("ws-1", "src/file1.ts");
  });

  it("clicking Abort Merge calls abortMerge", () => {
    const mockAbortMerge = vi.fn();
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
      abortMerge: mockAbortMerge,
    });
    render(<ConflictSection workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Abort Merge"));
    expect(mockAbortMerge).toHaveBeenCalledWith("ws-1");
  });

  it("shows Continue Merge button when no conflicted files but selectedFile exists", () => {
    const mockContinueMerge = vi.fn();
    useMergeStore.setState({
      conflictedFiles: { "ws-1": [] },
      selectedConflictFile: { "ws-1": "src/file1.ts" },
      continueMerge: mockContinueMerge,
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Continue Merge")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue Merge"));
    expect(mockContinueMerge).toHaveBeenCalledWith("ws-1");
  });

  it("renders ConflictResolver when conflict content is selected", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
      selectedConflictFile: { "ws-1": "src/file1.ts" },
      conflictContent: {
        "ws-1:src/file1.ts": {
          path: "src/file1.ts",
          ours: "our content",
          theirs: "their content",
          base: "base content",
          merged: "",
          language: "typescript",
        },
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByTestId("conflict-resolver")).toBeInTheDocument();
  });

  it("highlights selected file", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
      selectedConflictFile: { "ws-1": "src/file1.ts" },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    const btn = screen.getByText("src/file1.ts").closest("button");
    expect(btn).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
  });

  it("auto-refreshes conflicts when agent goes idle", () => {
    const mockLoadConflictedFiles = vi.fn();
    useMergeStore.setState({ loadConflictedFiles: mockLoadConflictedFiles });
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: "s1", status: "Idle", startedAt: null, pid: null, disablePlanMode: false },
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(mockLoadConflictedFiles).toHaveBeenCalledWith("ws-1");
  });

  it("fileDiffKey is null when no file selected", () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "src/file1.ts", conflictType: "bothModified" },
        ],
      },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Select a file to resolve")).toBeInTheDocument();
  });
});
