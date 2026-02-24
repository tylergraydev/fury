import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList, segmentTurns } from "./MessageList";
import type { ChatMessage } from "../../lib/tauri";

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("./MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message, onRetry }: any) => (
    <div data-testid={`msg-${message.id}`} data-role={message.role}>
      {message.content.map((c: any) => c.text).join("")}
      {onRetry && <button data-testid={`retry-${message.id}`} onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "user",
    content: [{ type: "text" as const, text: "hello" }],
    timestamp: Date.now(),
    ...overrides,
  };
}

type ContentInput = ChatMessage["content"];
function txt(text: string): ContentInput {
  return [{ type: "text" as const, text }];
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
      makeMsg({ id: "m1", content: txt("hello") }),
      makeMsg({ id: "m2", role: "assistant", content: txt("hi") }),
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

  // --- Tests for revertedTurnIndex dimming ---

  it("dims user messages after the revert point", () => {
    const msgs = [
      makeMsg({ id: "m1", role: "user", content: txt("first user msg") }),
      makeMsg({ id: "m2", role: "assistant", content: txt("first assistant") }),
      makeMsg({ id: "m3", role: "user", content: txt("second user msg") }),
      makeMsg({ id: "m4", role: "assistant", content: txt("second assistant") }),
    ];
    render(
      <MessageList
        messages={msgs}
        streamingText=""
        agentStatus="Idle"
        revertedTurnIndex={0}
      />,
    );
    // m1 is user msg index 0, revertedTurnIndex is 0, so userMsgIndex-1 = 0 which is NOT > 0
    // m3 is user msg index 1, revertedTurnIndex is 0, so userMsgIndex-1 = 1 which IS > 0
    const m3Wrapper = screen.getByTestId("msg-m3").parentElement;
    expect(m3Wrapper?.style.opacity).toBe("0.4");

    // m1 should NOT be dimmed
    const m1Wrapper = screen.getByTestId("msg-m1").parentElement;
    expect(m1Wrapper?.style.opacity).toBe("1");
  });

  it("does not dim non-user messages after revert point", () => {
    const msgs = [
      makeMsg({ id: "m1", role: "user", content: txt("user msg") }),
      makeMsg({ id: "m2", role: "assistant", content: txt("assistant msg") }),
      makeMsg({ id: "m3", role: "user", content: txt("second user") }),
    ];
    render(
      <MessageList
        messages={msgs}
        streamingText=""
        agentStatus="Idle"
        revertedTurnIndex={0}
      />,
    );
    // Assistant messages should NOT be dimmed regardless of position
    const m2Wrapper = screen.getByTestId("msg-m2").parentElement;
    expect(m2Wrapper?.style.opacity).toBe("1");
  });

  // --- Test that onRetry is passed to system messages ---

  it("passes onRetry to system messages only", () => {
    const onRetry = vi.fn();
    const msgs = [
      makeMsg({ id: "m1", role: "user", content: txt("hello") }),
      makeMsg({ id: "m2", role: "assistant", content: txt("hi") }),
      makeMsg({ id: "m3", role: "system", content: txt("error occurred") }),
    ];
    render(
      <MessageList
        messages={msgs}
        streamingText=""
        agentStatus="Idle"
        onRetry={onRetry}
      />,
    );
    // System message should have retry button
    expect(screen.getByTestId("retry-m3")).toBeInTheDocument();
    // User and assistant should NOT have retry buttons
    expect(screen.queryByTestId("retry-m1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("retry-m2")).not.toBeInTheDocument();
  });

  // --- scrollIntoView is called ---

  it("calls scrollIntoView when messages change", () => {
    const msgs = [makeMsg({ id: "m1" })];
    render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("adds data-turn-index attributes to turn wrappers", () => {
    const msgs = [
      makeMsg({ id: "m1", role: "user", content: txt("first") }),
      makeMsg({ id: "m2", role: "assistant", content: txt("reply") }),
      makeMsg({ id: "m3", role: "user", content: txt("second") }),
      makeMsg({ id: "m4", role: "assistant", content: txt("reply2") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const turn1 = container.querySelector('[data-turn-index="1"]');
    expect(turn0).toBeInTheDocument();
    expect(turn1).toBeInTheDocument();
    // Turn 0 should contain message m1
    expect(turn0?.querySelector('[data-testid="msg-m1"]')).toBeInTheDocument();
    // Turn 1 should contain message m3
    expect(turn1?.querySelector('[data-testid="msg-m3"]')).toBeInTheDocument();
  });
});

describe("segmentTurns", () => {
  it("returns empty arrays for empty input", () => {
    const result = segmentTurns([]);
    expect(result.orphans).toEqual([]);
    expect(result.turns).toEqual([]);
  });

  it("classifies leading non-user messages as orphans", () => {
    const msgs = [
      makeMsg({ id: "a1", role: "assistant" }),
      makeMsg({ id: "s1", role: "system" }),
      makeMsg({ id: "u1", role: "user" }),
    ];
    const result = segmentTurns(msgs);
    expect(result.orphans).toHaveLength(2);
    expect(result.orphans[0].id).toBe("a1");
    expect(result.orphans[1].id).toBe("s1");
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].userMessage.id).toBe("u1");
  });

  it("groups consecutive non-user messages as responses in the current turn", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user" }),
      makeMsg({ id: "a1", role: "assistant" }),
      makeMsg({ id: "a2", role: "assistant" }),
      makeMsg({ id: "u2", role: "user" }),
    ];
    const result = segmentTurns(msgs);
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].responses).toHaveLength(2);
    expect(result.turns[0].responses[0].id).toBe("a1");
    expect(result.turns[0].responses[1].id).toBe("a2");
    expect(result.turns[1].responses).toHaveLength(0);
  });

  it("handles a single user message with no responses", () => {
    const msgs = [makeMsg({ id: "u1", role: "user" })];
    const result = segmentTurns(msgs);
    expect(result.orphans).toEqual([]);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].userMessage.id).toBe("u1");
    expect(result.turns[0].responses).toEqual([]);
  });
});
