import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { respondToPermission } from "../../lib/tauri";

// Capture props passed to mocked components so we can invoke callbacks

vi.mock("./MessageList", () => ({
  MessageList: (props: any) => {
    return (
      <div data-testid="message-list">
        <span data-testid="msg-count">{props.messages.length}</span>
        <span data-testid="streaming">{props.streamingText}</span>
        <span data-testid="agent-status">{typeof props.agentStatus === "string" ? props.agentStatus : "Error"}</span>
        <span data-testid="ml-context-id">{props.contextId ?? ""}</span>
        <span data-testid="ml-context-type">{props.contextType ?? ""}</span>
        {props.onRetry && (
          <button data-testid="retry-btn" onClick={props.onRetry}>Retry</button>
        )}
      </div>
    );
  },
  segmentTurns: (messages: any[]) => {
    const turns = messages
      .filter((m: any) => m.role === "user")
      .map((m: any) => ({ userMessage: m, responses: [] }));
    return { orphans: [], turns };
  },
}));

vi.mock("./ChatTOC", () => ({
  ChatTOC: (props: any) => (
    <div data-testid="chat-toc">
      <span data-testid="toc-turn-count">{props.turns.length}</span>
      <button data-testid="toc-close" onClick={props.onClose}>Close</button>
    </div>
  ),
}));

vi.mock("./Composer", () => ({
  Composer: (props: any) => {
    return (
      <div data-testid="composer">
        <span data-testid="composer-ctx">{props.contextId}</span>
        <span data-testid="composer-agent-status">{typeof props.agentStatus === "string" ? props.agentStatus : "Error"}</span>
        <span data-testid="composer-plan-approval">{String(props.isPlanApproval)}</span>
        <span data-testid="composer-permission">{props.permissionRequest ? JSON.stringify(props.permissionRequest) : "null"}</span>
        <button data-testid="send-btn" onClick={() => props.onSend("test message")}>Send</button>
        <button data-testid="stop-btn" onClick={() => props.onStop()}>Stop</button>
        {props.onApprovePlan && (
          <button data-testid="approve-plan-btn" onClick={props.onApprovePlan}>Approve Plan</button>
        )}
        {props.onCopyPlan && (
          <button data-testid="copy-plan-btn" onClick={props.onCopyPlan}>Copy Plan</button>
        )}
        {props.onRespondToPermission && (
          <>
            <button data-testid="permission-approve-btn" onClick={() => props.onRespondToPermission(true)}>Allow</button>
            <button data-testid="permission-deny-btn" onClick={() => props.onRespondToPermission(false)}>Deny</button>
          </>
        )}
        {props.onLinkWorkspaces && (
          <button data-testid="link-workspaces-btn" onClick={props.onLinkWorkspaces}>Link Workspaces</button>
        )}
        {props.onLinkIssue && (
          <button data-testid="link-issue-btn" onClick={props.onLinkIssue}>Link Issue</button>
        )}
      </div>
    );
  },
}));

vi.mock("../workspace/LinkWorkspaceDialog", () => ({
  LinkWorkspaceDialog: (props: any) => (
    <div data-testid="link-workspace-dialog">
      <span data-testid="lwd-workspace-id">{props.workspaceId}</span>
      <span data-testid="lwd-workspace-name">{props.workspaceName}</span>
      <button data-testid="lwd-close" onClick={props.onClose}>Close</button>
    </div>
  ),
}));

vi.mock("../workspace/IssuePicker", () => ({
  IssuePicker: (props: any) => (
    <div data-testid="issue-picker">
      <span data-testid="ip-workspace-id">{props.workspaceId}</span>
      <button data-testid="ip-close" onClick={props.onClose}>Close</button>
    </div>
  ),
}));

