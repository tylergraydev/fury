import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSearch } from "./ChatSearch";

vi.mock("../../lib/tauri", () => ({
  searchChatMessages: vi.fn(),
}));

import { searchChatMessages } from "../../lib/tauri";
import type { ChatMessageSearchResult } from "../../lib/tauri";

function makeResult(overrides: Partial<ChatMessageSearchResult> = {}): ChatMessageSearchResult {
  return {
    messageId: "msg-1",
    workspaceId: "ws-1",
    workspaceName: "My Workspace",
    role: "user",
    matchedText: "hello world",
    timestamp: "2025-06-15T10:30:00Z",
    ...overrides,
  };
}

const defaultProps = {
  contextId: "ctx-1",
  onClose: vi.fn(),
  onNavigate: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

async function typeAndSearch(input: HTMLElement, text: string) {
  await userEvent.type(input, text);
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
  // Flush microtasks for the async search callback
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ChatSearch", () => {
  it("shows placeholder text when query is empty", () => {
    render(<ChatSearch {...defaultProps} />);
    expect(screen.getByText("Type to search conversation history")).toBeTruthy();
  });

  it("calls searchChatMessages after 300ms debounce", async () => {
    vi.mocked(searchChatMessages).mockResolvedValue([]);
    render(<ChatSearch {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "hello");

    expect(searchChatMessages).toHaveBeenCalledWith("hello", "ctx-1");
  });

  it("shows No results found when search returns empty array", async () => {
    vi.mocked(searchChatMessages).mockResolvedValue([]);
    render(<ChatSearch {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "nothing");

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeTruthy();
    });
  });

  it("renders search results with matched text", async () => {
    vi.mocked(searchChatMessages).mockResolvedValue([
      makeResult({ matchedText: "result one" }),
      makeResult({ messageId: "msg-2", matchedText: "result two" }),
    ]);
    render(<ChatSearch {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "result");

    await waitFor(() => {
      expect(screen.getByText("result one")).toBeTruthy();
      expect(screen.getByText("result two")).toBeTruthy();
    });
  });

  it("clicking result calls onNavigate with messageId", async () => {
    const onNavigate = vi.fn();
    vi.mocked(searchChatMessages).mockResolvedValue([makeResult()]);
    render(<ChatSearch {...defaultProps} onNavigate={onNavigate} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "hello");

    await waitFor(() => {
      expect(screen.getByText("hello world")).toBeTruthy();
    });

    await userEvent.click(screen.getByText("hello world"));
    expect(onNavigate).toHaveBeenCalledWith("msg-1");
  });

  it("Search all workspaces checkbox passes undefined contextId", async () => {
    vi.mocked(searchChatMessages).mockResolvedValue([]);
    render(<ChatSearch {...defaultProps} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "test");

    expect(searchChatMessages).toHaveBeenCalledWith("test", undefined);
  });

  it("Escape key calls onClose", () => {
    const onClose = vi.fn();
    render(<ChatSearch {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(screen.getByPlaceholderText("Search messages..."), {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    render(<ChatSearch {...defaultProps} onClose={onClose} />);

    await userEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("handles searchChatMessages error gracefully", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(searchChatMessages).mockRejectedValue(new Error("db error"));
    render(<ChatSearch {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "test");

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    expect(screen.getByText("No results found")).toBeTruthy();
    spy.mockRestore();
  });

  it("debounce resets on rapid typing", async () => {
    vi.mocked(searchChatMessages).mockResolvedValue([]);
    render(<ChatSearch {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await userEvent.type(input, "h");
    vi.advanceTimersByTime(100);
    await userEvent.type(input, "e");
    vi.advanceTimersByTime(100);
    await userEvent.type(input, "l");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(searchChatMessages).toHaveBeenCalledTimes(1);
    expect(searchChatMessages).toHaveBeenCalledWith("hel", "ctx-1");
  });

  it("clears results when query is emptied", async () => {
    vi.mocked(searchChatMessages).mockResolvedValue([makeResult()]);
    render(<ChatSearch {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search messages...");
    await typeAndSearch(input, "test");

    await waitFor(() => {
      expect(screen.getByText("hello world")).toBeTruthy();
    });

    await userEvent.clear(input);

    await waitFor(() => {
      expect(screen.getByText("Type to search conversation history")).toBeTruthy();
    });
  });
});
