import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStore } from "../../stores/chatStore";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useTodoStore } from "../../stores/todoStore";

vi.mock("./MessageList", () => ({
  MessageList: ({ messages, streamingText, agentStatus }: any) => (
    <div data-testid="message-list">
      <span data-testid="msg-count">{messages.length}</span>
      <span data-testid="streaming">{streamingText}</span>
      <span data-testid="agent-status">{typeof agentStatus === "string" ? agentStatus : "Error"}</span>
    </div>
  ),
}));

vi.mock("./Composer", () => ({
  Composer: ({ contextId, agentStatus, onSend, onStop }: any) => (
    <div data-testid="composer">
      <span data-testid="composer-ctx">{contextId}</span>
      <button data-testid="send-btn" onClick={() => onSend("test message")}>Send</button>
      <button data-testid="stop-btn" onClick={() => onStop()}>Stop</button>
    </div>
  ),
}));

vi.mock("../../lib/tauri", () => ({
  listChatMessages: vi.fn().mockResolvedValue([]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  getAgentStatus: vi.fn().mockResolvedValue({ status: "Idle" }),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  stopAgent: vi.fn().mockResolvedValue(undefined),
  listCheckpoints: vi.fn().mockResolvedValue([]),
  revertToCheckpoint: vi.fn().mockResolvedValue(undefined),
  listTodos: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

beforeEach(() => {
  useAgentStore.setState({ agents: {} });
  useChatStore.setState({ messages: {}, streamingText: {} });
  useCheckpointStore.setState({ checkpoints: {}, revertedTurnIndex: {} });
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
      agents: { "ws-1": { status: "Running", sessionId: null, startedAt: null } },
    });
    render(<ChatPanel contextId="ws-1" contextType="workspace" />);
    expect(screen.getByTestId("agent-status")).toHaveTextContent("Running");
  });
});
