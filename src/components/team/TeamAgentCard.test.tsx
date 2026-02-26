import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  GitBranch: ({ className }: { className?: string }) => <span className={className} data-testid="branch-icon" />,
  Square: ({ className }: { className?: string }) => <span className={className} data-testid="square-icon" />,
}));

import { TeamAgentCard } from "./TeamAgentCard";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import type { WorkspaceInfo } from "../../lib/tauri";

const makeWorkspace = (overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo => ({
  id: "ws-1",
  repoId: "repo-1",
  name: "feature-branch",
  branch: "feature/test",
  status: "Active",
  portBase: 3000,
  autoCommit: true,
  pinned: false,
  createdAt: "2024-01-01T00:00:00Z",
  archivedAt: null,
  ...overrides,
});

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  useChatStore.setState({ messages: {}, streamingText: {}, sessionStats: {} });
  useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null, activeRepoId: null });
  useUIStore.setState({
    viewTabs: [{ id: "chat", type: "chat", pinned: true, label: "Chat" }],
    activeViewTabId: "chat",
  });
  vi.clearAllMocks();
});

describe("TeamAgentCard", () => {
  it("renders workspace name and branch", () => {
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.getByText("feature-branch")).toBeInTheDocument();
    expect(screen.getByText("feature/test")).toBeInTheDocument();
  });

  it("shows idle status dot (not pulsing)", () => {
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    const dot = screen.getByText("feature-branch").previousElementSibling!;
    expect(dot.className).not.toContain("animate-pulse");
  });

  it("shows running status with pulsing dot and stop button", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
      },
    });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    const dot = screen.getByText("feature-branch").previousElementSibling!;
    expect(dot.className).toContain("animate-pulse");
    expect(screen.getByTitle("Stop agent")).toBeInTheDocument();
  });

  it("shows streaming text preview when running", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
      },
    });
    useChatStore.setState({ streamingText: { "ws-1": "Implementing the feature now..." } });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.getByText("Implementing the feature now...")).toBeInTheDocument();
  });

  it("shows last assistant message when idle", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "hello" }], timestamp: "t1" },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Hi there!" }], timestamp: "t2" },
        ] as any,
      },
    });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("shows error message for errored agents", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: { Error: "Process crashed" }, startedAt: null } as any,
      },
    });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.getByText("Process crashed")).toBeInTheDocument();
  });

  it("shows session stats when available", () => {
    useChatStore.setState({
      sessionStats: {
        "ws-1": { totalCostUsd: 0.1234, totalInputTokens: 1000, totalOutputTokens: 500, numTurns: 3 },
      },
    });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.getByText("$0.1234")).toBeInTheDocument();
    expect(screen.getByText("3 turns")).toBeInTheDocument();
  });

  it("navigates to workspace chat on click", () => {
    const setActive = vi.fn();
    const setActiveViewTab = vi.fn();
    useWorkspaceStore.setState({ setActive });
    useUIStore.setState({ setActiveViewTab });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    fireEvent.click(screen.getByText("feature-branch"));
    expect(setActive).toHaveBeenCalledWith("ws-1");
    expect(setActiveViewTab).toHaveBeenCalledWith("chat");
  });

  it("stop button calls stopAgent", () => {
    const stopAgent = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", sessionId: null, status: "Running", startedAt: null } as any,
      },
      stopAgent,
    });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    fireEvent.click(screen.getByTitle("Stop agent"));
    expect(stopAgent).toHaveBeenCalledWith("ws-1");
  });

  it("does not show stop button when idle", () => {
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.queryByTitle("Stop agent")).not.toBeInTheDocument();
  });

  it("does not show stats when numTurns is 0", () => {
    useChatStore.setState({
      sessionStats: {
        "ws-1": { totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0, numTurns: 0 },
      },
    });
    render(<TeamAgentCard workspace={makeWorkspace()} />);
    expect(screen.queryByText("0 turns")).not.toBeInTheDocument();
  });
});
