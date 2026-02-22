import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({ original, modified }: any) => (
    <div data-testid="diff-editor">{original} | {modified}</div>
  ),
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "custom-dark",
  configureMonacoTheme: vi.fn(),
}));

import { ChangesPanel } from "./ChangesPanel";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getFileDiff: vi.fn().mockResolvedValue(null),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoFileDiff: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockLoadDiff = vi.fn();
const mockLoadRepoDiff = vi.fn();
const mockRefresh = vi.fn();
const mockRefreshRepo = vi.fn();
const mockSelectFile = vi.fn();
const mockSelectRepoFile = vi.fn();

beforeEach(() => {
  useDiffStore.setState({
    diffResults: {},
    selectedFile: {},
    fileDiffs: {},
    loading: false,
    error: null,
    loadDiff: mockLoadDiff,
    loadRepoDiff: mockLoadRepoDiff,
    refresh: mockRefresh,
    refreshRepo: mockRefreshRepo,
    selectFile: mockSelectFile,
    selectRepoFile: mockSelectRepoFile,
  });
  useAgentStore.setState({ agents: {} });
  vi.clearAllMocks();
});

describe("ChangesPanel", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };
  const repoContext = { id: "repo-1", type: "repo" as const };

  it("shows no changes when empty", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useDiffStore.setState({ loading: true });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Loading changes...")).toBeInTheDocument();
  });

  it("shows file count in summary", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 10, deletions: 3 },
            { path: "src/new.ts", status: "Added", additions: 20, deletions: 0 },
          ],
          totalAdditions: 30,
          totalDeletions: 3,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("shows file names from paths", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/components/app.ts", status: "Modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  it("shows status labels (M for Modified, A for Added)", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/mod.ts", status: "Modified", additions: 1, deletions: 1 },
            { path: "src/new.ts", status: "Added", additions: 5, deletions: 0 },
          ],
          totalAdditions: 6,
          totalDeletions: 1,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows Refresh button", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("shows single file with correct count", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/only.ts", status: "Modified", additions: 7, deletions: 0 },
          ],
          totalAdditions: 7,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("calls loadDiff for workspace context on mount", () => {
    render(<ChangesPanel context={wsContext} />);
    expect(mockLoadDiff).toHaveBeenCalledWith("ws-1");
  });

  it("calls loadRepoDiff for repo context on mount", () => {
    render(<ChangesPanel context={repoContext} />);
    expect(mockLoadRepoDiff).toHaveBeenCalledWith("repo-1");
  });

  it("refreshes workspace when agent goes idle", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: "s1", status: "Idle", startedAt: null },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(mockRefresh).toHaveBeenCalledWith("ws-1");
  });

  it("refreshes repo when agent goes idle", () => {
    useAgentStore.setState({
      agents: {
        "repo-1": { workspaceId: "repo-1", sessionId: "s1", status: "Idle", startedAt: null },
      },
    });
    render(<ChangesPanel context={repoContext} />);
    expect(mockRefreshRepo).toHaveBeenCalledWith("repo-1");
  });

  it("clicking a file calls selectFile for workspace context and shows diff modal", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    fireEvent.click(screen.getByText("app.ts"));
    expect(mockSelectFile).toHaveBeenCalledWith("ws-1", "src/app.ts");
  });

  it("clicking a file calls selectRepoFile for repo context", () => {
    useDiffStore.setState({
      diffResults: {
        "repo-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={repoContext} />);
    fireEvent.click(screen.getByText("app.ts"));
    expect(mockSelectRepoFile).toHaveBeenCalledWith("repo-1", "src/app.ts");
  });

  it("clicking Refresh calls refresh for workspace context", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    fireEvent.click(screen.getByText("Refresh"));
    expect(mockRefresh).toHaveBeenCalledWith("ws-1");
  });

  it("clicking Refresh calls refreshRepo for repo context", () => {
    useDiffStore.setState({
      diffResults: {
        "repo-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={repoContext} />);
    fireEvent.click(screen.getByText("Refresh"));
    expect(mockRefreshRepo).toHaveBeenCalledWith("repo-1");
  });

  it("shows Deleted and Untracked status labels", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/del.ts", status: "Deleted", additions: 0, deletions: 5 },
            { path: "src/untrack.ts", status: "Untracked", additions: 3, deletions: 0 },
          ],
          totalAdditions: 3,
          totalDeletions: 5,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("U")).toBeInTheDocument();
  });

  it("shows Renamed status label", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/renamed.ts", status: { Renamed: { from: "src/old.ts" } }, additions: 0, deletions: 0 },
          ],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("shows unknown status with ? label", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/weird.ts", status: "SomethingElse" as any, additions: 0, deletions: 0 },
          ],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("shows error message when there is an error and no diff result", () => {
    useDiffStore.setState({ error: "Network error" });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("shows diff modal when file is clicked and fileDiff exists", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
      selectedFile: { "ws-1": "src/app.ts" },
      fileDiffs: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          original: "old code",
          modified: "new code",
          language: "typescript",
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    // Click the file to open the diff modal
    fireEvent.click(screen.getByText("app.ts"));
    // The diff modal should show
    expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("closes diff modal when Close button is clicked", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
      selectedFile: { "ws-1": "src/app.ts" },
      fileDiffs: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          original: "old",
          modified: "new",
          language: "typescript",
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    fireEvent.click(screen.getByText("app.ts")); // Open modal
    expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close")); // Close modal
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });

  it("closes diff modal when clicking overlay backdrop", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
      selectedFile: { "ws-1": "src/app.ts" },
      fileDiffs: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          original: "old",
          modified: "new",
          language: "typescript",
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    fireEvent.click(screen.getByText("app.ts")); // Open modal
    // Click the overlay backdrop (the outer fixed div)
    const overlay = screen.getByTestId("diff-editor").closest(".fixed");
    if (overlay) fireEvent.click(overlay);
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });

  it("does not close modal when clicking inside the modal content", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
      selectedFile: { "ws-1": "src/app.ts" },
      fileDiffs: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          original: "old",
          modified: "new",
          language: "typescript",
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    fireEvent.click(screen.getByText("app.ts")); // Open modal
    // Click inside the modal content (e.g., on the diff editor)
    fireEvent.click(screen.getByTestId("diff-editor"));
    // Modal should still be open
    expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
  });

  it("shows file-level addition and deletion counts", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 8, deletions: 4 },
          ],
          totalAdditions: 99,
          totalDeletions: 88,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("+8")).toBeInTheDocument();
    expect(screen.getByText("-4")).toBeInTheDocument();
  });

  it("highlights selected file", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "Modified", additions: 1, deletions: 0 },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
      selectedFile: { "ws-1": "src/app.ts" },
    });
    render(<ChangesPanel context={wsContext} />);
    const btn = screen.getByText("app.ts").closest("button");
    expect(btn).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
  });
});
