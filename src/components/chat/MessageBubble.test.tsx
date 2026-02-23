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

  it("renders displayText instead of content when set", () => {
    render(
      <MessageBubble
        message={makeMessage({
          content: [{ type: "text", text: "expanded prompt content" }],
          displayText: "/test",
        })}
      />,
    );
    expect(screen.getByText("/test")).toBeInTheDocument();
    expect(screen.queryByText("expanded prompt content")).not.toBeInTheDocument();
  });

  it("renders content text when displayText is not set", () => {
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
    expect(screen.getByText("Read 1 lines")).toBeInTheDocument();
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
    await user.click(screen.getByText("Run"));
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
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
    expect(screen.getByText("Read 1 lines")).toBeInTheDocument();
    expect(screen.getByText("Here is the content")).toBeInTheDocument();
  });

  // --- Tests for normalizeToolName via tool rendering ---

  it("normalizes Edit tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "mcp_edit_file", input: { file_path: "/src/a.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });

  it("normalizes Write tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "file_write", input: { file_path: "/src/new.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Write")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
  });

  it("normalizes command-based tool name to Bash", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "execute_command", input: { command: "echo hi" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText("echo hi")).toBeInTheDocument();
  });

  it("normalizes search_code-based tool name to Grep", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "search_code", input: { pattern: "TODO" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("normalizes grep-based tool name to Grep", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "grep_tool", input: { query: "findme" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("normalizes find_file-based tool name to Glob", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "find_file", input: { pattern: "*.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Find files")).toBeInTheDocument();
  });

  it("normalizes glob-based tool name to Glob", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "glob_search", input: { pattern: "**/*.tsx" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Find files")).toBeInTheDocument();
  });

  it("normalizes task-based tool name to Task", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "task_manager", input: { description: "Do something" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("normalizes notebook-based tool name to Notebook", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "notebook_tool", input: { cell: 1 } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Notebook")).toBeInTheDocument();
  });

  it("normalizes web-based tool name to Web", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "web_fetch", input: { url: "https://example.com" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Web")).toBeInTheDocument();
  });

  it("falls back to original name for unknown tool", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { data: "hello" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("custom_tool")).toBeInTheDocument();
  });

  // --- Tests for getToolSummary ---

  it("shows summary for Grep tool with pattern", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Grep", input: { pattern: "TODO" } },
          ],
        })}
      />,
    );
    // Grep summary shows pattern in a badge
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });

  it("shows summary for Glob tool with pattern", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Glob", input: { pattern: "**/*.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("**/*.ts")).toBeInTheDocument();
  });

  it("shows summary for Task tool with short description", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Task", input: { description: "Short task" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Short task")).toBeInTheDocument();
  });

  it("truncates long Task description", () => {
    const longDesc = "A".repeat(80);
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Task", input: { description: longDesc } },
          ],
        })}
      />,
    );
    expect(screen.getByText("A".repeat(57) + "...")).toBeInTheDocument();
  });

  it("truncates long Bash command", () => {
    const longCmd = "B".repeat(100);
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Bash", input: { command: longCmd } },
          ],
        })}
      />,
    );
    expect(screen.getByText("B".repeat(77) + "...")).toBeInTheDocument();
  });

  it("shows summary for Edit tool with path", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Edit", input: { file_path: "/a/b/c/d.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("c/d.ts")).toBeInTheDocument();
  });

  it("shows summary for Write tool with path", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Write", input: { file_path: "/x/y/z.txt" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("y/z.txt")).toBeInTheDocument();
  });

  it("uses fallback summary for unknown tool with string first value", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { data: "short-val" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("short-val")).toBeInTheDocument();
  });

  it("truncates long fallback summary for unknown tool", () => {
    const longVal = "Z".repeat(80);
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { data: longVal } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Z".repeat(57) + "...")).toBeInTheDocument();
  });

  it("returns empty summary for unknown tool with non-string first value", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { count: 42 } },
          ],
        })}
      />,
    );
    // The tool name should render but no summary text
    expect(screen.getByText("custom_tool")).toBeInTheDocument();
  });

  it("returns empty summary when input is null", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: null },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("returns empty summary when input is a string (not object)", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: "just a string" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  // --- Tests for tool detail expand/collapse ---

  it("collapses tool details on second click", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Bash", input: { command: "echo test" } },
            { type: "toolResult", toolUseId: "t1", content: "test output" },
          ],
        })}
      />,
    );

    // Expand
    await user.click(screen.getByText("Run"));
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText("Run"));
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
    expect(screen.queryByText("Output")).not.toBeInTheDocument();
  });

  it("shows tool input as string when input is a string type", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: "raw string input" },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Read"));
    expect(screen.getByText("raw string input")).toBeInTheDocument();
  });

  it("shows tool input as JSON when input is an object", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { file_path: "/a.ts" } },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("custom_tool"));
    expect(screen.getByText("Input")).toBeInTheDocument();
    // JSON.stringify with indent
    expect(screen.getByText(/"file_path"/)).toBeInTheDocument();
  });

  it("does not show Result section when tool has no result", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { file_path: "/a.ts" } },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("custom_tool"));
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();
  });

  // --- Tests for system message variations ---

  it("shows retry button for rate limit system messages", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: [{ type: "text", text: "Rate limit exceeded" }],
        })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTitle("Retry last message")).toBeInTheDocument();
  });

  it("shows retry button for timed out system messages", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: [{ type: "text", text: "Request timed out" }],
        })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTitle("Retry last message")).toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByTitle("Retry last message"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not show retry when onRetry is not provided even for error", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: [{ type: "text", text: "An error occurred" }],
        })}
      />,
    );
    expect(screen.queryByTitle("Retry last message")).not.toBeInTheDocument();
  });

  // --- System message with tool use blocks (should only render text) ---

  it("system message ignores tool use blocks and renders only text", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "system",
          content: [
            { type: "text", text: "System info" },
            { type: "toolUse", id: "t1", name: "Read", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("System info")).toBeInTheDocument();
    // Tool name "Read" should not appear as a standalone rendered tool row
    // (the system message path only renders text blocks)
  });

  // --- User message with tool use blocks (should ignore tools) ---

  it("user message ignores tool use blocks", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [
            { type: "text", text: "Check this" },
            { type: "toolUse", id: "t1", name: "Read", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Check this")).toBeInTheDocument();
  });

  // --- Read/Edit/Write path shortening ---

  it("shortens long file paths for Read tool", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { path: "/very/long/path/to/file.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("to/file.ts")).toBeInTheDocument();
  });

  it("does not shorten short file paths", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { file_path: "a/b" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("a/b")).toBeInTheDocument();
  });

  // --- Bash with cmd alias ---

  it("shows summary for Bash tool using cmd input key", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Bash", input: { cmd: "npm test" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("npm test")).toBeInTheDocument();
  });

  // --- Grep with query alias ---

  it("shows summary for Grep tool using query input key", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Grep", input: { query: "console.log" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("console.log")).toBeInTheDocument();
  });

  // --- Task with prompt alias ---

  it("shows summary for Task tool using prompt input key", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Task", input: { prompt: "Analyze code" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Analyze code")).toBeInTheDocument();
  });

  // --- Multiple tool pairs ---

  it("renders multiple tool pairs in a group", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { file_path: "/a.ts" } },
            { type: "toolResult", toolUseId: "t1", content: "content a" },
            { type: "toolUse", id: "t2", name: "Read", input: { file_path: "/b.ts" } },
            { type: "toolResult", toolUseId: "t2", content: "content b" },
          ],
        })}
      />,
    );
    // Both tool rows should be rendered with "Read 1 lines" labels
    const readLabels = screen.getAllByText("Read 1 lines");
    expect(readLabels).toHaveLength(2);
  });

  // --- Empty Read/Edit/Write path ---

  it("shows empty summary when Read input has no path", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  // --- Branch coverage for Edit/Write empty path ---

  it("shows empty summary when Edit input has no path", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Edit", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("shows empty summary when Write input has no path", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Write", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Write")).toBeInTheDocument();
  });

  // --- Branch coverage for Grep/Glob empty pattern ---

  it("shows empty summary when Grep input has no pattern or query", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Grep", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("shows empty summary when Glob input has no pattern", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Glob", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Find files")).toBeInTheDocument();
  });

  // --- Branch coverage: orphan toolResult without matching toolUse ---

  it("handles orphan toolResult block (no matching toolUse)", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolResult", toolUseId: "nonexistent", content: "orphan result" },
          ],
        })}
      />,
    );
    // Should not crash; no tool rows rendered
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "text", text: "done" },
          ],
        })}
      />,
    );
    expect(container).toBeTruthy();
  });

  // --- Branch coverage: Edit/Write with path (alternative key) ---

  it("shows summary for Edit tool using path input key", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Edit", input: { path: "/a/b/c.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("b/c.ts")).toBeInTheDocument();
  });

  it("shows summary for Write tool using path input key", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Write", input: { path: "/x/y.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("x/y.ts")).toBeInTheDocument();
  });

  // --- Branch coverage: Bash with neither command nor cmd ---

  it("shows empty summary for Bash tool with neither command nor cmd", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Bash", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Run")).toBeInTheDocument();
  });

  // --- Branch coverage: Task with neither description nor prompt ---

  it("shows empty summary for Task tool with neither description nor prompt", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Task", input: { other: "stuff" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });
});
