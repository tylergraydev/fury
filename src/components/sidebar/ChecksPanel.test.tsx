import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ChecksPanel } from "./ChecksPanel";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTodoStore } from "../../stores/todoStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import type { PrInfo } from "../../lib/tauri";

vi.mock("lucide-react", () => ({
  ExternalLink: () => <span data-testid="link-icon" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  X: () => <span data-testid="x-icon" />,
  RotateCw: () => <span data-testid="rotate-icon" />,
}));

const mockGetPrInfo = vi.fn().mockResolvedValue({
  workspaceId: "ws-1",
  prNumber: null,
  prUrl: null,
  title: null,
  state: null,
  checks: [],
  mergeable: null,
});
const mockCreatePr = vi.fn().mockResolvedValue({
  workspaceId: "ws-1",
  prNumber: 99,
  prUrl: null,
  title: "feature-1",
  state: "OPEN",
  checks: [],
  mergeable: null,
});
const mockPushChanges = vi.fn().mockResolvedValue(undefined);
const mockGetPrChecks = vi.fn().mockResolvedValue([]);
const mockFixFailingChecks = vi.fn().mockResolvedValue("Fix CI errors");
const mockMergePr = vi.fn().mockResolvedValue({ success: true, message: "Merged", mergeMethod: "squash" });
const mockListTodos = vi.fn().mockResolvedValue([]);
const mockSendMessage = vi.fn().mockResolvedValue(undefined);
const mockGetPrReviews = vi.fn().mockResolvedValue([]);
const mockGetPrReviewComments = vi.fn().mockResolvedValue([]);
const mockGetWorkflowRuns = vi.fn().mockResolvedValue([]);
const mockGetRunJobs = vi.fn().mockResolvedValue([]);
const mockGetRunLogs = vi.fn().mockResolvedValue({ logs: "", truncated: false });
const mockRerunWorkflow = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/tauri", () => ({
  getPrInfo: (...args: unknown[]) => mockGetPrInfo(...args),
  getPrChecks: (...args: unknown[]) => mockGetPrChecks(...args),
  createPr: (...args: unknown[]) => mockCreatePr(...args),
  pushChanges: (...args: unknown[]) => mockPushChanges(...args),
  fixFailingChecks: (...args: unknown[]) => mockFixFailingChecks(...args),
  mergePr: (...args: unknown[]) => mockMergePr(...args),
  listTodos: (...args: unknown[]) => mockListTodos(...args),
  getPrReviews: (...args: unknown[]) => mockGetPrReviews(...args),
  getPrReviewComments: (...args: unknown[]) => mockGetPrReviewComments(...args),
  getWorkflowRuns: (...args: unknown[]) => mockGetWorkflowRuns(...args),
  getRunJobs: (...args: unknown[]) => mockGetRunJobs(...args),
  getRunLogs: (...args: unknown[]) => mockGetRunLogs(...args),
  rerunWorkflow: (...args: unknown[]) => mockRerunWorkflow(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
  listChatMessages: vi.fn().mockResolvedValue([]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  getAgentStatus: vi.fn().mockResolvedValue({ status: "Idle" }),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  toPersisted: vi.fn((msg: unknown) => msg),
  fromPersisted: vi.fn((msg: unknown) => msg),
}));

const basePrInfo: PrInfo = {
  workspaceId: "ws-1",
  prNumber: 42,
  prUrl: "https://github.com/test/pr/42",
  title: "Add feature",
  state: "OPEN",
  checks: [],
  mergeable: null,
};

function setupOpenPr(overrides: Partial<PrInfo> = {}) {
  const info = { ...basePrInfo, ...overrides };
  mockGetPrInfo.mockResolvedValue(info);
  usePrStore.setState({
    prInfo: { "ws-1": info },
  });
}

beforeEach(() => {
  usePrStore.setState({
    prInfo: {},
    reviews: {},
    reviewComments: {},
    workflowRuns: {},
    workflowLoading: {},
    loading: {},
    error: {},
    subscriptions: {},
    pollIntervals: {},
  });
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", name: "test-ws", branch: "feature-1", repoId: "r1" },
    ] as any,
  });
  useTodoStore.setState({ todos: {}, loading: {}, error: {} });
  useChatStore.setState({ messages: {}, streamingText: {}, subscriptions: {} });
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  vi.clearAllMocks();
  // Reset to default no-PR mock AFTER clearAllMocks
  mockGetPrInfo.mockResolvedValue({
    workspaceId: "ws-1",
    prNumber: null,
    prUrl: null,
    title: null,
    state: null,
    checks: [],
    mergeable: null,
  });
});