vi.mock("../../lib/tauri", () => ({
  listChatMessages: vi.fn().mockResolvedValue([]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  getAgentStatus: vi.fn().mockResolvedValue({ workspaceId: "ws-1", status: "Idle", sessionId: null, startedAt: null }),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  stopAgent: vi.fn().mockResolvedValue(undefined),
  listCheckpoints: vi.fn().mockResolvedValue([]),
  revertToCheckpoint: vi.fn().mockResolvedValue(undefined),
  listTodos: vi.fn().mockResolvedValue([]),
  respondToPermission: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
  toPersisted: vi.fn().mockImplementation((msg: any) => msg),
  fromPersisted: vi.fn().mockImplementation((msg: any) => msg),
}));

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  useChatStore.setState({ messages: {}, streamingText: {}, subscriptions: {} });
  useCheckpointStore.setState({ checkpoints: {}, revertedTurnIndex: {}, subscriptions: {} });
  useTodoStore.setState({ todos: {} });
  useWorkspaceStore.setState({ workspaces: [], archivedWorkspaces: [], activeWorkspaceId: null, activeRepoId: null, loading: false, error: null });
  vi.clearAllMocks();
});

describe("ChatPanel", () => {
  it("renders MessageList and Composer", () => {
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("passes contextId and contextType to MessageList", () => {
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("ml-context-id")).toHaveTextContent("ws-1");
    expect(screen.getByTestId("ml-context-type")).toHaveTextContent("workspace");
  });

  it("passes contextId to Composer", () => {
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("composer-ctx")).toHaveTextContent("ws-1");
  });

  it("passes empty messages by default", () => {
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("msg-count")).toHaveTextContent("0");
  });

  it("passes messages from chat store", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hi" }], timestamp: 1 },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Hello" }], timestamp: 2 },
        ],
      },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("msg-count")).toHaveTextContent("2");
  });

  it("passes streaming text from chat store", () => {
    useChatStore.setState({
      streamingText: { "ws-1": "typing..." },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("streaming")).toHaveTextContent("typing...");
  });

  it("passes agent status from agent store", () => {
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running", sessionId: null, startedAt: null } },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("agent-status")).toHaveTextContent("Running");
  });

  // --- handleSend callback ---
  it("handleSend adds user message and sends via agent store", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    const addUserMessageSpy = vi.fn();
    useAgentStore.setState({
      agents: {},
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      addUserMessage: addUserMessageSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("send-btn"));
    expect(addUserMessageSpy).toHaveBeenCalledWith("ws-1", "test message", undefined);
    expect(sendMessageSpy).toHaveBeenCalledWith("ws-1", "test message", "workspace", undefined, undefined, undefined);
  });

  it("handleSend catches send errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendMessageSpy = vi.fn().mockRejectedValue(new Error("send failed"));
    useAgentStore.setState({
      agents: {},
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      addUserMessage: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("send-btn"));
    expect(consoleError).toHaveBeenCalledWith("Failed to send message:", expect.any(Error));
    consoleError.mockRestore();
  });

  // --- handleStop callback ---
  it("handleStop calls stopAgent", async () => {
    const stopAgentSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: {},
      subscriptions: {},
      stopAgent: stopAgentSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("stop-btn"));
    expect(stopAgentSpy).toHaveBeenCalledWith("ws-1");
  });

  it("handleStop catches errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const stopAgentSpy = vi.fn().mockRejectedValue(new Error("stop failed"));
    useAgentStore.setState({
      agents: {},
      subscriptions: {},
      stopAgent: stopAgentSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("stop-btn"));
    expect(consoleError).toHaveBeenCalledWith("Failed to stop agent:", expect.any(Error));
    consoleError.mockRestore();
  });

  // --- handleRetry callback ---
  it("handleRetry resends the last user message", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    const addUserMessageSpy = vi.fn();
    const removeTrailingSpy = vi.fn();
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Idle", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Hi back" }], timestamp: 2 },
          { id: "m3", role: "system", content: [{ type: "text", text: "Error occurred" }], timestamp: 3 },
        ],
      },
      streamingText: {},
      subscriptions: {},
      addUserMessage: addUserMessageSpy,
      removeTrailingSystemMessages: removeTrailingSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(removeTrailingSpy).toHaveBeenCalledWith("ws-1");
    expect(addUserMessageSpy).toHaveBeenCalledWith("ws-1", "Hello", undefined);
    expect(sendMessageSpy).toHaveBeenCalledWith("ws-1", "Hello", "workspace", undefined, undefined, undefined);
  });

  it("handleRetry does nothing when agent is Running", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      fetchStatus: vi.fn(),
    });
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
        ],
      },
      streamingText: {},
      subscriptions: {},
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("handleRetry does nothing when agent is Stopping", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Stopping", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      fetchStatus: vi.fn(),
    });
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
        ],
      },
      streamingText: {},
      subscriptions: {},
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("handleRetry does nothing when there are no user messages", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Idle", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "assistant", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
        ],
      },
      streamingText: {},
      subscriptions: {},
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("handleRetry does nothing when last user message has no text content", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Idle", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "toolUse", id: "t1", name: "test", input: {} }], timestamp: 1 },
        ],
      },
      streamingText: {},
      subscriptions: {},
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("handleRetry catches send errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendMessageSpy = vi.fn().mockRejectedValue(new Error("retry failed"));
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Idle", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
        ],
      },
      streamingText: {},
      subscriptions: {},
      addUserMessage: vi.fn(),
      removeTrailingSystemMessages: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(consoleError).toHaveBeenCalledWith("Failed to retry message:", expect.any(Error));
    consoleError.mockRestore();
  });

  // --- workspace vs repo context ---

  it("passes agent status to Composer", () => {
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running", sessionId: null, startedAt: null } },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("composer-agent-status")).toHaveTextContent("Running");
  });

  // --- handleSend with repo context ---
  it("handleSend passes repo contextType correctly", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: {},
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      addUserMessage: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="repo-1" contextType="repo" />);
    await user.click(screen.getByTestId("send-btn"));
    expect(sendMessageSpy).toHaveBeenCalledWith("repo-1", "test message", "repo", undefined, undefined, undefined);
  });

  // --- handleRetry with repo context ---
  it("handleRetry sends with repo contextType", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    useAgentStore.setState({
      agents: { "repo-1": { workspaceId: "repo-1", status: "Idle", sessionId: null, startedAt: null } },
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {
        "repo-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Fix it" }], timestamp: 1 },
        ],
      },
      streamingText: {},
      subscriptions: {},
      addUserMessage: vi.fn(),
      removeTrailingSystemMessages: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="repo-1" contextType="repo" />);
    await user.click(screen.getByTestId("retry-btn"));
    expect(sendMessageSpy).toHaveBeenCalledWith("repo-1", "Fix it", "repo", undefined, undefined, undefined);
  });

  // --- TOC toggle tests ---

  it("does not show TOC toggle button with fewer than 3 turns", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Hi" }], timestamp: 2 },
          { id: "m3", role: "user", content: [{ type: "text", text: "How are you" }], timestamp: 3 },
          { id: "m4", role: "assistant", content: [{ type: "text", text: "Good" }], timestamp: 4 },
        ],
      },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.queryByTitle("Table of Contents")).not.toBeInTheDocument();
  });

  it("shows TOC toggle button when 3+ turns exist", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Hi" }], timestamp: 2 },
          { id: "m3", role: "user", content: [{ type: "text", text: "How" }], timestamp: 3 },
          { id: "m4", role: "assistant", content: [{ type: "text", text: "Good" }], timestamp: 4 },
          { id: "m5", role: "user", content: [{ type: "text", text: "Thanks" }], timestamp: 5 },
          { id: "m6", role: "assistant", content: [{ type: "text", text: "Welcome" }], timestamp: 6 },
        ],
      },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTitle("Table of Contents")).toBeInTheDocument();
  });

  it("toggles ChatTOC visibility on button click", async () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "A" }], timestamp: 1 },
          { id: "m2", role: "user", content: [{ type: "text", text: "B" }], timestamp: 2 },
          { id: "m3", role: "user", content: [{ type: "text", text: "C" }], timestamp: 3 },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    // TOC should not be visible initially
    expect(screen.queryByTestId("chat-toc")).not.toBeInTheDocument();

    // Click toggle to show
    await user.click(screen.getByTitle("Table of Contents"));
    expect(screen.getByTestId("chat-toc")).toBeInTheDocument();
    expect(screen.getByTestId("toc-turn-count")).toHaveTextContent("3");
  });

  it("closes ChatTOC when toggle button is clicked again", async () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "A" }], timestamp: 1 },
          { id: "m2", role: "user", content: [{ type: "text", text: "B" }], timestamp: 2 },
          { id: "m3", role: "user", content: [{ type: "text", text: "C" }], timestamp: 3 },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    await user.click(screen.getByTitle("Table of Contents"));
    expect(screen.getByTestId("chat-toc")).toBeInTheDocument();

    await user.click(screen.getByTitle("Table of Contents"));
    expect(screen.queryByTestId("chat-toc")).not.toBeInTheDocument();
  });

  it("closes ChatTOC when clicking outside the TOC (mousedown on document)", async () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "A" }], timestamp: 1 },
          { id: "m2", role: "user", content: [{ type: "text", text: "B" }], timestamp: 2 },
          { id: "m3", role: "user", content: [{ type: "text", text: "C" }], timestamp: 3 },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    // Open the TOC
    await user.click(screen.getByTitle("Table of Contents"));
    expect(screen.getByTestId("chat-toc")).toBeInTheDocument();

    // Simulate a mousedown on document.body (outside TOC and TOC button)
    // Using fireEvent to dispatch on document.body so the event
    // bubbles up to the document-level listener with a proper target node
    act(() => {
      fireEvent.mouseDown(document.body);
    });

    // TOC should close
    expect(screen.queryByTestId("chat-toc")).not.toBeInTheDocument();
  });

  it("closes ChatTOC when onClose callback fires", async () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "A" }], timestamp: 1 },
          { id: "m2", role: "user", content: [{ type: "text", text: "B" }], timestamp: 2 },
          { id: "m3", role: "user", content: [{ type: "text", text: "C" }], timestamp: 3 },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    await user.click(screen.getByTitle("Table of Contents"));
    expect(screen.getByTestId("chat-toc")).toBeInTheDocument();

    await user.click(screen.getByTestId("toc-close"));
    expect(screen.queryByTestId("chat-toc")).not.toBeInTheDocument();
  });

  // --- handleRespondToPermission ---

  it("handleRespondToPermission approves permission and clears request", async () => {
    const clearPermSpy = vi.fn();
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      permissionRequest: { "ws-1": { toolName: "bash", input: { command: "ls" } } },
      clearPermissionRequest: clearPermSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("permission-approve-btn"));
    expect(respondToPermission).toHaveBeenCalledWith("ws-1", true);
    expect(clearPermSpy).toHaveBeenCalledWith("ws-1");
  });

  it("handleRespondToPermission denies permission and clears request", async () => {
    const clearPermSpy = vi.fn();
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      permissionRequest: { "ws-1": { toolName: "bash", input: { command: "rm -rf" } } },
      clearPermissionRequest: clearPermSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("permission-deny-btn"));
    expect(respondToPermission).toHaveBeenCalledWith("ws-1", false);
    expect(clearPermSpy).toHaveBeenCalledWith("ws-1");
  });

  it("handleRespondToPermission catches errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(respondToPermission).mockRejectedValueOnce(new Error("permission failed"));
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      permissionRequest: { "ws-1": { toolName: "bash", input: {} } },
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("permission-approve-btn"));
    expect(consoleError).toHaveBeenCalledWith("Failed to respond to permission:", expect.any(Error));
    consoleError.mockRestore();
  });

  // --- handleApprovePlan ---

  it("handleApprovePlan sends 'yes' via handleSend", async () => {
    const sendMessageSpy = vi.fn().mockResolvedValue(undefined);
    const addUserMessageSpy = vi.fn();
    useAgentStore.setState({
      agents: {},
      subscriptions: {},
      sendMessage: sendMessageSpy,
    });
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      planApproval: { "ws-1": true },
      addUserMessage: addUserMessageSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("composer-plan-approval")).toHaveTextContent("true");
    await user.click(screen.getByTestId("approve-plan-btn"));
    expect(addUserMessageSpy).toHaveBeenCalledWith("ws-1", "yes", undefined);
    expect(sendMessageSpy).toHaveBeenCalledWith("ws-1", "yes", "workspace", undefined, undefined, undefined);
  });

  // --- handleCopyPlan ---

  it("handleCopyPlan copies plan content to clipboard", async () => {
    const getPlanContentSpy = vi.fn().mockReturnValue("Step 1: Do this\nStep 2: Do that");
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      planApproval: { "ws-1": true },
      getPlanContent: getPlanContentSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    // Spy on the clipboard.writeText that userEvent.setup() installed
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByTestId("copy-plan-btn"));
    await vi.waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith("Step 1: Do this\nStep 2: Do that");
    });
    expect(getPlanContentSpy).toHaveBeenCalledWith("ws-1");
    writeTextSpy.mockRestore();
  });

  it("handleCopyPlan does nothing when plan is empty", async () => {
    const getPlanContentSpy = vi.fn().mockReturnValue("");
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      planApproval: { "ws-1": true },
      getPlanContent: getPlanContentSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByTestId("copy-plan-btn"));
    expect(writeTextSpy).not.toHaveBeenCalled();
    writeTextSpy.mockRestore();
  });

  it("handleCopyPlan catches clipboard errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const getPlanContentSpy = vi.fn().mockReturnValue("some plan");
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      getPlanContent: getPlanContentSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    // Make clipboard.writeText reject
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("clipboard fail"));
    await user.click(screen.getByTestId("copy-plan-btn"));
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("[ChatPanel] Failed to copy plan to clipboard:", expect.any(Error));
    });
    writeTextSpy.mockRestore();
    consoleError.mockRestore();
  });

  // --- LinkWorkspaceDialog and IssuePicker ---

  it("shows Link Workspaces and Link Issue buttons for workspace context", () => {
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("link-workspaces-btn")).toBeInTheDocument();
    expect(screen.getByTestId("link-issue-btn")).toBeInTheDocument();
  });

  it("does not show Link Workspaces or Link Issue buttons for repo context", () => {
    render(<ChatPanel contextId="repo-1" contextType="repo" />);
    expect(screen.queryByTestId("link-workspaces-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-issue-btn")).not.toBeInTheDocument();
  });

  it("opens LinkWorkspaceDialog when Link Workspaces is clicked (workspace with data)", async () => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "My Workspace", branch: "main", status: "Running" as any, portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      ],
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    expect(screen.queryByTestId("link-workspace-dialog")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("link-workspaces-btn"));
    expect(screen.getByTestId("link-workspace-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("lwd-workspace-id")).toHaveTextContent("ws-1");
    expect(screen.getByTestId("lwd-workspace-name")).toHaveTextContent("My Workspace");
  });

  it("closes LinkWorkspaceDialog when onClose fires", async () => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "ws-1", repoId: "repo-1", name: "My Workspace", branch: "main", status: "Running" as any, portBase: 3000, autoCommit: false, pinned: false, createdAt: "2024-01-01", archivedAt: null },
      ],
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    await user.click(screen.getByTestId("link-workspaces-btn"));
    expect(screen.getByTestId("link-workspace-dialog")).toBeInTheDocument();

    await user.click(screen.getByTestId("lwd-close"));
    expect(screen.queryByTestId("link-workspace-dialog")).not.toBeInTheDocument();
  });

  it("does not show LinkWorkspaceDialog when workspace data is missing", async () => {
    // No workspace in store for ws-1
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    await user.click(screen.getByTestId("link-workspaces-btn"));
    // The dialog should not render because workspace is null
    expect(screen.queryByTestId("link-workspace-dialog")).not.toBeInTheDocument();
  });

  it("opens IssuePicker when Link Issue is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    expect(screen.queryByTestId("issue-picker")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("link-issue-btn"));
    expect(screen.getByTestId("issue-picker")).toBeInTheDocument();
    expect(screen.getByTestId("ip-workspace-id")).toHaveTextContent("ws-1");
  });

  it("closes IssuePicker when onClose fires", async () => {
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);

    await user.click(screen.getByTestId("link-issue-btn"));
    expect(screen.getByTestId("issue-picker")).toBeInTheDocument();

    await user.click(screen.getByTestId("ip-close"));
    expect(screen.queryByTestId("issue-picker")).not.toBeInTheDocument();
  });

  // --- Permission request clearing when agent stops ---

  it("clears stale permission request when agent stops running", () => {
    const clearPermSpy = vi.fn();
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      permissionRequest: { "ws-1": { toolName: "bash", input: {} } },
      clearPermissionRequest: clearPermSpy,
    });
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Idle", sessionId: null, startedAt: null } },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(clearPermSpy).toHaveBeenCalledWith("ws-1");
  });

  it("does not clear permission request while agent is running", () => {
    const clearPermSpy = vi.fn();
    useChatStore.setState({
      messages: {},
      streamingText: {},
      subscriptions: {},
      permissionRequest: { "ws-1": { toolName: "bash", input: {} } },
      clearPermissionRequest: clearPermSpy,
    });
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running", sessionId: null, startedAt: null } },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(clearPermSpy).not.toHaveBeenCalled();
  });
});
