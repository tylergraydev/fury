import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "../../lib/tauri";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "user",
    content: [{ type: "text", text: "Hello world" }],
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it("renders user message text", () => {
    render(<MessageBubble message={makeMessage()} />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders assistant message text", () => {
    render(
      <MessageBubble
        message={makeMessage({ role: "assistant", content: [{ type: "text", text: "I can help" }] })}
      />,
    );
    expect(screen.getByText("I can help")).toBeInTheDocument();
  });

  it("renders system message text", () => {
    render(
      <MessageBubble
        message={makeMessage({ role: "system", content: [{ type: "text", text: "System notice" }] })}
      />,
    );
    expect(screen.getByText("System notice")).toBeInTheDocument();
  });

  it("shows retry button for system error messages", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: [{ type: "text", text: "An error occurred" }],
        })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTitle("Retry last message")).toBeInTheDocument();
  });

  it("does not show retry button for non-error system messages", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: [{ type: "text", text: "Session started" }],
        })}
        onRetry={onRetry}
      />,
    );
    expect(screen.queryByTitle("Retry last message")).not.toBeInTheDocument();
  });

  it("renders tool calls for assistant messages", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { file_path: "/src/app.ts" } },
            { type: "toolResult", toolUseId: "t1", content: "file contents" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
  });

  it("expands tool details on click", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Bash", input: { command: "ls -la" } },
            { type: "toolResult", toolUseId: "t1", content: "total 42" },
          ],
        })}
      />,
    );

    // Click the tool row to expand
    await user.click(screen.getByText("Bash"));
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("total 42")).toBeInTheDocument();
  });

  it("renders multiple text blocks", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "text", text: "First paragraph" },
            { type: "text", text: "Second paragraph" },
          ],
        })}
      />,
    );
    expect(screen.getByText("First paragraph")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph")).toBeInTheDocument();
  });

  it("renders mixed text and tool blocks", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "text", text: "Let me check that file" },
            { type: "toolUse", id: "t1", name: "Read", input: { file_path: "/readme.md" } },
            { type: "toolResult", toolUseId: "t1", content: "# Readme" },
            { type: "text", text: "Here is the content" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Let me check that file")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Here is the content")).toBeInTheDocument();
  });
});