describe("ChecksPanel", () => {
  // === Create PR Button ===

  it("shows Create PR button when no PR exists", () => {
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(screen.getByText("No pull request")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create PR" })).toBeInTheDocument();
  });

  it("shows error in create view", async () => {
    render(<ChecksPanel workspaceId="ws-1" />);
    await act(async () => {
      usePrStore.setState({ error: { "ws-1": "Failed to create PR" } });
    });
    expect(screen.getByText("Failed to create PR")).toBeInTheDocument();
  });

  it("sends message to agent on Create PR click", async () => {
    render(<ChecksPanel workspaceId="ws-1" />);
    const addUserMsgSpy = vi.spyOn(useChatStore.getState(), "addUserMessage");
    const sendMsgSpy = vi.spyOn(useAgentStore.getState(), "sendMessage");
    const button = screen.getByRole("button", { name: "Create PR" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(addUserMsgSpy).toHaveBeenCalledWith("ws-1", expect.stringContaining("pull request"));
    expect(sendMsgSpy).toHaveBeenCalledWith("ws-1", expect.stringContaining("pull request"), "workspace");
  });

  it("shows Creating... state after clicking Create PR", async () => {
    render(<ChecksPanel workspaceId="ws-1" />);
    const button = screen.getByRole("button", { name: "Create PR" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByText("Creating...")).toBeInTheDocument();
    expect(screen.getByText("Claude is generating title and description...")).toBeInTheDocument();
  });

  // === Merged State ===

  it("shows merged state", async () => {
    setupOpenPr({ state: "MERGED", prNumber: 10, title: "Merged PR" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #10 Merged")).toBeInTheDocument();
    });
  });

  it("shows title in merged state", async () => {
    setupOpenPr({ state: "MERGED", title: "My merged feature" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("My merged feature")).toBeInTheDocument();
    });
  });

  // === PR Header ===

  it("shows PR header when PR exists", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
      expect(screen.getByText("Add feature")).toBeInTheDocument();
    });
  });

  it("shows PR number as link when prUrl is set", async () => {
    setupOpenPr({ prUrl: "https://github.com/test/pr/42" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const link = screen.getByText("#42").closest("a");
      expect(link).toHaveAttribute("href", "https://github.com/test/pr/42");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("shows PR number as plain text when no prUrl", async () => {
    setupOpenPr({ prUrl: null });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const element = screen.getByText("#42");
      expect(element.tagName).toBe("SPAN");
    });
  });

  it("shows external link icon when prUrl is set", async () => {
    setupOpenPr({ prUrl: "https://github.com/test/pr/42" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getAllByTestId("link-icon").length).toBeGreaterThanOrEqual(1);
    });
  });

  // === Status Badges ===

  it("shows OPEN state badge", async () => {
    setupOpenPr({ state: "OPEN" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("OPEN")).toBeInTheDocument();
    });
  });

  it("shows CLOSED state badge", async () => {
    setupOpenPr({ state: "CLOSED" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CLOSED")).toBeInTheDocument();
    });
  });

  it("shows No conflicts badge when MERGEABLE", async () => {
    setupOpenPr({ mergeable: "MERGEABLE" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No conflicts")).toBeInTheDocument();
    });
  });

  it("shows CONFLICTING badge when not mergeable", async () => {
    setupOpenPr({ mergeable: "CONFLICTING" });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CONFLICTING")).toBeInTheDocument();
    });
  });

  it("does not show mergeable badge when null", async () => {
    setupOpenPr({ mergeable: null });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });
    expect(screen.queryByText("No conflicts")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFLICTING")).not.toBeInTheDocument();
  });

  // === Todo Badge ===

  it("shows todo badge with counts", async () => {
    setupOpenPr();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Fix", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Test", completed: true, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Todos: 1/2")).toBeInTheDocument();
    });
  });

  it("shows all-complete todo badge", async () => {
    setupOpenPr();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Fix", completed: true, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Test", completed: true, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Todos: 2/2")).toBeInTheDocument();
    });
  });

  it("does not show todo badge when no todos", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Todos:/)).not.toBeInTheDocument();
  });

  // === Error Display ===

  it("shows error in PR status view", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });
    await act(async () => {
      usePrStore.setState({ error: { "ws-1": "Something broke" } });
    });
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  // === Checks ===

  it("shows No checks found when empty", async () => {
    setupOpenPr({ checks: [] });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No checks found")).toBeInTheDocument();
    });
  });

  it("shows CI Checks header with count", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText(/CI Checks/)).toBeInTheDocument();
    });
  });

  it("shows checks when they exist", async () => {
    setupOpenPr({
      checks: [
        { name: "CI Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CI Build")).toBeInTheDocument();
      expect(screen.getByText("Lint")).toBeInTheDocument();
    });
  });

  // === CheckRow ===

  it("renders success check with conclusion text", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
      expect(screen.getByText("success")).toBeInTheDocument();
    });
  });

  it("renders failure check with conclusion text", async () => {
    setupOpenPr({
      checks: [
        { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Lint")).toBeInTheDocument();
      expect(screen.getByText("failure")).toBeInTheDocument();
    });
  });

  it("renders pending check", async () => {
    setupOpenPr({
      checks: [
        { name: "Deploy", conclusion: null, status: "IN_PROGRESS", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Deploy")).toBeInTheDocument();
      expect(screen.getByText("pending")).toBeInTheDocument();
    });
  });

  it("renders lowercase success conclusion", async () => {
    setupOpenPr({
      checks: [
        { name: "Test", conclusion: "success", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("success")).toBeInTheDocument();
    });
  });

  it("renders lowercase failure conclusion", async () => {
    setupOpenPr({
      checks: [
        { name: "Lint", conclusion: "failure", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("failure")).toBeInTheDocument();
    });
  });

  it("renders check as a link when detailsUrl is provided", async () => {
    setupOpenPr({
      checks: [
        { name: "CI Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: "https://ci.example.com/build/1", description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const link = screen.getByText("CI Build").closest("a");
      expect(link).toHaveAttribute("href", "https://ci.example.com/build/1");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("renders check as div when no detailsUrl", async () => {
    setupOpenPr({
      checks: [
        { name: "Lint Check", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const element = screen.getByText("Lint Check");
      // It should not be inside an <a> tag
      expect(element.closest("a")).toBeNull();
    });
  });

  it("shows external link icon in check row when detailsUrl is set", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: "https://ci.example.com", description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const icons = screen.getAllByTestId("link-icon");
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // === Button Actions ===

  it("shows Push button when PR exists", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Push")).toBeInTheDocument();
    });
  });

  it("calls pushChanges when Push button is clicked", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Push")).toBeInTheDocument();
    });
    const pushSpy = vi.spyOn(usePrStore.getState(), "pushChanges");
    await act(async () => {
      fireEvent.click(screen.getByText("Push"));
    });
    expect(pushSpy).toHaveBeenCalledWith("ws-1");
  });

  it("shows Pushing... and disables button when loading", async () => {
    setupOpenPr();
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const pushButton = screen.getByText("Pushing...");
      expect(pushButton).toBeDisabled();
    });
  });

  it("calls refreshChecks when Refresh button is clicked", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getAllByText("Refresh").length).toBeGreaterThanOrEqual(1);
    });
    const refreshSpy = vi.spyOn(usePrStore.getState(), "refreshChecks");
    await act(async () => {
      fireEvent.click(screen.getAllByText("Refresh")[0]);
    });
    expect(refreshSpy).toHaveBeenCalledWith("ws-1");
  });

  // === Fix with Claude ===

  it("shows Fix with Claude button when checks fail", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
  });

  it("does not show Fix with Claude when all checks pass", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CI")).toBeInTheDocument();
    });
    expect(screen.queryByText("Fix with Claude")).not.toBeInTheDocument();
  });

  it("calls getFixMessage and sends to agent on Fix with Claude click", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
    const getFixSpy = vi.spyOn(usePrStore.getState(), "getFixMessage").mockResolvedValue("Fix CI: error in tests");
    const addUserMsgSpy = vi.spyOn(useChatStore.getState(), "addUserMessage");
    const sendMsgSpy = vi.spyOn(useAgentStore.getState(), "sendMessage");
    await act(async () => {
      fireEvent.click(screen.getByText("Fix with Claude"));
    });
    expect(getFixSpy).toHaveBeenCalledWith("ws-1");
    await waitFor(() => {
      expect(addUserMsgSpy).toHaveBeenCalledWith("ws-1", "Fix CI: error in tests");
      expect(sendMsgSpy).toHaveBeenCalledWith("ws-1", "Fix CI: error in tests", "workspace");
    });
  });

  it("does not send message when getFixMessage returns no failing checks", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
    vi.spyOn(usePrStore.getState(), "getFixMessage").mockResolvedValue("No failing checks found.");
    const addUserMsgSpy = vi.spyOn(useChatStore.getState(), "addUserMessage");
    await act(async () => {
      fireEvent.click(screen.getByText("Fix with Claude"));
    });
    await waitFor(() => {
      expect(addUserMsgSpy).not.toHaveBeenCalled();
    });
  });

  it("handles getFixMessage rejection gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
    vi.spyOn(usePrStore.getState(), "getFixMessage").mockRejectedValue(new Error("fail"));
    await act(async () => {
      fireEvent.click(screen.getByText("Fix with Claude"));
    });
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith("[ChecksPanel] Failed to generate fix:", expect.any(Error));
    });
    consoleSpy.mockRestore();
  });

  // === Merge ===

  it("shows merge controls when all checks pass and PR is mergeable", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
      expect(screen.getByDisplayValue("Squash")).toBeInTheDocument();
    });
  });

  it("shows merge controls when no checks and PR is mergeable", async () => {
    setupOpenPr({ mergeable: "MERGEABLE", checks: [] });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    });
  });

  it("does not show merge controls when checks are failing", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("Squash")).not.toBeInTheDocument();
  });

  it("does not show merge controls when PR has conflicts", async () => {
    setupOpenPr({
      mergeable: "CONFLICTING",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CONFLICTING")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("Squash")).not.toBeInTheDocument();
  });

  it("calls mergePr with selected method when Merge is clicked", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    });
    const mergeSpy = vi.spyOn(usePrStore.getState(), "mergePr");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    });
    expect(mergeSpy).toHaveBeenCalledWith("ws-1", "squash");
  });

  it("allows changing merge method", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Squash")).toBeInTheDocument();
    });
    const select = screen.getByDisplayValue("Squash") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "rebase" } });
    });
    expect(select.value).toBe("rebase");
  });

  it("calls mergePr with rebase method", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Squash")).toBeInTheDocument();
    });
    const select = screen.getByDisplayValue("Squash") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "rebase" } });
    });
    const mergeSpy = vi.spyOn(usePrStore.getState(), "mergePr");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    });
    expect(mergeSpy).toHaveBeenCalledWith("ws-1", "rebase");
  });

  it("disables merge button when loading", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    });
  });

  it("disables merge button when todos are pending", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Fix bug", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const mergeButton = screen.getByRole("button", { name: "Merge" });
      expect(mergeButton).toBeDisabled();
      expect(mergeButton).toHaveAttribute("title", "Complete all todos first");
    });
  });

  it("shows Merge this PR title when no pending todos", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const mergeButton = screen.getByRole("button", { name: "Merge" });
      expect(mergeButton).toHaveAttribute("title", "Merge this PR");
    });
  });

  // === Effects ===

  it("subscribes and loads PR info on mount", () => {
    const subscribeSpy = vi.spyOn(usePrStore.getState(), "subscribe");
    const loadSpy = vi.spyOn(usePrStore.getState(), "loadPrInfo");
    render(<ChecksPanel workspaceId="ws-1" />);
    expect(subscribeSpy).toHaveBeenCalledWith("ws-1");
    expect(loadSpy).toHaveBeenCalledWith("ws-1");
  });

  it("unsubscribes on unmount", () => {
    const unsubscribeSpy = vi.spyOn(usePrStore.getState(), "unsubscribe");
    const { unmount } = render(<ChecksPanel workspaceId="ws-1" />);
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledWith("ws-1");
  });

  it("loads todos when PR exists", async () => {
    setupOpenPr();
    const loadTodosSpy = vi.spyOn(useTodoStore.getState(), "loadTodos");
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(loadTodosSpy).toHaveBeenCalledWith("ws-1");
    });
  });

  it("starts polling when there are pending checks", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: null, status: "IN_PROGRESS", detailsUrl: null, description: null },
      ],
    });
    const startPollingSpy = vi.spyOn(usePrStore.getState(), "startPolling");
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(startPollingSpy).toHaveBeenCalledWith("ws-1");
    });
  });

  it("does not start polling when all checks completed", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    const startPollingSpy = vi.spyOn(usePrStore.getState(), "startPolling");
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
    });
    expect(startPollingSpy).not.toHaveBeenCalled();
  });

  // === Edge cases ===

  it("handles checks with mixed conclusions", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Deploy", conclusion: null, status: "IN_PROGRESS", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
      expect(screen.getByText("Lint")).toBeInTheDocument();
      expect(screen.getByText("Deploy")).toBeInTheDocument();
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
  });

  it("shows pending check with QUEUED status", async () => {
    setupOpenPr({
      checks: [
        { name: "Test", conclusion: null, status: "QUEUED", detailsUrl: null, description: null },
      ],
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
      expect(screen.getByText("pending")).toBeInTheDocument();
    });
  });

  it("does not treat COMPLETED check with null conclusion as pending for polling", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: null, status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    const startPollingSpy = vi.spyOn(usePrStore.getState(), "startPolling");
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
    });
    expect(startPollingSpy).not.toHaveBeenCalled();
  });

  // === Reviews ===

  it("shows Reviews section when reviews exist", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 1, author: "alice", state: "APPROVED", body: "LGTM", submittedAt: "" },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("@alice")).toBeInTheDocument();
      expect(screen.getByText("approved")).toBeInTheDocument();
    });
  });

  it("shows CHANGES_REQUESTED review", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 2, author: "bob", state: "CHANGES_REQUESTED", body: "Needs work", submittedAt: "" },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("@bob")).toBeInTheDocument();
      expect(screen.getByText("changes requested")).toBeInTheDocument();
      expect(screen.getByText("Needs work")).toBeInTheDocument();
    });
  });

  it("shows COMMENTED review", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 3, author: "carol", state: "COMMENTED", body: "", submittedAt: "" },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("@carol")).toBeInTheDocument();
      expect(screen.getByText("commented")).toBeInTheDocument();
    });
  });

  it("shows inline review comments with file path and line", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviewComments: {
        "ws-1": [
          { id: 10, author: "dave", body: "Fix this variable", createdAt: "", path: "src/foo.ts", line: 42 },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("@dave")).toBeInTheDocument();
      expect(screen.getByText("src/foo.ts:42")).toBeInTheDocument();
      expect(screen.getByText("Fix this variable")).toBeInTheDocument();
    });
  });

  it("shows Reviews count header", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 1, author: "alice", state: "APPROVED", body: "", submittedAt: "" },
        ],
      },
      reviewComments: {
        "ws-1": [
          { id: 10, author: "bob", body: "Fix", createdAt: "", path: "src/a.ts", line: 1 },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Reviews (2)")).toBeInTheDocument();
    });
  });

  it("does not show Reviews section when no reviews", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Reviews/)).not.toBeInTheDocument();
  });

  it("shows Send to agent button when reviews exist", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 1, author: "alice", state: "CHANGES_REQUESTED", body: "Fix types", submittedAt: "" },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Send to agent")).toBeInTheDocument();
    });
  });

  it("does not show Send to agent when no reviews", async () => {
    setupOpenPr();
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });
    expect(screen.queryByText("Send to agent")).not.toBeInTheDocument();
  });

  it("sends review feedback to agent on Send to agent click", async () => {
    const reviewData = [
      { id: 1, author: "alice", state: "CHANGES_REQUESTED", body: "Fix the types", submittedAt: "" },
    ];
    mockGetPrReviews.mockResolvedValue(reviewData);
    mockGetPrReviewComments.mockResolvedValue([]);
    setupOpenPr();
    usePrStore.setState({
      reviews: { "ws-1": reviewData },
      reviewComments: { "ws-1": [] },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Send to agent")).toBeInTheDocument();
    });
    const addUserMsgSpy = vi.spyOn(useChatStore.getState(), "addUserMessage");
    const sendMsgSpy = vi.spyOn(useAgentStore.getState(), "sendMessage");
    await act(async () => {
      fireEvent.click(screen.getByText("Send to agent"));
    });
    await waitFor(() => {
      expect(addUserMsgSpy).toHaveBeenCalledWith("ws-1", expect.stringContaining("@alice"));
      expect(sendMsgSpy).toHaveBeenCalledWith("ws-1", expect.stringContaining("CHANGES_REQUESTED"), "workspace");
    });
  });

  it("shows review comment without line number when line is null", async () => {
    setupOpenPr();
    usePrStore.setState({
      reviewComments: {
        "ws-1": [
          { id: 11, author: "eve", body: "Check this file", createdAt: "", path: "src/bar.ts", line: null },
        ],
      },
    });
    render(<ChecksPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("@eve")).toBeInTheDocument();
      expect(screen.getByText("src/bar.ts")).toBeInTheDocument();
    });
  });
});
