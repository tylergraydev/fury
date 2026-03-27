import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiffPanel } from "./DiffPanel";
import { useDiffStore } from "../../stores/diffStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: (props: Record<string, unknown>) => (
    <div
      data-testid="diff-editor"
      data-original={props.original}
      data-modified={props.modified}
      data-language={props.language}
    />
  ),
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "custom-theme",
  configureMonacoTheme: vi.fn(),
}));

describe("DiffPanel", () => {
  beforeEach(() => {
    useDiffStore.setState({
      selectedFile: {},
      fileDiffs: {},
      diffResults: {},
      loading: {},
    });
    useWorkspaceStore.setState({
      activeWorkspaceId: "ctx1",
    });
  });

  it("shows empty state when no files and no selection", () => {
    useDiffStore.setState({ diffResults: { ctx1: { files: [], totalAdditions: 0, totalDeletions: 0 } } });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("No changes to display")).toBeInTheDocument();
    expect(screen.getByText("No changes detected")).toBeInTheDocument();
  });

  it("shows file list with prompt to select when files exist but none selected", () => {
    useDiffStore.setState({
      diffResults: {
        ctx1: {
          files: [{ path: "src/foo.ts", status: "Modified", additions: 5, deletions: 2 }],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("Select a file to view its diff")).toBeInTheDocument();
    expect(screen.getByText("foo.ts")).toBeInTheDocument();
    expect(screen.getByText("Changed files (1)")).toBeInTheDocument();
  });

  it("shows status badges for changed files", () => {
    useDiffStore.setState({
      diffResults: {
        ctx1: {
          files: [
            { path: "src/added.ts", status: "Added", additions: 10, deletions: 0 },
            { path: "src/deleted.ts", status: "Deleted", additions: 0, deletions: 5 },
            { path: "src/modified.ts", status: "Modified", additions: 3, deletions: 1 },
          ],
          totalAdditions: 13,
          totalDeletions: 6,
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("renders filename header and diff editor when file and diff data exist", () => {
    useDiffStore.setState({
      selectedFile: { ctx1: "src/foo.ts" },
      fileDiffs: {
        "ctx1:src/foo.ts": {
          path: "src/foo.ts",
          original: "old code",
          modified: "new code",
          language: "typescript",
        },
      },
      diffResults: {
        ctx1: {
          files: [{ path: "src/foo.ts", status: "Modified", additions: 1, deletions: 1 }],
          totalAdditions: 1,
          totalDeletions: 1,
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument();
  });

  it("passes correct props to DiffEditor", () => {
    useDiffStore.setState({
      selectedFile: { ctx1: "src/foo.ts" },
      fileDiffs: {
        "ctx1:src/foo.ts": {
          path: "src/foo.ts",
          original: "old",
          modified: "new",
          language: "typescript",
        },
      },
      diffResults: {
        ctx1: {
          files: [{ path: "src/foo.ts", status: "Modified", additions: 1, deletions: 0 }],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    const editor = screen.getByTestId("diff-editor");
    expect(editor).toHaveAttribute("data-original", "old");
    expect(editor).toHaveAttribute("data-modified", "new");
    expect(editor).toHaveAttribute("data-language", "typescript");
  });

  it("clicking a file in the list calls selectFile", () => {
    const selectFile = vi.fn();
    useDiffStore.setState({
      diffResults: {
        ctx1: {
          files: [{ path: "src/bar.ts", status: "Added", additions: 3, deletions: 0 }],
          totalAdditions: 3,
          totalDeletions: 0,
        },
      },
      selectFile,
    });
    render(<DiffPanel contextId="ctx1" />);
    fireEvent.click(screen.getByText("bar.ts"));
    expect(selectFile).toHaveBeenCalledWith("ctx1", "src/bar.ts");
  });

  it("loads diff on mount if not already loaded", () => {
    const loadDiff = vi.fn();
    useDiffStore.setState({ loadDiff });
    render(<DiffPanel contextId="ctx1" />);
    expect(loadDiff).toHaveBeenCalledWith("ctx1");
  });

  it("loads repo diff for repo context", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "other-ws" });
    const loadRepoDiff = vi.fn();
    useDiffStore.setState({ loadRepoDiff });
    render(<DiffPanel contextId="repo1" />);
    expect(loadRepoDiff).toHaveBeenCalledWith("repo1");
  });

  it("does not reload diff if already present", () => {
    const loadDiff = vi.fn();
    useDiffStore.setState({
      diffResults: { ctx1: { files: [], totalAdditions: 0, totalDeletions: 0 } },
      loadDiff,
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(loadDiff).not.toHaveBeenCalled();
  });

  it("shows Untracked status label", () => {
    useDiffStore.setState({
      diffResults: {
        ctx1: {
          files: [{ path: "new-file.ts", status: "Untracked", additions: 0, deletions: 0 }],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("U")).toBeInTheDocument();
  });

  it("shows Renamed status label", () => {
    useDiffStore.setState({
      diffResults: {
        ctx1: {
          files: [{ path: "new-name.ts", status: { Renamed: { from: "old-name.ts" } }, additions: 0, deletions: 0 }],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffPanel contextId="ctx1" />);
    expect(screen.getByText("R")).toBeInTheDocument();
  });
});
