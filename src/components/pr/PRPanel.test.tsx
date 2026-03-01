import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { PRPanel } from "./PRPanel";
import { usePrStore } from "../../stores/prStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTodoStore } from "../../stores/todoStore";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import type { PrInfo } from "../../lib/tauri";

// Default mock returns no PR
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
  prUrl: "https://github.com/test/pr/99",
  title: "feature-1",
  state: "OPEN",
  checks: [],
  mergeable: "MERGEABLE",
});

const mockPushChanges = vi.fn().mockResolvedValue(undefined);
const mockFixFailingChecks = vi.fn().mockResolvedValue("Fix the CI issue");
const mockMergePr = vi.fn().mockResolvedValue({ success: true, message: "Merged", mergeMethod: "squash" });
const mockGetPrChecks = vi.fn().mockResolvedValue([]);
const mockListTodos = vi.fn().mockResolvedValue([]);
const mockSendMessage = vi.fn().mockResolvedValue(undefined);
const mockGetPrFullData = vi.fn().mockResolvedValue({
  info: { workspaceId: "ws-1", prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null },
  reviews: [],
  reviewComments: [],
});

vi.mock("../../lib/tauri", () => ({
  getPrInfo: (...args: unknown[]) => mockGetPrInfo(...args),
  getPrChecks: (...args: unknown[]) => mockGetPrChecks(...args),
  createPr: (...args: unknown[]) => mockCreatePr(...args),
  pushChanges: (...args: unknown[]) => mockPushChanges(...args),
  fixFailingChecks: (...args: unknown[]) => mockFixFailingChecks(...args),
  mergePr: (...args: unknown[]) => mockMergePr(...args),
  listTodos: (...args: unknown[]) => mockListTodos(...args),
  getPrReviews: vi.fn().mockResolvedValue([]),
  getPrReviewComments: vi.fn().mockResolvedValue([]),
  getPrFullData: (...args: unknown[]) => mockGetPrFullData(...args),
  getReviewsAndComments: vi.fn().mockResolvedValue({ reviews: [], reviewComments: [] }),
  getWorkflowRuns: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(() => {}),
  listChatMessages: vi.fn().mockResolvedValue([]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  getAgentStatus: vi.fn().mockResolvedValue({ status: "Idle" }),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  toPersisted: vi.fn((msg: unknown) => msg),
  fromPersisted: vi.fn((msg: unknown) => msg),
}));

const openPrInfo: PrInfo = {
  workspaceId: "ws-1",
  prNumber: 42,
  prUrl: "https://github.com/test/pr/42",
  title: "Add feature",
  state: "OPEN",
  checks: [],
  mergeable: "MERGEABLE",
};

function setupOpenPr(overrides: Partial<PrInfo> = {}) {
  const info = { ...openPrInfo, ...overrides };
  // Make the mock return this PR info so loadPrInfo won't overwrite our state
  mockGetPrInfo.mockResolvedValue(info);
  mockGetPrFullData.mockResolvedValue({
    info,
    reviews: [],
    reviewComments: [],
  });
  usePrStore.setState({
    prInfo: { "ws-1": info },
  });
}

beforeEach(() => {
  usePrStore.setState({
    prInfo: {},
    loading: {},
    error: {},
    subscriptions: {},
    pollIntervals: {},
  });
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", repoId: "r1", name: "Test WS", branch: "feature-1", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
    ],
    activeWorkspaceId: "ws-1",
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
  mockGetPrFullData.mockResolvedValue({
    info: { workspaceId: "ws-1", prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null },
    reviews: [],
    reviewComments: [],
  });
});

