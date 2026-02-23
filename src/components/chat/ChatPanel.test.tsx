import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";

// Capture props passed to mocked components so we can invoke callbacks

vi.mock("./MessageList", () => ({
  MessageList: (props: any) => {
    return (
      <div data-testid="message-list">
        <span data-testid="msg-count">{props.messages.length}</span>
        <span data-testid="streaming">{props.streamingText}</span>
        <span data-testid="agent-status">{typeof props.agentStatus === "string" ? props.agentStatus : "Error"}</span>
        <span data-testid="has-checkpoints">{props.checkpoints ? "yes" : "no"}</span>
        <span data-testid="has-revert">{props.onRevertCheckpoint ? "yes" : "no"}</span>
        <span data-testid="reverted-turn">{props.revertedTurnIndex ?? "null"}</span>
        {props.onRetry && (
          <button data-testid="retry-btn" onClick={props.onRetry}>Retry</button>
        )}
        {props.onRevertCheckpoint && (
          <button data-testid="revert-btn" onClick={() => props.onRevertCheckpoint("cp-1")}>Revert</button>
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
        <button data-testid="send-btn" onClick={() => props.onSend("test message")}>Send</button>
        <button data-testid="stop-btn" onClick={() => props.onStop()}>Stop</button>
      </div>
    );
  },
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
  listen: vi.fn().mockResolvedValue(() => {}),
  toPersisted: vi.fn().mockImplementation((msg: any) => msg),
  fromPersisted: vi.fn().mockImplementation((msg: any) => msg),
}));

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  useChatStore.setState({ messages: {}, streamingText: {}, subscriptions: {} });
  useCheckpointStore.setState({ checkpoints: {}, revertedTurnIndex: {}, subscriptions: {} });
  useTodoStore.setState({ todos: {} });
  vi.clearAllMocks();
});

describe("ChatPanel", () => {
  it("renders MessageList and Composer", () => {
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByTestId("composer")).toBeInTheDocument();
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

  // --- handleRevert callback ---
  it("handleRevert calls revertToCheckpoint", async () => {
    const revertSpy = vi.fn().mockResolvedValue(undefined);
    useCheckpointStore.setState({
      checkpoints: { "ws-1": [{ id: "cp-1", workspaceId: "ws-1", turnIndex: 0, createdAt: "2025-01-01T00:00:00Z" }] as any },
      revertedTurnIndex: {},
      subscriptions: {},
      revertToCheckpoint: revertSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("revert-btn"));
    expect(revertSpy).toHaveBeenCalledWith("ws-1", "cp-1");
  });

  it("handleRevert catches errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const revertSpy = vi.fn().mockRejectedValue(new Error("revert failed"));
    useCheckpointStore.setState({
      checkpoints: { "ws-1": [{ id: "cp-1", workspaceId: "ws-1", turnIndex: 0, createdAt: "2025-01-01T00:00:00Z" }] as any },
      revertedTurnIndex: {},
      subscriptions: {},
      revertToCheckpoint: revertSpy,
    });
    const user = userEvent.setup();
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    await user.click(screen.getByTestId("revert-btn"));
    expect(consoleError).toHaveBeenCalledWith("Failed to revert:", expect.any(Error));
    consoleError.mockRestore();
  });

  // --- workspace vs repo context ---
  it("passes checkpoints and onRevertCheckpoint for workspace context", () => {
    useCheckpointStore.setState({
      checkpoints: { "ws-1": [{ id: "cp-1", workspaceId: "ws-1", turnIndex: 0, createdAt: "2025-01-01T00:00:00Z" }] as any },
      revertedTurnIndex: {},
      subscriptions: {},
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("has-checkpoints")).toHaveTextContent("yes");
    expect(screen.getByTestId("has-revert")).toHaveTextContent("yes");
  });

  it("does not pass checkpoints or onRevertCheckpoint for repo context", () => {
    render(<ChatPanel contextId="repo-1" contextType="repo" />);
    expect(screen.getByTestId("has-checkpoints")).toHaveTextContent("no");
    expect(screen.getByTestId("has-revert")).toHaveTextContent("no");
  });

  it("passes revertedTurnIndex from checkpoint store", () => {
    useCheckpointStore.setState({
      checkpoints: {},
      revertedTurnIndex: { "ws-1": 3 },
      subscriptions: {},
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("reverted-turn")).toHaveTextContent("3");
  });

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
});
