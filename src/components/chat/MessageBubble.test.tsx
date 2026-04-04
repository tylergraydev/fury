import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "../../lib/tauri";

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => ({
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-filetext" {...props} />,
  Pencil: (props: Record<string, unknown>) => <span data-testid="icon-pencil" {...props} />,
  FilePlus2: (props: Record<string, unknown>) => <span data-testid="icon-fileplus2" {...props} />,
  SquareTerminal: (props: Record<string, unknown>) => <span data-testid="icon-terminal" {...props} />,
  FileSearch: (props: Record<string, unknown>) => <span data-testid="icon-filesearch" {...props} />,
  FolderSearch: (props: Record<string, unknown>) => <span data-testid="icon-foldersearch" {...props} />,
  Bot: (props: Record<string, unknown>) => <span data-testid="icon-bot" {...props} />,
  NotebookPen: (props: Record<string, unknown>) => <span data-testid="icon-notebookpen" {...props} />,
  Globe: (props: Record<string, unknown>) => <span data-testid="icon-globe" {...props} />,
  Radar: (props: Record<string, unknown>) => <span data-testid="icon-radar" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="chevron-right" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="chevron-down" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-wrench" {...props} />,
  RotateCw: (props: Record<string, unknown>) => <span data-testid="icon-retry" {...props} />,
  Brain: (props: Record<string, unknown>) => <span data-testid="icon-brain" {...props} />,
  ListPlus: (props: Record<string, unknown>) => <span data-testid="icon-listplus" {...props} />,
  ListChecks: (props: Record<string, unknown>) => <span data-testid="icon-listchecks" {...props} />,
  GitCompare: (props: Record<string, unknown>) => <span data-testid="icon-gitcompare" {...props} />,
  ImageIcon: (props: Record<string, unknown>) => <span data-testid="icon-image" {...props} />,
  ClipboardCheck: (props: Record<string, unknown>) => <span data-testid="icon-clipboardcheck" {...props} />,
  MessageCircleQuestion: (props: Record<string, unknown>) => <span data-testid="icon-question" {...props} />,
}));