describe("PRPanel", () => {
  // === Loading State ===

  it("shows loading state", () => {
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<PRPanel workspaceId="ws-1" />);
    expect(screen.getByText("Loading PR info...")).toBeInTheDocument();
  });

  // === Create PR Form ===

  it("shows create PR form when no PR exists", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const elements = await screen.findAllByText("Create Pull Request");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("shows title input pre-filled with branch name", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const input = (await screen.findByPlaceholderText("PR title")) as HTMLInputElement;
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

  it("shows error when loadPrInfo fails", async () => {
    mockGetPrFullData.mockRejectedValueOnce(new Error("Push failed"));
    render(<PRPanel workspaceId="ws-1" />);
    expect(await screen.findByText(/Push failed/)).toBeInTheDocument();
  });

  it("updates title input on change", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const input = (await screen.findByPlaceholderText("PR title")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "New Title" } });
    });
    expect(input.value).toBe("New Title");
  });

  it("updates body textarea on change", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const textarea = (await screen.findByPlaceholderText("Describe your changes...")) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Some body text" } });
    });
    expect(textarea.value).toBe("Some body text");
  });

  it("toggles draft checkbox", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const checkbox = (await screen.findByRole("checkbox")) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);
  });

  it("submits create PR form and calls store", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    // Wait for deferred loadPrInfo to settle before interacting with form
    await waitFor(() => expect(mockGetPrFullData).toHaveBeenCalled());
    const button = await screen.findByRole("button", { name: "Create Pull Request" });
    const createPrSpy = vi.spyOn(usePrStore.getState(), "createPr");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(createPrSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      title: "feature-1",
      body: "",
      draft: false,
    });
  });

  it("disables submit button when title is empty", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const input = (await screen.findByPlaceholderText("PR title")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
    });
    const button = screen.getByRole("button", { name: "Create Pull Request" });
    expect(button).toBeDisabled();
  });

  it("does not submit when title is whitespace only", async () => {
    render(<PRPanel workspaceId="ws-1" />);
    const input = (await screen.findByPlaceholderText("PR title")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "   " } });
    });
    const button = screen.getByRole("button", { name: "Create Pull Request" });
    expect(button).toBeDisabled();
  });

  it("shows Creating... text when loading during form", async () => {
    usePrStore.setState({ loading: { "ws-1": false } });
    render(<PRPanel workspaceId="ws-1" />);
    // Wait for deferred loadPrInfo to settle so prInfo is populated
    await waitFor(() => expect(mockGetPrFullData).toHaveBeenCalled());
    await screen.findByPlaceholderText("PR title");
    // Set loading — with prInfo populated, shows "Creating..." instead of "Loading PR info..."
    await act(async () => {
      usePrStore.setState({ loading: { "ws-1": true } });
    });
    expect(screen.getByText("Creating...")).toBeInTheDocument();
  });

  it("handles create PR rejection gracefully", async () => {
    mockCreatePr.mockRejectedValueOnce(new Error("Create failed"));
    render(<PRPanel workspaceId="ws-1" />);
    const button = await screen.findByRole("button", { name: "Create Pull Request" });
    await act(async () => {
      fireEvent.click(button);
    });
    // Should not throw - error is caught in the component handler
  });

  it("shows error in create PR form", async () => {
    // Error is displayed in the create form; set error after loadPrInfo completes
    render(<PRPanel workspaceId="ws-1" />);
    await screen.findByPlaceholderText("PR title");
    await act(async () => {
      usePrStore.setState({ error: { "ws-1": "Something went wrong" } });
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("defaults title to empty string when workspace has no branch", async () => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "r1", name: "Test WS", branch: undefined as any, status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    const input = (await screen.findByPlaceholderText("PR title")) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  // === Merged View ===

  it("shows merged view when PR is merged", async () => {
    setupOpenPr({ state: "MERGED", prUrl: "https://github.com/test/pr/42" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42 Merged")).toBeInTheDocument();
    });
  });

  it("shows title in merged view", async () => {
    setupOpenPr({ state: "MERGED" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Add feature")).toBeInTheDocument();
    });
  });

  it("shows View on GitHub link in merged view", async () => {
    setupOpenPr({ state: "MERGED", prUrl: "https://github.com/test/pr/42" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const link = screen.getByText("View on GitHub");
      expect(link).toHaveAttribute("href", "https://github.com/test/pr/42");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("does not show View on GitHub link in merged view when no URL", async () => {
    setupOpenPr({ state: "MERGED", prUrl: null });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42 Merged")).toBeInTheDocument();
    });
    expect(screen.queryByText("View on GitHub")).not.toBeInTheDocument();
  });

  // === PR Status View ===

  it("shows PR status view when PR exists", async () => {
    setupOpenPr();
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42")).toBeInTheDocument();
      expect(screen.getByText("Add feature")).toBeInTheDocument();
    });
  });

  it("shows View on GitHub link for existing PR", async () => {
    setupOpenPr();
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("View on GitHub")).toBeInTheDocument();
    });
  });

  it("does not show View on GitHub link when prUrl is null", async () => {
    setupOpenPr({ prUrl: null });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42")).toBeInTheDocument();
    });
    expect(screen.queryByText("View on GitHub")).not.toBeInTheDocument();
  });

  it("shows OPEN state badge", async () => {
    setupOpenPr({ state: "OPEN" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("OPEN")).toBeInTheDocument();
    });
  });

  it("shows CLOSED state badge", async () => {
    setupOpenPr({ state: "CLOSED" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CLOSED")).toBeInTheDocument();
    });
  });

  it("shows No conflicts badge when MERGEABLE", async () => {
    setupOpenPr({ mergeable: "MERGEABLE" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No conflicts")).toBeInTheDocument();
    });
  });

  it("shows CONFLICTING badge when not mergeable", async () => {
    setupOpenPr({ mergeable: "CONFLICTING" });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CONFLICTING")).toBeInTheDocument();
    });
  });

  it("shows No checks found when checks are empty", async () => {
    setupOpenPr({ checks: [] });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No checks found")).toBeInTheDocument();
    });
  });

  it("shows CI Checks header with count when checks exist", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      // The text is split across child text nodes: "CI Checks" " " "(2)"
      const el = screen.getByText((_content, element) => {
        return element?.textContent === "CI Checks (2)" && element.tagName === "SPAN";
      });
      expect(el).toBeInTheDocument();
    });
  });

  it("shows error in PR status view", async () => {
    setupOpenPr();
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42")).toBeInTheDocument();
    });
    await act(async () => {
      usePrStore.setState({ error: { "ws-1": "Something broke" } });
    });
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  // === Check Row ===

  it("renders success check with conclusion text", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Lint")).toBeInTheDocument();
      expect(screen.getByText("failure")).toBeInTheDocument();
    });
  });

  it("renders pending check with animated dot", async () => {
    setupOpenPr({
      checks: [
        { name: "Deploy", conclusion: null, status: "IN_PROGRESS", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("failure")).toBeInTheDocument();
    });
  });

  // === Button Actions ===

  it("calls refreshChecks when Refresh button is clicked", async () => {
    setupOpenPr();
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });
    const refreshSpy = vi.spyOn(usePrStore.getState(), "refreshChecks");
    await act(async () => {
      fireEvent.click(screen.getByText("Refresh"));
    });
    expect(refreshSpy).toHaveBeenCalledWith("ws-1");
  });

  it("calls pushChanges when Push Updates button is clicked", async () => {
    setupOpenPr();
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Push Updates")).toBeInTheDocument();
    });
    const pushSpy = vi.spyOn(usePrStore.getState(), "pushChanges");
    await act(async () => {
      fireEvent.click(screen.getByText("Push Updates"));
    });
    expect(pushSpy).toHaveBeenCalledWith("ws-1");
  });

  it("shows Pushing... text when loading", async () => {
    setupOpenPr();
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pushing...")).toBeInTheDocument();
    });
  });

  it("disables Push button when loading", async () => {
    setupOpenPr();
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pushing...")).toBeDisabled();
    });
  });

  // === Fix with Claude ===

  it("shows Fix with Claude button when checks are failing", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
  });

  it("does not show Fix with Claude button when all checks pass", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("CI")).toBeInTheDocument();
    });
    expect(screen.queryByText("Fix with Claude")).not.toBeInTheDocument();
  });

  it("calls getFixMessage and sends to agent when Fix with Claude is clicked", async () => {
    setupOpenPr({
      checks: [
        { name: "CI", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
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

  // === Merge ===

  it("shows merge controls when all checks pass and PR is mergeable", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
      expect(screen.getByDisplayValue("Squash")).toBeInTheDocument();
    });
  });

  it("shows merge controls when no checks and PR is mergeable", async () => {
    setupOpenPr({ mergeable: "MERGEABLE", checks: [] });
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
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
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Squash")).toBeInTheDocument();
    });
    const select = screen.getByDisplayValue("Squash") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "rebase" } });
    });
    expect(select.value).toBe("rebase");
  });

  it("calls mergePr with changed method", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Squash")).toBeInTheDocument();
    });
    const select = screen.getByDisplayValue("Squash") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "merge" } });
    });
    const mergeSpy = vi.spyOn(usePrStore.getState(), "mergePr");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    });
    expect(mergeSpy).toHaveBeenCalledWith("ws-1", "merge");
  });

  it("disables merge button when loading", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    usePrStore.setState({ loading: { "ws-1": true } });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    });
  });

  // === Todo blocking ===

  it("shows todo badge when todos exist", async () => {
    setupOpenPr();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Fix bug", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Add test", completed: true, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Todos: 1/2")).toBeInTheDocument();
    });
  });

  it("shows todo warning when todos are pending", async () => {
    setupOpenPr();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Fix bug", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Add test", completed: true, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText(/1 of 2 todos completed/)).toBeInTheDocument();
      expect(screen.getByText(/Complete all todos before merging/)).toBeInTheDocument();
      expect(screen.getByText("View Todos")).toBeInTheDocument();
    });
  });

  it("does not show todo warning when all todos completed", async () => {
    setupOpenPr();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Fix bug", completed: true, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Add test", completed: true, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Todos: 2/2")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Complete all todos before merging/)).not.toBeInTheDocument();
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
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const mergeButton = screen.getByRole("button", { name: "Merge" });
      expect(mergeButton).toBeDisabled();
      expect(mergeButton).toHaveAttribute("title", "Complete all todos first");
    });
  });

  it("shows merge title when no pending todos", async () => {
    setupOpenPr({
      mergeable: "MERGEABLE",
      checks: [
        { name: "CI", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      const mergeButton = screen.getByRole("button", { name: "Merge" });
      expect(mergeButton).toHaveAttribute("title", "Merge this PR");
    });
  });

  // === Pending checks polling ===

  it("starts polling when there are pending checks", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: null, status: "IN_PROGRESS", detailsUrl: null, description: null },
      ],
    });
    const startPollingSpy = vi.spyOn(usePrStore.getState(), "startPolling");
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(startPollingSpy).toHaveBeenCalledWith("ws-1");
    });
  });

  it("does not start polling when all checks are completed", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    const startPollingSpy = vi.spyOn(usePrStore.getState(), "startPolling");
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
    });
    expect(startPollingSpy).not.toHaveBeenCalled();
  });

  // === Effects ===

  it("subscribes and loads PR info on mount", async () => {
    const subscribeSpy = vi.spyOn(usePrStore.getState(), "subscribe");
    const loadSpy = vi.spyOn(usePrStore.getState(), "loadPrInfo");
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(subscribeSpy).toHaveBeenCalledWith("ws-1");
      expect(loadSpy).toHaveBeenCalledWith("ws-1");
    });
  });

  it("unsubscribes on unmount", () => {
    const unsubscribeSpy = vi.spyOn(usePrStore.getState(), "unsubscribe");
    const { unmount } = render(<PRPanel workspaceId="ws-1" />);
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledWith("ws-1");
  });

  it("loads todos when PR status view is shown", async () => {
    setupOpenPr();
    const loadTodosSpy = vi.spyOn(useTodoStore.getState(), "loadTodos");
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(loadTodosSpy).toHaveBeenCalledWith("ws-1");
    });
  });

  // === Edge cases ===

  it("does not show todo badge when no todos exist", async () => {
    setupOpenPr();
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Todos:/)).not.toBeInTheDocument();
  });

  it("does not show mergeable badge when mergeable is null", async () => {
    setupOpenPr({ mergeable: null });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("PR #42")).toBeInTheDocument();
    });
    expect(screen.queryByText("No conflicts")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFLICTING")).not.toBeInTheDocument();
  });

  it("handles checks with mixed conclusions", async () => {
    setupOpenPr({
      checks: [
        { name: "Build", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Lint", conclusion: "FAILURE", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Deploy", conclusion: null, status: "IN_PROGRESS", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Build")).toBeInTheDocument();
      expect(screen.getByText("Lint")).toBeInTheDocument();
      expect(screen.getByText("Deploy")).toBeInTheDocument();
      expect(screen.getByText("Fix with Claude")).toBeInTheDocument();
    });
  });

  it("renders multiple checks with success conclusions", async () => {
    setupOpenPr({
      checks: [
        { name: "Check A", conclusion: "SUCCESS", status: "COMPLETED", detailsUrl: null, description: null },
        { name: "Check B", conclusion: "success", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Check A")).toBeInTheDocument();
      expect(screen.getByText("Check B")).toBeInTheDocument();
    });
  });

  it("shows pending check with QUEUED status", async () => {
    setupOpenPr({
      checks: [
        { name: "Test", conclusion: null, status: "QUEUED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
      expect(screen.getByText("pending")).toBeInTheDocument();
    });
  });

  it("handles PR info with undefined checks (uses empty array fallback)", async () => {
    const info = {
      workspaceId: "ws-1",
      prNumber: 42,
      prUrl: null,
      title: "Test",
      state: "OPEN",
      checks: undefined as any,
      mergeable: null,
    };
    mockGetPrInfo.mockResolvedValue(info);
    usePrStore.setState({ prInfo: { "ws-1": info } });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("No checks found")).toBeInTheDocument();
    });
  });

  it("renders check with non-success non-failure conclusion", async () => {
    setupOpenPr({
      checks: [
        { name: "Neutral Check", conclusion: "NEUTRAL", status: "COMPLETED", detailsUrl: null, description: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    await waitFor(() => {
      expect(screen.getByText("Neutral Check")).toBeInTheDocument();
      expect(screen.getByText("neutral")).toBeInTheDocument();
    });
  });

  it("handleSubmit returns early when title is empty", async () => {
    // Set workspace branch to empty so title starts as empty string
    useWorkspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "r1", name: "Test WS", branch: "", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      ],
    });
    render(<PRPanel workspaceId="ws-1" />);
    // Wait for deferred loadPrInfo to complete before accessing fiber props
    await waitFor(() => expect(mockGetPrFullData).toHaveBeenCalled());
    const button = await screen.findByRole("button", { name: "Create Pull Request" });
    expect(button).toBeDisabled();

    // Directly invoke the onClick handler via React fiber to bypass the disabled button check,
    // exercising the handleSubmit early return guard when title is empty.
    const createPrSpy = vi.spyOn(usePrStore.getState(), "createPr");
    const fiber = Object.keys(button).find(k => k.startsWith("__reactFiber"));
    const onClick = fiber ? (button as any)[fiber]?.memoizedProps?.onClick : null;
    expect(onClick).toBeDefined();
    await act(async () => {
      onClick();
    });
    expect(createPrSpy).not.toHaveBeenCalled();
  });
});
