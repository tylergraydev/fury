import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({ original, modified }: any) => (
    <div data-testid="diff-editor">
      {original} → {modified}
    </div>
  ),
}));

vi.mock("../../lib/monacoTheme", () => ({
  MONACO_THEME: "test-theme",
  configureMonacoTheme: vi.fn(),
}));

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  }),
  getFileDiff: vi.fn().mockResolvedValue({
    original: "",
    modified: "",
    language: "text",
  }),
  getRepoDiff: vi.fn().mockResolvedValue({
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  }),
  getRepoFileDiff: vi.fn().mockResolvedValue({
    original: "",
    modified: "",
    language: "text",
  }),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { DiffViewer } from "./DiffViewer";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";

const mockLoadDiff = vi.fn();
const mockRefresh = vi.fn();
const mockSelectFile = vi.fn();

beforeEach(() => {
  useDiffStore.setState({
    diffResults: {},
    selectedFile: {},
    fileDiffs: {},
    loading: {},
    error: {},
    loadDiff: mockLoadDiff,
    refresh: mockRefresh,
    selectFile: mockSelectFile,
  });
  useAgentStore.setState({ agents: {} });
  vi.clearAllMocks();
});

describe("DiffViewer", () => {
  it("shows Loading diff... when loading with no result", () => {
    useDiffStore.setState({ loading: { "ws-1": true } });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("Loading diff...")).toBeInTheDocument();
  });

  it("shows No changes when diffResult is null", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": null },
      loading: {},
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("shows No changes when diffResult has empty files array", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 },
      },
      loading: {},
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("shows file count and stats in header", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 10,
              deletions: 0,
            },
            {
              path: "src/new.ts",
              status: "Added",
              additions: 20,
              deletions: 0,
            },
          ],
          totalAdditions: 30,
          totalDeletions: 7,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("2 files changed")).toBeInTheDocument();
    expect(screen.getByText("+30")).toBeInTheDocument();
    expect(screen.getByText("-7")).toBeInTheDocument();
  });

  it("shows Refresh button", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 0,
            },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("clicking Refresh calls refresh", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 0,
            },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("Refresh"));
    expect(mockRefresh).toHaveBeenCalledWith("ws-1");
  });

  it("shows file list with status labels", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/mod.ts",
              status: "Modified",
              additions: 1,
              deletions: 1,
            },
            {
              path: "src/new.ts",
              status: "Added",
              additions: 5,
              deletions: 0,
            },
            {
              path: "src/old.ts",
              status: "Deleted",
              additions: 0,
              deletions: 10,
            },
            {
              path: "src/unknown.ts",
              status: "Untracked",
              additions: 3,
              deletions: 0,
            },
          ],
          totalAdditions: 9,
          totalDeletions: 11,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("U")).toBeInTheDocument();
    expect(screen.getByText("src/mod.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
  });

  it("shows Select a file to view diff when no file selected", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 0,
            },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(
      screen.getByText("Select a file to view diff"),
    ).toBeInTheDocument();
  });

  it("clicking a file calls selectFile", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 0,
            },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    fireEvent.click(screen.getByText("src/app.ts"));
    expect(mockSelectFile).toHaveBeenCalledWith("ws-1", "src/app.ts");
  });

  it("calls loadDiff on mount", () => {
    render(<DiffViewer workspaceId="ws-1" />);
    expect(mockLoadDiff).toHaveBeenCalledWith("ws-1");
  });

  it("shows Renamed status label and color", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/renamed.ts",
              status: { Renamed: { from: "src/old.ts" } },
              additions: 0,
              deletions: 0,
            },
          ],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("shows unknown status with ? label", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/weird.ts",
              status: "SomethingElse" as any,
              additions: 0,
              deletions: 0,
            },
          ],
          totalAdditions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders DiffEditor when file diff is available", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 0,
            },
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
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
    expect(screen.getByText(/old code/)).toBeInTheDocument();
    expect(screen.getByText(/new code/)).toBeInTheDocument();
  });

  it("highlights selected file in list", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 0,
            },
          ],
          totalAdditions: 1,
          totalDeletions: 0,
        },
      },
      selectedFile: { "ws-1": "src/app.ts" },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    const fileButton = screen.getByText("src/app.ts").closest("button");
    expect(fileButton).toHaveStyle({ backgroundColor: "var(--bg-surface)" });
  });

  it("auto-refreshes when agent status goes to Idle", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": {
          workspaceId: "ws-1",
          sessionId: "s1",
          status: "Idle",
          startedAt: null,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    // When agent status is Idle on mount, the refresh effect fires
    expect(mockRefresh).toHaveBeenCalledWith("ws-1");
  });

  it("shows 1 file changed (singular)", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 1,
              deletions: 1,
            },
          ],
          totalAdditions: 1,
          totalDeletions: 1,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    expect(screen.getByText("1 file changed")).toBeInTheDocument();
  });

  it("shows file-level addition and deletion counts", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            {
              path: "src/app.ts",
              status: "Modified",
              additions: 7,
              deletions: 4,
            },
          ],
          totalAdditions: 99,
          totalDeletions: 88,
        },
      },
    });
    render(<DiffViewer workspaceId="ws-1" />);
    // File-level counts are separate from total header counts
    expect(screen.getByText("+7")).toBeInTheDocument();
    expect(screen.getByText("-4")).toBeInTheDocument();
    // Total header counts
    expect(screen.getByText("+99")).toBeInTheDocument();
    expect(screen.getByText("-88")).toBeInTheDocument();
  });
});