// Mock ImageLightbox
vi.mock("./ImageLightbox", () => ({
  ImageLightbox: ({ src, onClose }: { src: string; onClose: () => void }) => (
    <div data-testid="image-lightbox" data-src={src}>
      <button data-testid="lightbox-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

// Mock MarkdownContent
vi.mock("./MarkdownContent", () => ({
  MarkdownContent: ({ content, contextId, contextType }: { content: string; contextId?: string; contextType?: string }) => (
    <span data-context-id={contextId ?? ""} data-context-type={contextType ?? ""}>{content}</span>
  ),
}));

// Mock readFileBase64
const mockReadFileBase64 = vi.fn();
vi.mock("../../lib/tauri", async () => {
  const actual = await vi.importActual("../../lib/tauri");
  return {
    ...actual,
    readFileBase64: (...args: unknown[]) => mockReadFileBase64(...args),
  };
});

// Mock format utilities to return predictable values
vi.mock("../../lib/format", () => ({
  formatDuration: (ms: number) => `${ms}ms`,
  formatTokens: (n: number) => `${n}tok`,
  formatCost: (usd: number) => `$${usd.toFixed(4)}`,
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    workspaceId: "ws-1",
    role: "user",
    content: [{ type: "text", text: "Hello world" }],
    timestamp: new Date().toISOString(),
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

  // --- ResponseMetadataRow tests (lines 566-591) ---

  it("renders ResponseMetadataRow with duration", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { durationMs: 1500 },
        })}
      />,
    );
    expect(screen.getByText("1500ms")).toBeInTheDocument();
  });

  it("renders ResponseMetadataRow with input and output tokens", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { inputTokens: 100, outputTokens: 200 },
        })}
      />,
    );
    expect(screen.getByText(/100tok in \/ 200tok out/)).toBeInTheDocument();
  });

  it("renders ResponseMetadataRow with only inputTokens (outputTokens shows ?)", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { inputTokens: 50 },
        })}
      />,
    );
    expect(screen.getByText(/50tok in \/ \? out/)).toBeInTheDocument();
  });

  it("renders ResponseMetadataRow with only outputTokens (inputTokens shows ?)", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { outputTokens: 75 },
        })}
      />,
    );
    expect(screen.getByText(/\? in \/ 75tok out/)).toBeInTheDocument();
  });

  it("renders ResponseMetadataRow with cacheReadTokens when > 0", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { cacheReadTokens: 500 },
        })}
      />,
    );
    expect(screen.getByText(/500tok cached/)).toBeInTheDocument();
  });

  it("does not render cacheReadTokens when 0", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { cacheReadTokens: 0 },
        })}
      />,
    );
    expect(screen.queryByText(/cached/)).not.toBeInTheDocument();
  });

  it("renders ResponseMetadataRow with totalCostUsd", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: { totalCostUsd: 0.0123 },
        })}
      />,
    );
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
  });

  it("renders ResponseMetadataRow with all metadata fields and separators", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: {
            durationMs: 2000,
            inputTokens: 100,
            outputTokens: 200,
            cacheReadTokens: 50,
            totalCostUsd: 0.05,
          },
        })}
      />,
    );
    // Check separators (middle dots) exist
    const dots = screen.getAllByText("·");
    expect(dots.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("2000ms")).toBeInTheDocument();
    expect(screen.getByText("$0.0500")).toBeInTheDocument();
  });

  it("does not render ResponseMetadataRow when metadata has no displayable parts", () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          metadata: {},
        })}
      />,
    );
    // The metadata row should not be rendered when empty
    expect(container.querySelector(".select-none")).not.toBeInTheDocument();
  });

  // --- ToolRow hover state (line 622) ---

  it("changes chevron icon on hover", () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { file_path: "/a.ts" } },
          ],
        })}
      />,
    );
    const button = container.querySelector("button")!;
    // Initially shows ChevronRight
    expect(screen.getByTestId("chevron-right")).toBeInTheDocument();

    // Hover shows ChevronDown
    fireEvent.mouseEnter(button);
    expect(screen.getByTestId("chevron-down")).toBeInTheDocument();

    // Mouse leave goes back to ChevronRight
    fireEvent.mouseLeave(button);
    expect(screen.getByTestId("chevron-right")).toBeInTheDocument();
  });

  // --- User message with file attachments (lines 477-489) ---

  it("renders user message with file attachments", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [{ type: "text", text: "[Attached file: /path/to/doc.pdf] Check this file" }],
        })}
      />,
    );
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(screen.getByText("Check this file")).toBeInTheDocument();
  });

  it("renders user message with image attachments", async () => {
    mockReadFileBase64.mockResolvedValue("data:image/png;base64,abc123");
    render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [{ type: "text", text: "[Attached image: /path/to/photo.png] Look at this" }],
        })}
      />,
    );
    // Wait for the image to load
    await waitFor(() => {
      expect(screen.getByAltText("photo.png")).toBeInTheDocument();
    });
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("Look at this")).toBeInTheDocument();
  });

  it("shows fallback when image attachment fails to load", async () => {
    mockReadFileBase64.mockRejectedValue(new Error("File not found"));
    render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [{ type: "text", text: "[Attached image: /path/to/missing.png]" }],
        })}
      />,
    );
    // Wait for the error fallback
    await waitFor(() => {
      expect(screen.getByText("missing.png")).toBeInTheDocument();
    });
    expect(screen.getByTestId("icon-image")).toBeInTheDocument();
  });

  it("shows loading placeholder while image is loading", () => {
    // Never resolve
    mockReadFileBase64.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [{ type: "text", text: "[Attached image: /path/to/loading.png]" }],
        })}
      />,
    );
    // Should show loading placeholder (animate-pulse div)
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  // --- normalizeToolName additional branches ---

  it("normalizes TodoWrite tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "todowrite", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Update todos")).toBeInTheDocument();
  });

  it("normalizes todo_write tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "todo_write", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Update todos")).toBeInTheDocument();
  });

  it("normalizes TodoRead tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "todoread", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read todos")).toBeInTheDocument();
  });

  it("normalizes todo_read tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "todo_read", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read todos")).toBeInTheDocument();
  });

  it("normalizes WebFetch tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "webfetch", input: { url: "https://example.com" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Fetch")).toBeInTheDocument();
  });

  it("normalizes WebSearch tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "websearch", input: { query: "test" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Search web")).toBeInTheDocument();
  });

  it("normalizes think/plan tool name to Think", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "think_about_it", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("normalizes plan tool name to Think", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "plan_steps", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("normalizes diff tool name to Diff", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "diff_tool", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Diff")).toBeInTheDocument();
  });

  // --- Edit tool with old_string/new_string badges ---

  it("shows +/- line badges for Edit tool with old and new strings", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Edit",
              input: {
                file_path: "/a/b.ts",
                old_string: "line1\nline2",
                new_string: "line1\nline2\nline3",
              },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("-2")).toBeInTheDocument();
  });

  // --- Write tool with content line count badge ---

  it("shows line count badge for Write tool with content", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Write",
              input: {
                file_path: "/a/b.ts",
                content: "line1\nline2\nline3",
              },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("3 lines")).toBeInTheDocument();
  });

  // --- Grep with path and result matches ---

  it("shows path badge for Grep tool", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Grep",
              input: { pattern: "TODO", path: "/a/b/c/src" },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("TODO")).toBeInTheDocument();
    expect(screen.getByText("c/src")).toBeInTheDocument();
  });

  it("shows match count badge for Grep tool with results", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Grep",
              input: { pattern: "TODO" },
            },
            {
              type: "toolResult",
              toolUseId: "t1",
              content: "file1.ts:1:TODO fix\nfile2.ts:5:TODO clean",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("2 matches")).toBeInTheDocument();
  });

  // --- WebSearch summary ---

  it("shows query badge for WebSearch tool", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "WebSearch",
              input: { query: "vitest docs" },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Search web")).toBeInTheDocument();
    expect(screen.getByText("vitest docs")).toBeInTheDocument();
  });

  it("shows empty badge for WebSearch with no query", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "WebSearch",
              input: {},
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Search web")).toBeInTheDocument();
  });

  // --- WebFetch summary ---

  it("shows hostname badge for WebFetch tool", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "WebFetch",
              input: { url: "https://docs.example.com/page" },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Fetch")).toBeInTheDocument();
    expect(screen.getByText("docs.example.com")).toBeInTheDocument();
  });

  it("shows raw url as badge when URL parsing fails", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "WebFetch",
              input: { url: "not-a-url" },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("not-a-url")).toBeInTheDocument();
  });

  it("shows no badge for WebFetch with no url", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "WebFetch",
              input: {},
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Fetch")).toBeInTheDocument();
  });

  // --- formatToolDetail for Edit (expanded) ---

  it("shows Edit tool detail with file, removed, and added sections", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Edit",
              input: {
                file_path: "/src/main.ts",
                old_string: "const x = 1;",
                new_string: "const x = 2;",
              },
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Edit"));
    expect(screen.getByText(/File:/)).toBeInTheDocument();
    expect(screen.getByText("/src/main.ts")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("const x = 2;")).toBeInTheDocument();
  });

  it("shows Edit tool detail with only new_string (no old_string)", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Edit",
              input: {
                file_path: "/src/main.ts",
                new_string: "const y = 3;",
              },
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Edit"));
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
  });

  it("shows Edit tool detail fallback when input is null", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Edit", input: null },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Edit"));
    // Falls through to generic fallback with "Input" label
    expect(screen.getByText("Input")).toBeInTheDocument();
  });

  // --- formatToolDetail for Read (expanded) ---

  it("shows Read tool detail with file path, offset, limit, and result", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Read",
              input: { file_path: "/src/app.ts", offset: 10, limit: 50 },
            },
            { type: "toolResult", toolUseId: "t1", content: "file data here" },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Read 1 lines"));
    expect(screen.getByText(/File:/)).toBeInTheDocument();
    expect(screen.getByText("/src/app.ts")).toBeInTheDocument();
    expect(screen.getByText(/offset: 10/)).toBeInTheDocument();
    expect(screen.getByText(/limit: 50/)).toBeInTheDocument();
    expect(screen.getByText("file data here")).toBeInTheDocument();
  });

  it("shows Read tool detail fallback when input is null", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByText("Read"));
    expect(screen.getByText("Input")).toBeInTheDocument();
  });

  // --- Bash tool detail fallback ---

  it("shows Bash tool detail fallback when input is null", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Bash", input: null },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Run"));
    expect(screen.getByText("Input")).toBeInTheDocument();
  });

  // --- Generic fallback tool detail with result ---

  it("shows generic tool detail with result section", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "custom_tool", input: { foo: "bar" } },
            { type: "toolResult", toolUseId: "t1", content: "custom output" },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("custom_tool"));
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("custom output")).toBeInTheDocument();
  });

  // --- Task with subagent_type ---

  it("shows Agent label with subagent type", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Task",
              input: { description: "Do it", subagent_type: "code" },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Agent (code)")).toBeInTheDocument();
  });

  // --- Bash with description ---

  it("shows description for Bash tool when both command and description are present", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            {
              type: "toolUse",
              id: "t1",
              name: "Bash",
              input: { command: "npm test", description: "Run the tests" },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Run the tests")).toBeInTheDocument();
  });

  // --- Context forwarding ---

  it("forwards contextId and contextType to MarkdownContent for assistant messages", () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [{ type: "text", text: "response" }],
        })}
        contextId="ws-123"
        contextType="workspace"
      />,
    );
    const span = container.querySelector("[data-context-id='ws-123']");
    expect(span).toBeInTheDocument();
    expect(span).toHaveAttribute("data-context-type", "workspace");
  });

  // --- Multiple attachments ---

  it("renders user message with multiple file and image attachments", async () => {
    mockReadFileBase64.mockResolvedValue("data:image/png;base64,abc");
    render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [{
            type: "text",
            text: "[Attached image: /img1.png][Attached file: /doc.txt] Please review",
          }],
        })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByAltText("img1.png")).toBeInTheDocument();
    });
    expect(screen.getByText("doc.txt")).toBeInTheDocument();
    expect(screen.getByText("Please review")).toBeInTheDocument();
  });

  // --- InlineImageGroup (image content blocks in assistant messages) ---

  it("renders inline image group for assistant message with image blocks", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "image", data: "data:image/png;base64,abc123", mediaType: "image/png" },
          ],
        })}
      />,
    );
    const img = screen.getByAltText("Image 1");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/png;base64,abc123");
  });

  it("renders inline image with http URL prefix", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "image", data: "https://example.com/photo.png", mediaType: "image/png" },
          ],
        })}
      />,
    );
    const img = screen.getByAltText("Image 1");
    expect(img).toHaveAttribute("src", "https://example.com/photo.png");
  });

  it("renders inline image with base64 data (no data: prefix)", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "image", data: "iVBORw0KGgo=", mediaType: "image/png" },
          ],
        })}
      />,
    );
    const img = screen.getByAltText("Image 1");
    expect(img).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
  });

  it("opens lightbox when inline image is clicked and closes it", async () => {
    const user = userEvent.setup();
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "image", data: "data:image/png;base64,abc", mediaType: "image/png" },
          ],
        })}
      />,
    );
    const button = screen.getByAltText("Image 1").closest("button")!;
    await user.click(button);
    // ImageLightbox should appear
    expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
    // Close the lightbox
    await user.click(screen.getByTestId("lightbox-close"));
    expect(screen.queryByTestId("image-lightbox")).not.toBeInTheDocument();
  });

  it("renders multiple inline images", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "image", data: "data:image/png;base64,a", mediaType: "image/png" },
            { type: "image", data: "data:image/png;base64,b", mediaType: "image/png" },
          ],
        })}
      />,
    );
    expect(screen.getByAltText("Image 1")).toBeInTheDocument();
    expect(screen.getByAltText("Image 2")).toBeInTheDocument();
  });

  // --- Long Bash command truncation ---

  it("truncates long Bash command in summary", () => {
    const longCmd = "a".repeat(100);
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
    expect(screen.getByText("a".repeat(77) + "...")).toBeInTheDocument();
  });

  // --- Long Task description truncation ---

  it("truncates long Task description in summary", () => {
    const longDesc = "b".repeat(100);
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
    expect(screen.getByText("b".repeat(57) + "...")).toBeInTheDocument();
  });

  // --- Default tool summary with non-string first value ---

  it("shows empty summary for default tool with non-string first value", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "unknown_custom", input: { count: 42 } },
          ],
        })}
      />,
    );
    expect(screen.getByText("unknown_custom")).toBeInTheDocument();
  });

  // --- Default tool summary with string first value ---

  it("shows detail for default tool with string first value", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "unknown_custom", input: { action: "do_something" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("do_something")).toBeInTheDocument();
  });

  // --- Default tool with long string first value truncation ---

  it("truncates long default tool detail string", () => {
    const longVal = "x".repeat(100);
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "unknown_custom", input: { action: longVal } },
          ],
        })}
      />,
    );
    expect(screen.getByText("x".repeat(57) + "...")).toBeInTheDocument();
  });

  // --- System message with rate limit shows retry ---

  it("shows retry button for system rate limit message", () => {
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

  // --- System message with timed out shows retry ---

  it("shows retry button for system timed out message", () => {
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

  // --- getToolSummary with null input ---

  it("shows empty summary when tool input is null", () => {
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

  // --- User message with no text content (empty after attachments) ---

  it("renders user message with only attachments and no remaining text", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "user",
          content: [{ type: "text", text: "[Attached file: /path/to/doc.pdf]" }],
        })}
      />,
    );
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
  });

  // --- Notebook tool normalization ---

  it("normalizes notebook tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "notebook_tool", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Notebook")).toBeInTheDocument();
  });

  // --- Web tool normalization (generic) ---

  it("normalizes generic web tool name", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "web_browse", input: {} },
          ],
        })}
      />,
    );
    expect(screen.getByText("Web")).toBeInTheDocument();
  });

  // --- countLines with empty text ---

  it("shows Read label without line count when result is null", () => {
    render(
      <MessageBubble
        message={makeMessage({
          role: "assistant",
          content: [
            { type: "toolUse", id: "t1", name: "Read", input: { file_path: "/a.ts" } },
          ],
        })}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
  });
});
