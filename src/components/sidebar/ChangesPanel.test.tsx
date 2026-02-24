import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ChangesPanel } from "./ChangesPanel";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUIStore } from "../../stores/uiStore";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getFileDiff: vi.fn().mockResolvedValue(null),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoFileDiff: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockResolvedValue(() => {}),
  getPrInfo: vi.fn().mockResolvedValue(null),
  getPrChecks: vi.fn().mockResolvedValue([]),
  pushChanges: vi.fn().mockResolvedValue(undefined),
  fixFailingChecks: vi.fn().mockResolvedValue("No failing checks found."),
  mergePr: vi.fn().mockResolvedValue({ merged: true }),
  createPr: vi.fn().mockResolvedValue({ prNumber: 1, prUrl: "", title: "", state: "OPEN", checks: [], mergeable: null }),
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
    loading: {},
    error: {},
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
    useDiffStore.setState({ loading: { "ws-1": true } });
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
    useDiffStore.setState({ error: { "ws-1": "Network error" } });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("opens diff view tab when file is clicked", () => {
    const mockOpenViewTab = vi.fn();
    useUIStore.setState({ openViewTab: mockOpenViewTab });
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
    expect(mockOpenViewTab).toHaveBeenCalledWith("diff", true);
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
