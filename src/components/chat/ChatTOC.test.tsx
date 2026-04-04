import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatTOC } from "./ChatTOC";
import type { Turn } from "./MessageList";
import type { ChatMessage } from "../../lib/tauri";

function makeTurn(text: string, id?: string, displayText?: string): Turn {
  const msg: ChatMessage = {
    id: id ?? crypto.randomUUID(),
    workspaceId: "ws-1",
    role: "user",
    content: [{ type: "text", text }],
    timestamp: new Date().toISOString(),
    ...(displayText ? { displayText } : {}),
  };
  return { userMessage: msg, responses: [] };
}

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChatTOC", () => {

  it("renders turn list with correct numbers", () => {
    const turns = [makeTurn("Hello"), makeTurn("World"), makeTurn("Test")];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.getByText("3.")).toBeInTheDocument();
  });

  it("shows user message text as preview", () => {
    const turns = [makeTurn("Fix the login bug")];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
  });

  it("truncates text longer than 60 characters", () => {
    const longText =
      "This is a very long message that should be truncated because it exceeds sixty characters";
    const turns = [makeTurn(longText)];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(
      screen.getByText(longText.slice(0, 57) + "..."),
    ).toBeInTheDocument();
  });

  it("does not truncate text at exactly 60 characters", () => {
    const text = "A".repeat(60);
    const turns = [makeTurn(text)];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows (empty) for turns with no text content", () => {
    const msg: ChatMessage = {
      id: "empty-1",
      workspaceId: "ws-1",
      role: "user",
      content: [],
      timestamp: new Date().toISOString(),
    };
    const turns: Turn[] = [{ userMessage: msg, responses: [] }];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });

  it("uses displayText when available", () => {
    const turns = [makeTurn("full expanded prompt text", "t1", "/review")];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText("/review")).toBeInTheDocument();
    expect(
      screen.queryByText("full expanded prompt text"),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    const turns = [makeTurn("Hello")];
    const user = userEvent.setup();
    render(<ChatTOC turns={turns} onClose={onClose} />);
    await user.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("scrolls to turn when clicked", async () => {
    const turns = [makeTurn("First turn", "t1"), makeTurn("Second turn", "t2")];
    const user = userEvent.setup();

    // Create a mock element that querySelector will return
    const mockElement = document.createElement("div");
    const scrollSpy = vi.fn();
    mockElement.scrollIntoView = scrollSpy;
    const querySpy = vi
      .spyOn(document, "querySelector")
      .mockReturnValue(mockElement);

    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    await user.click(screen.getByText("Second turn"));

    expect(querySpy).toHaveBeenCalledWith('[data-turn-index="1"]');
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });

    querySpy.mockRestore();
  });

  it("warns when scroll target element is not found", async () => {
    const turns = [makeTurn("Only turn", "t1")];
    const user = userEvent.setup();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const querySpy = vi.spyOn(document, "querySelector").mockReturnValue(null);

    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    await user.click(screen.getByText("Only turn"));

    expect(querySpy).toHaveBeenCalledWith('[data-turn-index="0"]');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not find turn element"),
    );

    querySpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("filters out non-text content blocks from preview", () => {
    const msg: ChatMessage = {
      id: "mixed-1",
      workspaceId: "ws-1",
      role: "user",
      content: [
        { type: "text", text: "Run tests" },
        { type: "toolUse", id: "t1", name: "bash", input: {} },
      ],
      timestamp: new Date().toISOString(),
    };
    const turns: Turn[] = [{ userMessage: msg, responses: [] }];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText("Run tests")).toBeInTheDocument();
  });

  it("renders Table of Contents header", () => {
    const turns = [makeTurn("Hello")];
    render(<ChatTOC turns={turns} onClose={vi.fn()} />);
    expect(screen.getByText("Table of Contents")).toBeInTheDocument();
  });
});
