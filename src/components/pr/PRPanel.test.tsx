import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PRPanel } from "./PRPanel";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTodoStore } from "../../stores/todoStore";

const mockGetPrInfo = vi.fn().mockResolvedValue({
  workspaceId: "ws-1",
  prNumber: null,
  prUrl: null,
  title: null,
  state: null,
  checks: [],
  mergeable: null,
});

vi.mock("../../lib/tauri", () => ({
  getPrInfo: (...args: unknown[]) => mockGetPrInfo(...args),
  getPrChecks: vi.fn().mockResolvedValue([]),
  createPr: vi.fn().mockResolvedValue(undefined),
  pushChanges: vi.fn().mockResolvedValue(undefined),
  fixFailingChecks: vi.fn().mockResolvedValue(""),
  mergePr: vi.fn().mockResolvedValue({ success: true }),
  listTodos: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(() => {}),
  listChatMessages: vi.fn().mockResolvedValue([]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  getAgentStatus: vi.fn().mockResolvedValue({ status: "Idle" }),
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  usePrStore.setState({
    prInfo: {},
    loading: {},
    error: {},
  });
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", repoId: "r1", name: "Test WS", branch: "feature-1", status: "Active", portBase: 3000, autoCommit: false, createdAt: "2024-01-01", archivedAt: null },
    ],
    activeWorkspaceId: "ws-1",
  });
  useTodoStore.setState({ todos: {} });
  vi.clearAllMocks();
});

describe("PRPanel", () => {
  it("shows create PR form when no PR exists", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const elements = await screen.findAllByText("Create Pull Request");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("shows title input pre-filled with branch name", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const input = await screen.findByPlaceholderText("PR title") as HTMLInputElement;
    expect(input.value).toBe("feature-1");
  });

  it("shows description textarea", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    expect(await screen.findByPlaceholderText("Describe your changes...")).toBeInTheDocument();
  });

  it("shows draft checkbox", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    expect(await screen.findByText("Create as draft")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<PRPanel workspaceId="ws-1" />);
    expect(screen.getByText("Loading PR info...")).toBeInTheDocument();
  });

  it("shows PR status view when PR exists", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: "https://github.com/test/pr/42",
          title: "Add feature",
          state: "OPEN",
          checks: [],
          mergeable: "MERGEABLE",
        },
      },
    });
    render(<PRPanel workspaceId="ws-1" />);
    expect(screen.getByText("PR #42")).toBeInTheDocument();
    expect(screen.getByText("Add feature")).toBeInTheDocument();
  });

  it("shows View on GitHub link for existing PR", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: "https://github.com/test/pr/42",
          title: "Add feature",
          state: "OPEN",
          checks: [],
          mergeable: "MERGEABLE",
        },
      },
    });
    render(<PRPanel workspaceId="ws-1" />);
    expect(screen.getByText("View on GitHub")).toBeInTheDocument();
  });

  it("shows merged view when PR is merged", () => {
    usePrStore.setState({
      prInfo: {
        "ws-1": {
          workspaceId: "ws-1",
          prNumber: 42,
          prUrl: "https://github.com/test/pr/42",
          title: "Add feature",
          state: "MERGED",
          checks: [],
          mergeable: null,
        },
      },
    });
    render(<PRPanel workspaceId="ws-1" />);
    expect(screen.getByText("PR #42 Merged")).toBeInTheDocument();
  });

  it("shows error when loadPrInfo fails", async () => {
    mockGetPrInfo.mockRejectedValueOnce(new Error("Push failed"));
    render(<PRPanel workspaceId="ws-1" />);
    // After loadPrInfo rejects, error state is set in the store
    // But the component shows "Loading PR info..." then falls to create form with error
    // The error is stored in the prStore and read by the create form
    expect(await screen.findByText(/Push failed/)).toBeInTheDocument();
  });
});
