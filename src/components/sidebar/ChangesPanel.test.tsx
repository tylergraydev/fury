import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { ChangesPanel } from "./ChangesPanel";
import { useDiffStore } from "../../stores/diffStore";
import { useAgentStore } from "../../stores/agentStore";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../../lib/tauri", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getFileDiff: vi.fn().mockResolvedValue(null),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoFileDiff: vi.fn().mockResolvedValue(null),
  getFilePatch: vi.fn().mockResolvedValue(null),
  getRepoFilePatch: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockResolvedValue(() => {}),
  getPrInfo: vi.fn().mockResolvedValue(null),
  getPrChecks: vi.fn().mockResolvedValue([]),
  pushChanges: vi.fn().mockResolvedValue(undefined),
  fixFailingChecks: vi.fn().mockResolvedValue("No failing checks found."),
  mergePr: vi.fn().mockResolvedValue({ merged: true }),
  createPr: vi.fn().mockResolvedValue({ prNumber: 1, prUrl: "", title: "", state: "OPEN", checks: [], mergeable: null }),
  getPrFullData: vi.fn().mockResolvedValue({ info: { workspaceId: "", prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null }, reviews: [], reviewComments: [] }),
  getReviewsAndComments: vi.fn().mockResolvedValue({ reviews: [], reviewComments: [] }),
  startDiffWatcher: vi.fn().mockResolvedValue(undefined),
  stopDiffWatcher: vi.fn().mockResolvedValue(undefined),
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
    patchPreviews: {},
    patchLoading: {},
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
            { path: "src/app.ts", status: "modified", additions: 10, deletions: 3 },
            { path: "src/new.ts", status: "added", additions: 20, deletions: 0 },
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
            { path: "src/components/app.ts", status: "modified", additions: 5, deletions: 2 },
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
            { path: "src/mod.ts", status: "modified", additions: 1, deletions: 1 },
            { path: "src/new.ts", status: "added", additions: 5, deletions: 0 },
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
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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
            { path: "src/only.ts", status: "modified", additions: 7, deletions: 0 },
          ],
          totalAdditions: 7,
          totalDeletions: 0,
        },
      },
    });
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("calls loadDiff for workspace context on mount", async () => {
    render(<ChangesPanel context={wsContext} />);
    await waitFor(() => expect(mockLoadDiff).toHaveBeenCalledWith("ws-1"));
  });

  it("calls loadRepoDiff for repo context on mount", async () => {
    render(<ChangesPanel context={repoContext} />);
    await waitFor(() => expect(mockLoadRepoDiff).toHaveBeenCalledWith("repo-1"));
  });

  it("refreshes workspace when agent transitions to idle", () => {
    // Start with agent Running
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: "s1", status: "Running", startedAt: null, pid: null },
      },
    });
    const { rerender } = render(<ChangesPanel context={wsContext} />);
    mockRefresh.mockClear();
    // Transition to Idle
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: "s1", status: "Idle", startedAt: null, pid: null },
      },
    });
    rerender(<ChangesPanel context={wsContext} />);
    expect(mockRefresh).toHaveBeenCalledWith("ws-1");
  });

  it("refreshes repo when agent transitions to idle", () => {
    // Start with agent Running
    useAgentStore.setState({
      agents: {
        "repo-1": { workspaceId: "repo-1", sessionId: "s1", status: "Running", startedAt: null, pid: null },
      },
    });
    const { rerender } = render(<ChangesPanel context={repoContext} />);
    mockRefreshRepo.mockClear();
    // Transition to Idle
    useAgentStore.setState({
      agents: {
        "repo-1": { workspaceId: "repo-1", sessionId: "s1", status: "Idle", startedAt: null, pid: null },
      },
    });
    rerender(<ChangesPanel context={repoContext} />);
    expect(mockRefreshRepo).toHaveBeenCalledWith("repo-1");
  });

  it("clicking a file calls selectFile for workspace context and shows diff modal", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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
            { path: "src/del.ts", status: "deleted", additions: 0, deletions: 5 },
            { path: "src/untrack.ts", status: "untracked", additions: 3, deletions: 0 },
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
            { path: "src/renamed.ts", status: { renamed: { from: "src/old.ts" } }, additions: 0, deletions: 0 },
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
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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
            { path: "src/app.ts", status: "modified", additions: 8, deletions: 4 },
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
            { path: "src/app.ts", status: "modified", additions: 1, deletions: 0 },
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

  it("shows DiffHoverPreview on mouse enter and hides on mouse leave", () => {
    useDiffStore.setState({
      diffResults: {
        "ws-1": {
          files: [
            { path: "src/app.ts", status: "modified", additions: 5, deletions: 2 },
          ],
          totalAdditions: 5,
          totalDeletions: 2,
        },
      },
      patchPreviews: {
        "ws-1:src/app.ts": {
          path: "src/app.ts",
          language: "typescript",
          patch: "+new line",
          truncated: false,
        },
      },
      patchLoading: {},
    });
    render(<ChangesPanel context={wsContext} />);
    const btn = screen.getByText("app.ts").closest("button")!;
    fireEvent.mouseEnter(btn);
    expect(screen.getByTestId("diff-hover-preview")).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(screen.queryByTestId("diff-hover-preview")).not.toBeInTheDocument();
  });
});

