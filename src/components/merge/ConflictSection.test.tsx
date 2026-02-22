import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConflictSection } from "./ConflictSection";
import { useMergeStore } from "../../stores/mergeStore";
import { useAgentStore } from "../../stores/agentStore";

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="alert-icon" />,
  CheckCircle: () => <span data-testid="check-icon" />,
  XCircle: () => <span data-testid="x-icon" />,
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
          { path: "src/file1.ts", conflictType: "BothModified" },
          { path: "src/file2.ts", conflictType: "DeletedByUs" },
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
          { path: "src/file1.ts", conflictType: "BothModified" },
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
          { path: "src/file1.ts", conflictType: "BothModified" },
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
          { path: "src/file1.ts", conflictType: "BothModified" },
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
          { path: "src/file1.ts", conflictType: "BothModified" },
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
          { path: "src/file1.ts", conflictType: "BothModified" },
        ],
      },
      error: { "ws-1": "Merge failed" },
    });
    render(<ConflictSection workspaceId="ws-1" />);
    expect(screen.getByText("Merge failed")).toBeInTheDocument();
  });
});
