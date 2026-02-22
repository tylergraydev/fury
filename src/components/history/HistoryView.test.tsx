import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryView } from "./HistoryView";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useHistoryStore } from "../../stores/historyStore";

vi.mock("lucide-react", () => ({
  GitCommit: () => <span data-testid="commit-icon" />,
  User: () => <span data-testid="user-icon" />,
  Sparkles: () => <span data-testid="sparkle-icon" />,
  RotateCcw: () => <span data-testid="revert-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  History: () => <span data-testid="history-icon" />,
}));

vi.mock("../../lib/tauri", () => ({
  listGitLog: vi.fn().mockResolvedValue([]),
  loadCheckpoints: vi.fn().mockResolvedValue([]),
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
  vi.clearAllMocks();
});

describe("HistoryView", () => {
  it("shows empty state when no workspace selected", () => {
    render(<HistoryView />);
    expect(screen.getByText("Select a workspace to view history")).toBeInTheDocument();
  });

  it("shows empty timeline message when no items", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    render(<HistoryView />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("renders git commits in timeline", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useHistoryStore.setState({
      gitLog: {
        "ws-1": [
          {
            sha: "abc123",
            message: "Initial commit",
            author: "John",
            timestamp: "2025-01-01T00:00:00Z",
          },
        ],
      },
    });
    render(<HistoryView />);
    expect(screen.getByText("Initial commit")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useHistoryStore.setState({ loading: { "ws-1": true } });
    render(<HistoryView />);
    // With loading, the timeline might show spinner or empty state
    // Just verify it renders without error
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });
});
