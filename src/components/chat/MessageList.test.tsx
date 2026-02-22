import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { ChatMessage, Checkpoint } from "../../lib/tauri";

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`msg-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock("./CheckpointIndicator", () => ({
  CheckpointIndicator: ({ checkpoint }: { checkpoint: Checkpoint }) => (
    <div data-testid={`cp-${checkpoint.id}`}>Checkpoint {checkpoint.turnIndex}</div>
  ),
}));

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "hello",
    timestamp: "2025-01-01T00:00:00Z",
    ...overrides,
  } as ChatMessage;
}

describe("MessageList", () => {
  it("shows empty state when no messages and no streaming text", () => {
    render(
      <MessageList
        messages={[]}
        streamingText=""
        agentStatus="Idle"
      />,
    );
    expect(screen.getByText("Send a message to start chatting with Claude Code")).toBeInTheDocument();
  });

  it("renders messages", () => {
    const msgs = [
      makeMsg({ id: "m1", content: "hello" }),
      makeMsg({ id: "m2", role: "assistant", content: "hi" }),
    ];
    render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    expect(screen.getByTestId("msg-m1")).toBeInTheDocument();
    expect(screen.getByTestId("msg-m2")).toBeInTheDocument();
  });

  it("shows streaming text with cursor", () => {
    render(
      <MessageList
        messages={[]}
        streamingText="typing..."
        agentStatus="Running"
      />,
    );
    expect(screen.getByText("typing...")).toBeInTheDocument();
  });

  it("shows thinking indicator when running with no streaming text", () => {
    render(
      <MessageList
        messages={[makeMsg()]}
        streamingText=""
        agentStatus="Running"
      />,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("does not show thinking indicator when idle", () => {
    render(
      <MessageList
        messages={[makeMsg()]}
        streamingText=""
        agentStatus="Idle"
      />,
    );
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });

  it("renders checkpoint indicators before user messages", () => {
    const msgs = [
      makeMsg({ id: "m1", role: "user" }),
      makeMsg({ id: "m2", role: "assistant" }),
    ];
    const checkpoints: Checkpoint[] = [
      { id: "cp-1", turnIndex: 0, createdAt: "2025-01-01T00:00:00Z" } as Checkpoint,
    ];
    render(
      <MessageList
        messages={msgs}
        streamingText=""
        agentStatus="Idle"
        checkpoints={checkpoints}
        onRevertCheckpoint={vi.fn()}
      />,
    );
    expect(screen.getByTestId("cp-cp-1")).toBeInTheDocument();
  });
});