// ─── File watcher behavior ──────────────────────────────────────────────────────────────
describe("ChangesPanel - file watcher", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };
  const repoContext = { id: "repo-1", type: "repo" as const };

  it("falls back to polling when startDiffWatcher fails", async () => {
    const { startDiffWatcher } = await import("../../lib/tauri");
    (startDiffWatcher as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("watcher failed"));

    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={wsContext} />);
    // Should not throw; falls back to 3s poll
    await waitFor(() => {
      expect(startDiffWatcher).toHaveBeenCalledWith("ws-1", "workspace");
    });
  });

  it("reloads diff when diff-changed event fires for workspace", async () => {
    const listenMock = await import("@tauri-apps/api/event").then((m) => m.listen) as ReturnType<typeof vi.fn>;
    const callbacks: Record<string, (() => void)> = {};
    listenMock.mockImplementation((event: string, cb: () => void) => {
      callbacks[event] = cb;
      return Promise.resolve(() => {});
    });

    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={wsContext} />);

    await waitFor(() => expect(callbacks["diff-changed:ws-1"]).toBeDefined());
    mockLoadDiff.mockClear();
    callbacks["diff-changed:ws-1"]();
    expect(mockLoadDiff).toHaveBeenCalledWith("ws-1");
  });

  it("reloads repo diff when diff-changed event fires for repo", async () => {
    const listenMock = await import("@tauri-apps/api/event").then((m) => m.listen) as ReturnType<typeof vi.fn>;
    const callbacks: Record<string, (() => void)> = {};
    listenMock.mockImplementation((event: string, cb: () => void) => {
      callbacks[event] = cb;
      return Promise.resolve(() => {});
    });

    useDiffStore.setState({
      diffResults: { "repo-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={repoContext} />);

    await waitFor(() => expect(callbacks["diff-changed:repo-1"]).toBeDefined());
    mockLoadRepoDiff.mockClear();
    callbacks["diff-changed:repo-1"]();
    expect(mockLoadRepoDiff).toHaveBeenCalledWith("repo-1");
  });
});

// ─── Polling behavior ──────────────────────────────────────────────────────────────────
describe("ChangesPanel - polling", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };
  const repoContext = { id: "repo-1", type: "repo" as const };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls loadDiff every 3 seconds for workspace context when agent is running", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    useAgentStore.setState({ agents: { "ws-1": { status: "Running" } as ReturnType<typeof useAgentStore.getState>["agents"][string] } });
    render(<ChangesPanel context={wsContext} />);
    mockLoadDiff.mockClear();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(mockLoadDiff).toHaveBeenCalledWith("ws-1");

    mockLoadDiff.mockClear();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(mockLoadDiff).toHaveBeenCalledWith("ws-1");
  });

  it("polls loadDiff every 15 seconds when agent is idle", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={wsContext} />);
    mockLoadDiff.mockClear();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(mockLoadDiff).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(12000); });
    expect(mockLoadDiff).toHaveBeenCalledWith("ws-1");
  });

  it("polls loadRepoDiff every 15 seconds for idle repo context", () => {
    useDiffStore.setState({
      diffResults: { "repo-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={repoContext} />);
    mockLoadRepoDiff.mockClear();

    act(() => { vi.advanceTimersByTime(15000); });
    expect(mockLoadRepoDiff).toHaveBeenCalledWith("repo-1");
  });

  it("clears interval on unmount", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    const { unmount } = render(<ChangesPanel context={wsContext} />);
    mockLoadDiff.mockClear();

    unmount();

    act(() => { vi.advanceTimersByTime(20000); });
    expect(mockLoadDiff).not.toHaveBeenCalled();
  });

  it("uses loadDiff not refresh for polling (preserves patch preview cache)", () => {
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
    });
    render(<ChangesPanel context={wsContext} />);
    mockLoadDiff.mockClear();
    mockRefresh.mockClear();

    act(() => { vi.advanceTimersByTime(15000); });
    expect(mockLoadDiff).toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

// ─── PrStatusBar sub-component (rendered inside ChangesPanel for workspace context) ──
describe("PrStatusBar", () => {
  const wsContext = { id: "ws-1", type: "workspace" as const };

  const mockSubscribe = vi.fn().mockResolvedValue(undefined);
  const mockUnsubscribe = vi.fn();
  const mockLoadPrInfo = vi.fn();
  const mockStartPolling = vi.fn();
  const mockStopPolling = vi.fn();
  const mockCreatePr = vi.fn();
  const mockMergePr = vi.fn();
  const mockGetFixMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    usePrStore.setState({
      prInfo: {},
      loading: {},
      error: {},
      reviews: {},
      reviewComments: {},
      workflowRuns: {},
      workflowLoading: {},
      reviewsLoading: {},
      subscriptions: {},
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      loadPrInfo: mockLoadPrInfo,
      startPolling: mockStartPolling,
      stopPolling: mockStopPolling,
      createPr: mockCreatePr,
      mergePr: mockMergePr,
      getFixMessage: mockGetFixMessage,
    } as any);

    useWorkspaceStore.setState({
      workspaces: [{ id: "ws-1", repoId: "r1", name: "test", branch: "feature", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null }],
    } as any);

    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      sessionStats: {},
      planApproval: {},
      permissionRequest: {},
      addUserMessage: vi.fn(),
    } as any);

    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Idle", startedAt: null, pid: null } },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as any);

    // Set up empty diff so "No changes" path shows PrStatusBar
    useDiffStore.setState({
      diffResults: { "ws-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
      selectedFile: {},
      fileDiffs: {},
      loading: {},
      error: {},
      loadDiff: vi.fn(),
      loadRepoDiff: vi.fn(),
      refresh: vi.fn(),
      refreshRepo: vi.fn(),
      selectFile: vi.fn(),
      selectRepoFile: vi.fn(),
    });
  });

  it("renders Create PR button when no PR exists", () => {
    usePrStore.setState({ prInfo: { "ws-1": { workspaceId: "ws-1", prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null } } } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Create PR")).toBeInTheDocument();
  });

  it("clicking Create PR calls createPr and switches to checks tab", async () => {
    usePrStore.setState({ prInfo: { "ws-1": { workspaceId: "ws-1", prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null } } } as any);
    mockCreatePr.mockResolvedValue({ prNumber: 1, prUrl: "https://github.com/test/repo/pull/1", title: "feature", state: "OPEN", checks: [], mergeable: null });
    const mockSetRightSidebarTab = vi.fn();
    useUIStore.setState({ setRightSidebarTab: mockSetRightSidebarTab } as any);

    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Create PR"));
    });

    expect(mockCreatePr).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      title: "feature",
      body: "",
      draft: null,
    });
    expect(mockSetRightSidebarTab).toHaveBeenCalledWith("checks");
  });

  it("shows 'Checking...' when PR has pending checks", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: "https://github.com/test/repo/pull/42",
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "IN_PROGRESS", conclusion: null, detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it("shows 'Fix Errors' button when checks are failing", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Fix Errors")).toBeInTheDocument();
  });

  it("shows Merge button when all checks pass", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null, description: null }],
          mergeable: "MERGEABLE",
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("Merge")).toBeInTheDocument();
  });

  it("clicking Merge calls mergePr", async () => {
    mockMergePr.mockResolvedValue({ success: true, message: "Merged", mergeMethod: "squash" });
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null, description: null }],
          mergeable: "MERGEABLE",
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Merge"));
    });
    expect(mockMergePr).toHaveBeenCalledWith("ws-1", "squash");
  });

  it("shows PR link with number when prUrl exists", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: "https://github.com/test/repo/pull/42",
          title: "PR",
          state: "OPEN",
          checks: [],
          mergeable: null,
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText(/PR #42/)).toBeInTheDocument();
  });

  it("shows PR error when prError is set", () => {
    usePrStore.setState({
      prInfo: { "ws-1": { workspaceId: "ws-1", prNumber: 42, prUrl: null, title: "PR", state: "OPEN", checks: [], mergeable: null } },
      error: { "ws-1": "GitHub API rate limited" },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(screen.getByText("GitHub API rate limited")).toBeInTheDocument();
  });

  it("clicking Fix Errors sends fix message to agent", async () => {
    mockGetFixMessage.mockResolvedValue("Fix the CI: test failure in foo.test.ts");
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    const mockAddUserMessage = vi.fn();

    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Idle", startedAt: null, pid: null } },
      sendMessage: mockSendMessage,
    } as any);
    useChatStore.setState({ addUserMessage: mockAddUserMessage } as any);

    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);

    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Fix Errors"));
    });

    expect(mockGetFixMessage).toHaveBeenCalledWith("ws-1");
    expect(mockAddUserMessage).toHaveBeenCalledWith("ws-1", "Fix the CI: test failure in foo.test.ts");
    expect(mockSendMessage).toHaveBeenCalledWith("ws-1", "Fix the CI: test failure in foo.test.ts", "workspace");
  });

  it("handleFix is a no-op when agent is running", async () => {
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null, pid: null } },
    } as any);

    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);

    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Fix Errors"));
    });

    expect(mockGetFixMessage).not.toHaveBeenCalled();
  });

  it("does not render PrStatusBar for repo context", () => {
    const repoContext = { id: "repo-1", type: "repo" as const };
    useDiffStore.setState({
      diffResults: { "repo-1": { files: [], totalAdditions: 0, totalDeletions: 0 } },
      loadRepoDiff: vi.fn(),
    });
    render(<ChangesPanel context={repoContext} />);
    // PrStatusBar is only rendered for workspace context
    expect(screen.queryByText("Create PR")).not.toBeInTheDocument();
  });

  it("starts polling when PR has pending checks", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "IN_PROGRESS", conclusion: null, detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    expect(mockStartPolling).toHaveBeenCalledWith("ws-1");
  });

  it("handleFix returns early when getFixMessage says no failing checks", async () => {
    mockGetFixMessage.mockResolvedValue("No failing checks found.");
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    const mockAddUserMessage = vi.fn();
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Idle", startedAt: null, pid: null } },
      sendMessage: mockSendMessage,
    } as any);
    useChatStore.setState({ addUserMessage: mockAddUserMessage } as any);
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Fix Errors"));
    });
    expect(mockGetFixMessage).toHaveBeenCalledWith("ws-1");
    expect(mockAddUserMessage).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("handleCreatePr logs error on failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreatePr.mockRejectedValue(new Error("create failed"));
    usePrStore.setState({
      prInfo: { "ws-1": { workspaceId: "ws-1", prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null } },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Create PR"));
    });
    expect(consoleError).toHaveBeenCalledWith("[ChangesPanel] Failed to create PR:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("handleFix logs error on failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetFixMessage.mockRejectedValue(new Error("fix failed"));
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Idle", startedAt: null, pid: null } },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as any);
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: null, description: null }],
          mergeable: null,
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Fix Errors"));
    });
    expect(consoleError).toHaveBeenCalledWith("[ChangesPanel] Failed to generate fix:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("handleMerge logs error on failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockMergePr.mockRejectedValue(new Error("merge failed"));
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: null,
          title: "PR",
          state: "OPEN",
          checks: [{ name: "CI", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null, description: null }],
          mergeable: "MERGEABLE",
        },
      },
    } as any);
    render(<ChangesPanel context={wsContext} />);
    await act(async () => {
      fireEvent.click(screen.getByText("Merge"));
    });
    expect(consoleError).toHaveBeenCalledWith("[ChangesPanel] Failed to merge PR:", expect.any(Error));
    consoleError.mockRestore();
  });
});
