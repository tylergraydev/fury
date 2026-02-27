import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookmarkNoteDialog } from "./BookmarkNoteDialog";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import type { FileBookmark } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listBookmarks: vi.fn(),
  createBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  toggleBookmark: vi.fn(),
}));

function makeBookmark(overrides: Partial<FileBookmark> = {}): FileBookmark {
  return {
    id: "bm-1",
    repoId: "repo-1",
    filePath: "src/index.ts",
    lineNumber: 10,
    note: null,
    color: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  useBookmarkStore.setState({
    bookmarks: {},
    loading: {},
    error: {},
    editingBookmark: null,
  });
  vi.clearAllMocks();
});

describe("BookmarkNoteDialog", () => {
  it("returns null when editingBookmark is null", () => {
    const { container } = render(<BookmarkNoteDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("renders Add Bookmark title for new bookmark", () => {
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
    });
    render(<BookmarkNoteDialog />);
    expect(screen.getByText("Add Bookmark")).toBeTruthy();
  });

  it("renders Edit Bookmark title for existing bookmark", () => {
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
        existing: makeBookmark(),
      },
    });
    render(<BookmarkNoteDialog />);
    expect(screen.getByText("Edit Bookmark")).toBeTruthy();
  });

  it("shows file name and line number", () => {
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/utils/helpers.ts",
        lineNumber: 42,
      },
    });
    render(<BookmarkNoteDialog />);
    expect(screen.getByText("helpers.ts : Line 42")).toBeTruthy();
  });

  it("pre-fills note and color from existing bookmark", () => {
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
        existing: makeBookmark({ note: "important", color: "red" }),
      },
    });
    render(<BookmarkNoteDialog />);
    const input = screen.getByPlaceholderText("Add a note...") as HTMLInputElement;
    expect(input.value).toBe("important");
    // Red color button should have selected border
    const redButton = screen.getByTitle("red");
    expect(redButton.style.border).toContain("var(--text-primary)");
  });

  it("defaults to empty note and blue color for new bookmark", () => {
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
    });
    render(<BookmarkNoteDialog />);
    const input = screen.getByPlaceholderText("Add a note...") as HTMLInputElement;
    expect(input.value).toBe("");
    const blueButton = screen.getByTitle("blue");
    expect(blueButton.style.border).toContain("var(--text-primary)");
  });

  it("clicking color button changes selected color", async () => {
    const user = userEvent.setup();
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
    });
    render(<BookmarkNoteDialog />);

    await user.click(screen.getByTitle("green"));

    expect(screen.getByTitle("green").style.border).toContain("var(--text-primary)");
    expect(screen.getByTitle("blue").style.border).toContain("transparent");
  });

  it("Save calls addBookmark for new bookmark", async () => {
    const user = userEvent.setup();
    const addBookmark = vi.fn().mockResolvedValue(makeBookmark());
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
      addBookmark,
    });
    render(<BookmarkNoteDialog />);

    await user.click(screen.getByText("Save"));

    expect(addBookmark).toHaveBeenCalledWith({
      repoId: "repo-1",
      filePath: "src/index.ts",
      lineNumber: 10,
      note: undefined,
      color: "blue",
    });
  });

  it("Save calls editBookmark for existing bookmark", async () => {
    const user = userEvent.setup();
    const editBookmark = vi.fn().mockResolvedValue(undefined);
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
        existing: makeBookmark({ id: "bm-1", note: "old" }),
      },
      editBookmark,
    });
    render(<BookmarkNoteDialog />);

    await user.click(screen.getByText("Save"));

    expect(editBookmark).toHaveBeenCalledWith("repo-1", "bm-1", {
      note: "old",
      color: "blue",
    });
  });

  it("Save closes dialog", async () => {
    const user = userEvent.setup();
    const setEditingBookmark = vi.fn();
    const addBookmark = vi.fn().mockResolvedValue(makeBookmark());
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
      addBookmark,
      setEditingBookmark,
    });
    render(<BookmarkNoteDialog />);

    await user.click(screen.getByText("Save"));

    expect(setEditingBookmark).toHaveBeenCalledWith(null);
  });

  it("Cancel closes dialog", async () => {
    const user = userEvent.setup();
    const setEditingBookmark = vi.fn();
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
      setEditingBookmark,
    });
    render(<BookmarkNoteDialog />);

    await user.click(screen.getByText("Cancel"));

    expect(setEditingBookmark).toHaveBeenCalledWith(null);
  });

  it("Escape key closes dialog", () => {
    const setEditingBookmark = vi.fn();
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
      setEditingBookmark,
    });
    render(<BookmarkNoteDialog />);

    fireEvent.keyDown(screen.getByPlaceholderText("Add a note..."), {
      key: "Escape",
    });

    expect(setEditingBookmark).toHaveBeenCalledWith(null);
  });

  it("Enter key triggers save", () => {
    const addBookmark = vi.fn().mockResolvedValue(makeBookmark());
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
      addBookmark,
    });
    render(<BookmarkNoteDialog />);

    fireEvent.keyDown(screen.getByPlaceholderText("Add a note..."), {
      key: "Enter",
    });

    expect(addBookmark).toHaveBeenCalled();
  });

  it("passes note as undefined when empty string", async () => {
    const user = userEvent.setup();
    const addBookmark = vi.fn().mockResolvedValue(makeBookmark());
    useBookmarkStore.setState({
      editingBookmark: {
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      },
      addBookmark,
    });
    render(<BookmarkNoteDialog />);

    await user.click(screen.getByText("Save"));

    expect(addBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ note: undefined }),
    );
  });
});
