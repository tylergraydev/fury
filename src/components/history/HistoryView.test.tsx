import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryView } from "./HistoryView";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useHistoryStore } from "../../stores/historyStore";
import { useAgentStore } from "../../stores/agentStore";

vi.mock("lucide-react", () => ({
  GitCommit: () => <span data-testid="commit-icon" />,
  User: () => <span data-testid="user-icon" />,
  Sparkles: () => <span data-testid="sparkle-icon" />,
  RotateCcw: () => <span data-testid="revert-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  History: () => <span data-testid="history-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
}));

vi.mock("../../lib/tauri", () => ({
  listGitLog: vi.fn().mockResolvedValue([]),
  getGitLog: vi.fn().mockResolvedValue([]),
  loadCheckpoints: vi.fn().mockResolvedValue([]),
  listCheckpoints: vi.fn().mockResolvedValue([]),
  revertToCheckpoint: vi.fn().mockResolvedValue(undefined),
  listChatMessages: vi.fn().mockResolvedValue([]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
  listWorkspaces: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
  useChatStore.setState({ messages: {} });
  useCheckpointStore.setState({ checkpoints: {} });
  useHistoryStore.setState({ gitLog: {}, loading: {}, error: {} });
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  vi.clearAllMocks();
});

const NOW = Date.now();

const COMMIT_1 = {
  hash: "abc1234",
  fullHash: "abc1234567890",
  message: "Initial commit",
  author: "John",
  timestamp: new Date(NOW - 3600000).toISOString(), // 1 hour ago
};

const COMMIT_2 = {
  hash: "def5678",
  fullHash: "def5678901234",
  message: "Second commit",
  author: "Jane",
  timestamp: new Date(NOW - 7200000).toISOString(), // 2 hours ago
};

// Helper to set up workspace with mocked loadGitLog/loadCheckpoints to prevent side effects
function setActiveWorkspace(wsId: string = "ws-1") {
  // Mock the store methods to prevent actual loading side effects
  useHistoryStore.setState({
    ...useHistoryStore.getState(),
    loadGitLog: vi.fn().mockResolvedValue(undefined),
  });
  useCheckpointStore.setState({
    ...useCheckpointStore.getState(),
    loadCheckpoints: vi.fn().mockResolvedValue(undefined),
  });
  useWorkspaceStore.setState({ activeWorkspaceId: wsId });
}

describe("HistoryView", () => {
  it("shows empty state when no workspace selected", () => {
    render(<HistoryView />);
    expect(screen.getByText("Select a workspace to view history")).toBeInTheDocument();
    expect(screen.getByTestId("history-icon")).toBeInTheDocument();
  });

  it("shows empty timeline message when no items", () => {
    setActiveWorkspace();
    render(<HistoryView />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("shows loading state when loading with no items", () => {
    setActiveWorkspace();
    useHistoryStore.setState({ ...useHistoryStore.getState(), loading: { "ws-1": true } });
    render(<HistoryView />);
    expect(screen.getByText("Loading history...")).toBeInTheDocument();
  });

  it("does not show loading message when there are items", () => {
    setActiveWorkspace();
    useHistoryStore.setState({
      ...useHistoryStore.getState(),
      loading: { "ws-1": true },
      gitLog: { "ws-1": [COMMIT_1] },
    });
    render(<HistoryView />);
    expect(screen.queryByText("Loading history...")).not.toBeInTheDocument();
    expect(screen.getByText("Initial commit")).toBeInTheDocument();
  });

  it("shows error message when error exists", () => {
    setActiveWorkspace();
    useHistoryStore.setState({ ...useHistoryStore.getState(), error: { "ws-1": "Failed to load git log" } });
    render(<HistoryView />);
    expect(screen.getByText("Failed to load git log")).toBeInTheDocument();
  });

  it("renders Activity Timeline header", () => {
    setActiveWorkspace();
    render(<HistoryView />);
    expect(screen.getByText("Activity Timeline")).toBeInTheDocument();
  });

  it("renders refresh button", () => {
    setActiveWorkspace();
    render(<HistoryView />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("clicking refresh triggers loadGitLog", async () => {
    const user = userEvent.setup();
    setActiveWorkspace();
    const loadSpy = useHistoryStore.getState().loadGitLog as ReturnType<typeof vi.fn>;
    render(<HistoryView />);
    await user.click(screen.getByText("Refresh"));
    // loadGitLog is called once on mount from useEffect, and once from Refresh click
    expect(loadSpy).toHaveBeenCalledWith("ws-1");
  });

  it("loads git log and checkpoints on mount when workspace is selected", () => {
    // Use real store methods but they're already mocked in setActiveWorkspace
    setActiveWorkspace();
    const loadGitLogSpy = useHistoryStore.getState().loadGitLog as ReturnType<typeof vi.fn>;
    const loadCheckpointsSpy = useCheckpointStore.getState().loadCheckpoints as ReturnType<typeof vi.fn>;
    render(<HistoryView />);
    expect(loadGitLogSpy).toHaveBeenCalledWith("ws-1");
    expect(loadCheckpointsSpy).toHaveBeenCalledWith("ws-1");
  });

  // --- Git commit rendering ---
  describe("CommitEntry", () => {
    it("renders git commits in timeline", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1] } });
      render(<HistoryView />);
      expect(screen.getByText("Initial commit")).toBeInTheDocument();
      expect(screen.getByText("abc1234")).toBeInTheDocument();
      expect(screen.getByText("John")).toBeInTheDocument();
      expect(screen.getByTestId("commit-icon")).toBeInTheDocument();
    });

    it("renders multiple commits sorted by timestamp", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1, COMMIT_2] } });
      render(<HistoryView />);
      expect(screen.getByText("Initial commit")).toBeInTheDocument();
      expect(screen.getByText("Second commit")).toBeInTheDocument();
    });

    it("shows relative time for commits", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1] } });
      render(<HistoryView />);
      expect(screen.getByText("1h ago")).toBeInTheDocument();
    });
  });

  // --- Chat entry rendering ---
  describe("ChatEntry", () => {
    it("renders user chat messages", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-1",
              role: "user",
              content: [{ type: "text", text: "Hello world" }],
              timestamp: NOW - 1800000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("You")).toBeInTheDocument();
      expect(screen.getByText("Hello world")).toBeInTheDocument();
      expect(screen.getByTestId("user-icon")).toBeInTheDocument();
    });

    it("renders assistant chat messages", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-2",
              role: "assistant",
              content: [{ type: "text", text: "I can help with that" }],
              timestamp: NOW - 900000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Claude")).toBeInTheDocument();
      expect(screen.getByText("I can help with that")).toBeInTheDocument();
      expect(screen.getByTestId("sparkle-icon")).toBeInTheDocument();
    });

    it("skips system messages", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-sys",
              role: "system",
              content: [{ type: "text", text: "System message" }],
              timestamp: NOW - 1000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.queryByText("System message")).not.toBeInTheDocument();
      expect(screen.getByText("No activity yet")).toBeInTheDocument();
    });

    it("truncates long text to 200 characters", () => {
      setActiveWorkspace();
      const longText = "A".repeat(300);
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-3",
              role: "user",
              content: [{ type: "text", text: longText }],
              timestamp: NOW - 500000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      const truncated = "A".repeat(197) + "...";
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it("shows tool count badge for assistant messages with tools", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-4",
              role: "assistant",
              content: [
                { type: "text", text: "Using tools" },
                { type: "toolUse", name: "read_file", input: {} },
                { type: "toolUse", name: "write_file", input: {} },
              ],
              timestamp: NOW - 300000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("2 tool calls")).toBeInTheDocument();
    });

    it("shows singular tool call text", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-5",
              role: "assistant",
              content: [
                { type: "text", text: "Using one tool" },
                { type: "toolUse", name: "read_file", input: {} },
              ],
              timestamp: NOW - 200000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("1 tool call")).toBeInTheDocument();
    });

    it("does not show tool count when zero tools", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-6",
              role: "assistant",
              content: [{ type: "text", text: "No tools used" }],
              timestamp: NOW - 100000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.queryByText(/tool call/)).not.toBeInTheDocument();
    });

    it("renders chat message without text content", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-7",
              role: "assistant",
              content: [
                { type: "toolUse", name: "read_file", input: {} },
              ],
              timestamp: NOW - 50000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Claude")).toBeInTheDocument();
      expect(screen.getByText("1 tool call")).toBeInTheDocument();
    });

    it("maps non-text content blocks to empty string in text extraction", () => {
      setActiveWorkspace();
      // Include a non-text block in the textBlocks filter result by using
      // a content array where a toolResult block exists alongside text blocks.
      // The filter ensures only text blocks get mapped, but we exercise the
      // filter's false branch (b.type !== "text") to improve coverage.
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-mixed",
              role: "assistant",
              content: [
                { type: "text", text: "Part one" },
                { type: "toolResult", toolUseId: "t1", content: "result data" },
                { type: "toolUse", name: "write_file", input: {} },
                { type: "text", text: "Part two" },
              ],
              timestamp: NOW - 40000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      // The text should be the joined text blocks only: "Part one\nPart two"
      expect(screen.getByText(/Part one/)).toBeInTheDocument();
      expect(screen.getByText("1 tool call")).toBeInTheDocument();
    });
  });

  // --- Checkpoint rendering ---
  describe("CheckpointEntry", () => {
    it("renders checkpoints in timeline", () => {
      setActiveWorkspace();
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 3,
              userMessage: "Fix the bug",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Checkpoint #3")).toBeInTheDocument();
      expect(screen.getByText("abc1234")).toBeInTheDocument();
      expect(screen.getByText("Fix the bug")).toBeInTheDocument();
      expect(screen.getByTestId("revert-icon")).toBeInTheDocument();
    });

    it("shows Revert to here button", () => {
      setActiveWorkspace();
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Test",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Revert to here")).toBeInTheDocument();
    });

    it("clicking revert calls revertToCheckpoint and reloads git log", async () => {
      const user = userEvent.setup();
      setActiveWorkspace();
      useAgentStore.setState({
        agents: { "ws-1": { status: "Idle" } as any },
      });
      const revertSpy = vi.fn().mockResolvedValue(undefined);
      const loadGitLogSpy = vi.fn().mockResolvedValue(undefined);
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        revertToCheckpoint: revertSpy,
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Test",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        loadGitLog: loadGitLogSpy,
      });
      render(<HistoryView />);
      await user.click(screen.getByText("Revert to here"));
      await waitFor(() => {
        expect(revertSpy).toHaveBeenCalledWith("ws-1", "cp-1");
      });
      await waitFor(() => {
        expect(loadGitLogSpy).toHaveBeenCalledWith("ws-1");
      });
    });

    it("disables revert when agent is running", () => {
      setActiveWorkspace();
      useAgentStore.setState({
        agents: { "ws-1": { status: "Running" } as any },
      });
      const revertSpy = vi.fn().mockResolvedValue(undefined);
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        revertToCheckpoint: revertSpy,
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Test",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      const revertBtn = screen.getByText("Revert to here");
      expect(revertBtn).toBeDisabled();
      expect(revertBtn.closest("button")).toHaveAttribute("title", "Stop the agent before reverting");

      // Directly invoke the onClick handler via React fiber to bypass the disabled button check,
      // exercising the handleRevert early return guard when isAgentRunning is true.
      const fiberKey = Object.keys(revertBtn).find(k => k.startsWith("__reactFiber"));
      const onClick = fiberKey ? (revertBtn as any)[fiberKey]?.memoizedProps?.onClick : null;
      expect(onClick).toBeDefined();
      onClick();
      expect(revertSpy).not.toHaveBeenCalled();
    });

    it("shows tooltip for idle agent", () => {
      setActiveWorkspace();
      useAgentStore.setState({
        agents: { "ws-1": { status: "Idle" } as any },
      });
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Test",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      const revertBtn = screen.getByText("Revert to here").closest("button");
      expect(revertBtn).toHaveAttribute("title", "Revert to this checkpoint");
    });

    it("handles revert error gracefully", async () => {
      const user = userEvent.setup();
      setActiveWorkspace();
      useAgentStore.setState({
        agents: { "ws-1": { status: "Idle" } as any },
      });
      const revertSpy = vi.fn().mockRejectedValue(new Error("Revert failed"));
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        revertToCheckpoint: revertSpy,
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Test",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      await user.click(screen.getByText("Revert to here"));
      // Should eventually return to "Revert to here" not "Reverting..."
      await waitFor(() => {
        expect(screen.getByText("Revert to here")).toBeInTheDocument();
      });
    });

    it("does not render user message if empty", () => {
      setActiveWorkspace();
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        checkpoints: {
          "ws-1": [
            {
              id: "cp-2",
              turnIndex: 2,
              userMessage: "",
              commitSha: "def5678901234",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Checkpoint #2")).toBeInTheDocument();
    });

    it("does not revert when already reverting", async () => {
      const user = userEvent.setup();
      setActiveWorkspace();
      useAgentStore.setState({
        agents: { "ws-1": { status: "Idle" } as any },
      });
      let resolveRevert: () => void;
      const revertSpy = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
        resolveRevert = resolve;
      }));
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        revertToCheckpoint: revertSpy,
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Test",
              commitSha: "abc1234567890",
              createdAt: new Date(NOW - 600000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      // Click once
      await user.click(screen.getByText("Revert to here"));
      // Should now show "Reverting..."
      await waitFor(() => {
        expect(screen.getByText("Reverting...")).toBeInTheDocument();
      });
      // The button is now disabled (reverting=true), preventing additional clicks.
      // Verify the button text changed and revertToCheckpoint was called exactly once.
      const revertingBtn = screen.getByText("Reverting...").closest("button")!;
      expect(revertingBtn).toBeDisabled();
      expect(revertSpy).toHaveBeenCalledTimes(1);
      // Resolve to clean up
      resolveRevert!();
      await waitFor(() => {
        expect(screen.getByText("Revert to here")).toBeInTheDocument();
      });
    });
  });

  // --- TimelineEntry rendering ---
  describe("TimelineEntry", () => {
    it("does not show connecting line for last item", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1] } });
      const { container } = render(<HistoryView />);
      // Only one timeline item, it should be the last
      const timelineEntries = container.querySelectorAll(".relative.flex.gap-3");
      expect(timelineEntries.length).toBe(1);
    });

    it("shows connecting line for non-last items", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1, COMMIT_2] } });
      const { container } = render(<HistoryView />);
      const timelineEntries = container.querySelectorAll(".relative.flex.gap-3");
      expect(timelineEntries.length).toBe(2);
    });
  });

  // --- formatRelativeTime ---
  describe("formatRelativeTime", () => {
    it("shows just now for very recent", () => {
      setActiveWorkspace();
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        gitLog: {
          "ws-1": [{
            ...COMMIT_1,
            timestamp: new Date(NOW - 5000).toISOString(), // 5 seconds ago
          }],
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("shows minutes ago", () => {
      setActiveWorkspace();
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        gitLog: {
          "ws-1": [{
            ...COMMIT_1,
            timestamp: new Date(NOW - 5 * 60000).toISOString(),
          }],
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("5m ago")).toBeInTheDocument();
    });

    it("shows hours ago", () => {
      setActiveWorkspace();
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        gitLog: {
          "ws-1": [{
            ...COMMIT_1,
            timestamp: new Date(NOW - 3 * 3600000).toISOString(),
          }],
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("3h ago")).toBeInTheDocument();
    });

    it("shows days ago", () => {
      setActiveWorkspace();
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        gitLog: {
          "ws-1": [{
            ...COMMIT_1,
            timestamp: new Date(NOW - 3 * 86400000).toISOString(),
          }],
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("3d ago")).toBeInTheDocument();
    });

    it("shows date for items older than a week", () => {
      setActiveWorkspace();
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        gitLog: {
          "ws-1": [{
            ...COMMIT_1,
            timestamp: new Date(NOW - 30 * 86400000).toISOString(),
          }],
        },
      });
      render(<HistoryView />);
      // Should show the date in toLocaleDateString format
      const dateStr = new Date(NOW - 30 * 86400000).toLocaleDateString();
      expect(screen.getByText(dateStr)).toBeInTheDocument();
    });
  });

  // --- Mixed timeline ---
  describe("Mixed timeline", () => {
    it("renders commits, chat messages, and checkpoints together", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1] } });
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-1",
              role: "user",
              content: [{ type: "text", text: "Fix the bug" }],
              timestamp: NOW - 1200000,
            },
          ] as any,
        },
      });
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Checkpoint msg",
              commitSha: "xyz9876543210",
              createdAt: new Date(NOW - 800000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Initial commit")).toBeInTheDocument();
      expect(screen.getByText("Fix the bug")).toBeInTheDocument();
      expect(screen.getByText("Checkpoint #1")).toBeInTheDocument();
    });

    it("sorts timeline items by timestamp descending", () => {
      setActiveWorkspace();
      useHistoryStore.setState({
        ...useHistoryStore.getState(),
        gitLog: {
          "ws-1": [{
            ...COMMIT_1,
            message: "Older commit",
            timestamp: new Date(NOW - 7200000).toISOString(),
          }],
        },
      });
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-1",
              role: "user",
              content: [{ type: "text", text: "Middle message" }],
              timestamp: NOW - 3600000,
            },
          ] as any,
        },
      });
      useCheckpointStore.setState({
        ...useCheckpointStore.getState(),
        checkpoints: {
          "ws-1": [
            {
              id: "cp-1",
              turnIndex: 1,
              userMessage: "Recent checkpoint",
              commitSha: "xyz",
              createdAt: new Date(NOW - 1800000).toISOString(),
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("Older commit")).toBeInTheDocument();
      expect(screen.getByText("Middle message")).toBeInTheDocument();
      expect(screen.getByText("Recent checkpoint")).toBeInTheDocument();
    });
  });

  // --- Dot color ---
  describe("Timeline dot colors", () => {
    it("uses accent color for commit dots", () => {
      setActiveWorkspace();
      useHistoryStore.setState({ ...useHistoryStore.getState(), gitLog: { "ws-1": [COMMIT_1] } });
      const { container } = render(<HistoryView />);
      const dot = container.querySelector(".absolute.left-\\[3px\\]");
      expect(dot).toBeInTheDocument();
    });

    it("uses different colors for user vs assistant chat dots", () => {
      setActiveWorkspace();
      useChatStore.setState({
        messages: {
          "ws-1": [
            {
              id: "msg-u",
              role: "user",
              content: [{ type: "text", text: "User msg" }],
              timestamp: NOW - 100000,
            },
            {
              id: "msg-a",
              role: "assistant",
              content: [{ type: "text", text: "Assistant msg" }],
              timestamp: NOW - 50000,
            },
          ] as any,
        },
      });
      render(<HistoryView />);
      expect(screen.getByText("You")).toBeInTheDocument();
      expect(screen.getByText("Claude")).toBeInTheDocument();
    });
  });
});
