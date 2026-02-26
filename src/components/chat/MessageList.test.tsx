import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageList, segmentTurns } from "./MessageList";
import type { ChatMessage } from "../../lib/tauri";

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("lucide-react", () => ({
  ChevronRight: () => <span data-testid="chevron-right" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
}));

vi.mock("./ThinkingSpinner", () => ({
  ThinkingSpinner: () => <div data-testid="thinking-spinner" />,
}));

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
    expect(screen.getByTestId("thinking-spinner")).toBeInTheDocument();
  });

  it("does not show thinking indicator when idle", () => {
    render(
      <MessageList
        messages={[makeMsg()]}
        streamingText=""
        agentStatus="Idle"
      />,
    );
    expect(screen.queryByTestId("thinking-spinner")).not.toBeInTheDocument();
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

// --- Turn collapsing tests ---

function toolUseBlock(name = "write_file") {
  return { type: "toolUse" as const, id: `tu-${Math.random()}`, name, input: {} };
}

describe("turn collapsing", () => {
  it("collapses turns that have tool calls and are not active", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do something") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "Working on it" }],
      }),
      makeMsg({
        id: "a2",
        role: "assistant",
        content: txt("All done!"),
      }),
      // Second turn so the first is not "active"
      makeMsg({ id: "u2", role: "user", content: txt("thanks") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    // The first turn should have a collapsed summary button
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const summaryBtn = turn0?.querySelector("button");
    expect(summaryBtn).toBeInTheDocument();
    expect(summaryBtn?.textContent).toContain("1 tool call");
  });

  it("shows all messages when turn is expanded via click", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do something") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "step 1" }],
      }),
      makeMsg({
        id: "a2",
        role: "assistant",
        content: txt("Done!"),
      }),
      makeMsg({ id: "u2", role: "user", content: txt("ok") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const summaryBtn = turn0?.querySelector("button")!;

    // Before expand: only the user message and final text message visible
    // a1 should NOT be visible (collapsed)
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).not.toBeInTheDocument();
    // a2 (final text) should be visible
    expect(turn0?.querySelector('[data-testid="msg-a2"]')).toBeInTheDocument();

    // Click to expand
    fireEvent.click(summaryBtn);

    // After expand: all messages should be visible
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).toBeInTheDocument();
    expect(turn0?.querySelector('[data-testid="msg-a2"]')).toBeInTheDocument();
  });

  it("does not collapse active (last) turn when agent is running", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do something") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "working" }],
      }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Running" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    // No summary button should exist — turn is active
    const buttons = turn0?.querySelectorAll("button");
    const summaryButtons = Array.from(buttons ?? []).filter(
      (b) => b.textContent?.includes("tool call"),
    );
    expect(summaryButtons).toHaveLength(0);
    // a1 should be visible (not collapsed)
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).toBeInTheDocument();
  });

  it("does not collapse turns with system messages", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do something") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "working" }],
      }),
      makeMsg({ id: "s1", role: "system", content: txt("error!") }),
      makeMsg({ id: "u2", role: "user", content: txt("retry") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    // Both a1 and s1 should be visible
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).toBeInTheDocument();
    expect(turn0?.querySelector('[data-testid="msg-s1"]')).toBeInTheDocument();
  });

  it("does not collapse turns without tool calls", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("hello") }),
      makeMsg({ id: "a1", role: "assistant", content: txt("hi there") }),
      makeMsg({ id: "u2", role: "user", content: txt("bye") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    // a1 visible, no summary button
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).toBeInTheDocument();
    const buttons = turn0?.querySelectorAll("button");
    const summaryButtons = Array.from(buttons ?? []).filter(
      (b) => b.textContent?.includes("tool call"),
    );
    expect(summaryButtons).toHaveLength(0);
  });

  it("shows plural tool call count in summary", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do work") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), toolUseBlock(), toolUseBlock(), { type: "text" as const, text: "done" }],
      }),
      makeMsg({ id: "u2", role: "user", content: txt("ok") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const summaryBtn = turn0?.querySelector("button");
    expect(summaryBtn?.textContent).toContain("3 tool calls");
  });

  it("shows hidden message count in summary when multiple text messages", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("multi-step") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "step 1 done" }],
      }),
      makeMsg({
        id: "a2",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "step 2 done" }],
      }),
      makeMsg({
        id: "a3",
        role: "assistant",
        content: txt("All complete!"),
      }),
      makeMsg({ id: "u2", role: "user", content: txt("thanks") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const summaryBtn = turn0?.querySelector("button");
    // 2 tool calls, 2 hidden text messages (a1 and a2 hidden, a3 visible as final)
    expect(summaryBtn?.textContent).toContain("2 tool calls");
    expect(summaryBtn?.textContent).toContain("2 messages");
  });

  it("shows ChevronDown on hover over collapsed summary", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do something") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "done" }],
      }),
      makeMsg({ id: "u2", role: "user", content: txt("ok") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const summaryBtn = turn0?.querySelector("button")!;
    // Before hover: ChevronRight
    expect(summaryBtn.querySelector('[data-testid="chevron-right"]')).toBeInTheDocument();
    // Hover
    fireEvent.mouseEnter(summaryBtn);
    expect(summaryBtn.querySelector('[data-testid="chevron-down"]')).toBeInTheDocument();
    // Leave
    fireEvent.mouseLeave(summaryBtn);
    expect(summaryBtn.querySelector('[data-testid="chevron-right"]')).toBeInTheDocument();
  });

  it("renders orphan messages before turns", () => {
    const msgs = [
      makeMsg({ id: "a1", role: "assistant", content: txt("I am an orphan") }),
      makeMsg({ id: "s1", role: "system", content: txt("system note") }),
      makeMsg({ id: "u1", role: "user", content: txt("first user msg") }),
    ];
    render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    expect(screen.getByTestId("msg-a1")).toBeInTheDocument();
    expect(screen.getByTestId("msg-s1")).toBeInTheDocument();
    expect(screen.getByTestId("msg-u1")).toBeInTheDocument();
  });

  it("collapses an expanded turn on second click", () => {
    const msgs = [
      makeMsg({ id: "u1", role: "user", content: txt("do something") }),
      makeMsg({
        id: "a1",
        role: "assistant",
        content: [toolUseBlock(), { type: "text" as const, text: "step 1" }],
      }),
      makeMsg({
        id: "a2",
        role: "assistant",
        content: txt("Done!"),
      }),
      makeMsg({ id: "u2", role: "user", content: txt("ok") }),
    ];
    const { container } = render(
      <MessageList messages={msgs} streamingText="" agentStatus="Idle" />,
    );
    const turn0 = container.querySelector('[data-turn-index="0"]');
    const summaryBtn = turn0?.querySelector("button")!;

    // Expand
    fireEvent.click(summaryBtn);
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).toBeInTheDocument();

    // Collapse
    fireEvent.click(summaryBtn);
    expect(turn0?.querySelector('[data-testid="msg-a1"]')).not.toBeInTheDocument();
  });
});
