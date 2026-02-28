import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FileBookmark } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listBookmarks: vi.fn(),
  createBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  toggleBookmark: vi.fn(),
}));

// Mock fns accessible both inside vi.mock and in tests
const { openFile, setRevealLine, loadBookmarks, setEditingBookmark, removeBookmark, setActiveViewTab } = vi.hoisted(() => ({
  openFile: vi.fn(),
  setRevealLine: vi.fn(),
  loadBookmarks: vi.fn(),
  setEditingBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  setActiveViewTab: vi.fn(),
}));

// Store values that can be changed per-test
let bookmarkStoreValues: Record<string, any> = {};
let workspaceStoreValues: Record<string, any> = {};

vi.mock("../../stores/bookmarkStore", () => ({
  useBookmarkStore: Object.assign(
    (selector: any) => {
      const state = {
        bookmarks: {},
        loading: {},
        error: {},
        editingBookmark: null,
        loadBookmarks,
        setEditingBookmark,
        removeBookmark,
        ...bookmarkStoreValues,
      };
      return typeof selector === "function" ? selector(state) : state;
    },
    {
      getState: () => ({
        loadBookmarks,
        setEditingBookmark,
        removeBookmark,
        ...bookmarkStoreValues,
      }),
    },
  ),
}));

vi.mock("../../stores/fileViewerStore", () => ({
  useFileViewerStore: Object.assign(
    (selector: any) => {
      const state = { tabs: {}, openFile, setRevealLine };
      return typeof selector === "function" ? selector(state) : state;
    },
    { getState: () => ({ openFile, setRevealLine }) },
  ),
}));

vi.mock("../../stores/workspaceStore", () => ({
  useWorkspaceStore: (selector: any) => {
    const state = {
      workspaces: [{ id: "ws-1", repoId: "repo-1", name: "My Workspace" }],
      ...workspaceStoreValues,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

vi.mock("../../stores/uiStore", () => ({
  useUIStore: Object.assign(
    (selector: any) => {
      const state = { setActiveViewTab };
      return typeof selector === "function" ? selector(state) : state;
    },
    { getState: () => ({ setActiveViewTab }) },
  ),
}));

import { BookmarksPanel } from "./BookmarksPanel";

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
  bookmarkStoreValues = {};
  workspaceStoreValues = {};
  vi.clearAllMocks();
});

describe("BookmarksPanel", () => {
  it("shows loading state", () => {
    bookmarkStoreValues = { loading: { "repo-1": true } };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);
    expect(screen.getByText("Loading bookmarks...")).toBeTruthy();
  });

  it("shows empty state when no bookmarks", () => {
    bookmarkStoreValues = { bookmarks: { "repo-1": [] } };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);
    expect(screen.getByText("No bookmarks yet")).toBeTruthy();
  });

  it("renders bookmarks grouped by file", () => {
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [
          makeBookmark({ id: "bm-1", filePath: "src/a.ts", lineNumber: 1 }),
          makeBookmark({ id: "bm-2", filePath: "src/b.ts", lineNumber: 5 }),
          makeBookmark({ id: "bm-3", filePath: "src/a.ts", lineNumber: 20 }),
        ],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("b.ts")).toBeTruthy();
  });

  it("sorts groups alphabetically by file path", () => {
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [
          makeBookmark({ id: "bm-1", filePath: "src/z.ts", lineNumber: 1 }),
          makeBookmark({ id: "bm-2", filePath: "src/a.ts", lineNumber: 1 }),
        ],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    const headers = screen.getAllByText(/\.ts$/);
    expect(headers[0].textContent).toBe("a.ts");
    expect(headers[1].textContent).toBe("z.ts");
  });

  it("sorts bookmarks within group by line number", () => {
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [
          makeBookmark({ id: "bm-1", filePath: "src/a.ts", lineNumber: 20 }),
          makeBookmark({ id: "bm-2", filePath: "src/a.ts", lineNumber: 5 }),
        ],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    const lineLabels = screen.getAllByText(/^L\d+$/);
    expect(lineLabels[0].textContent).toBe("L5");
    expect(lineLabels[1].textContent).toBe("L20");
  });

  it("shows bookmark count badge per file group", () => {
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [
          makeBookmark({ id: "bm-1", filePath: "src/a.ts", lineNumber: 1 }),
          makeBookmark({ id: "bm-2", filePath: "src/a.ts", lineNumber: 5 }),
        ],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("clicking bookmark opens file and sets reveal line", async () => {
    const user = userEvent.setup();
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [makeBookmark({ lineNumber: 42 })],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    await user.click(screen.getByText("L42"));

    expect(openFile).toHaveBeenCalledWith("ws-1", "workspace", "src/index.ts", true);
    expect(setRevealLine).toHaveBeenCalledWith("ws-1:src/index.ts", 42);
    expect(setActiveViewTab).toHaveBeenCalledWith("chat");
  });

  it("edit button calls setEditingBookmark", async () => {
    const user = userEvent.setup();
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [makeBookmark()],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    await user.click(screen.getByTitle("Edit bookmark"));
    expect(setEditingBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      }),
    );
  });

  it("delete button calls removeBookmark", async () => {
    const user = userEvent.setup();
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [makeBookmark({ id: "bm-1" })],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    await user.click(screen.getByTitle("Delete bookmark"));
    expect(removeBookmark).toHaveBeenCalledWith("repo-1", "bm-1");
  });

  it("resolves repoId from workspace context", async () => {
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);
    await waitFor(() => expect(loadBookmarks).toHaveBeenCalledWith("repo-1"));
  });

  it("uses context.id directly for repo context", async () => {
    render(<BookmarksPanel context={{ type: "repo", id: "repo-42" }} />);
    await waitFor(() => expect(loadBookmarks).toHaveBeenCalledWith("repo-42"));
  });

  it("displays note text or No note italic fallback", () => {
    bookmarkStoreValues = {
      bookmarks: {
        "repo-1": [
          makeBookmark({ id: "bm-1", note: "important logic" }),
          makeBookmark({ id: "bm-2", note: null, lineNumber: 20 }),
        ],
      },
    };
    render(<BookmarksPanel context={{ type: "workspace", id: "ws-1" }} />);

    expect(screen.getByText("important logic")).toBeTruthy();
    expect(screen.getByText("No note")).toBeTruthy();
  });
});
