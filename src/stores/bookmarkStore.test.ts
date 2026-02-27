import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listBookmarks: vi.fn(),
  createBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  toggleBookmark: vi.fn(),
}));

import { useBookmarkStore } from "./bookmarkStore";
import { useToastStore } from "./toastStore";
import {
  listBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  toggleBookmark,
} from "../lib/tauri";
import type { FileBookmark } from "../lib/tauri";

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
  useToastStore.setState({
    toasts: [],
  });
  vi.clearAllMocks();
});

describe("bookmarkStore - loadBookmarks", () => {
  it("loads bookmarks and sets loading state", async () => {
    const bookmarks = [makeBookmark()];
    vi.mocked(listBookmarks).mockResolvedValue(bookmarks);

    await useBookmarkStore.getState().loadBookmarks("repo-1");

    expect(useBookmarkStore.getState().bookmarks["repo-1"]).toEqual(bookmarks);
    expect(useBookmarkStore.getState().loading["repo-1"]).toBe(false);
    expect(listBookmarks).toHaveBeenCalledWith("repo-1");
  });

  it("sets error on failure", async () => {
    vi.mocked(listBookmarks).mockRejectedValue(new Error("db fail"));

    await useBookmarkStore.getState().loadBookmarks("repo-1");

    expect(useBookmarkStore.getState().error["repo-1"]).toBe("Error: db fail");
    expect(useBookmarkStore.getState().loading["repo-1"]).toBe(false);
  });

  it("deduplicates concurrent calls via inflight guard", async () => {
    let resolveFirst: (v: FileBookmark[]) => void;
    const firstCall = new Promise<FileBookmark[]>((r) => {
      resolveFirst = r;
    });
    vi.mocked(listBookmarks).mockImplementation(() => firstCall);

    const p1 = useBookmarkStore.getState().loadBookmarks("repo-1");
    const p2 = useBookmarkStore.getState().loadBookmarks("repo-1");

    resolveFirst!([makeBookmark()]);
    await Promise.all([p1, p2]);

    expect(listBookmarks).toHaveBeenCalledTimes(1);
  });

  it("allows new call after first completes", async () => {
    vi.mocked(listBookmarks).mockResolvedValue([]);

    await useBookmarkStore.getState().loadBookmarks("repo-1");
    await useBookmarkStore.getState().loadBookmarks("repo-1");

    expect(listBookmarks).toHaveBeenCalledTimes(2);
  });
});

describe("bookmarkStore - toggleBookmark", () => {
  it("adds bookmark and shows toast when result is truthy", async () => {
    const bm = makeBookmark();
    vi.mocked(toggleBookmark).mockResolvedValue(bm as any);
    vi.mocked(listBookmarks).mockResolvedValue([bm]);

    await useBookmarkStore.getState().toggleBookmark("repo-1", "src/index.ts", 10);

    expect(listBookmarks).toHaveBeenCalledWith("repo-1");
    expect(useBookmarkStore.getState().bookmarks["repo-1"]).toEqual([bm]);
    expect(useToastStore.getState().toasts[0].message).toBe("Bookmark added");
  });

  it("removes bookmark and shows toast when result is null", async () => {
    vi.mocked(toggleBookmark).mockResolvedValue(null as any);
    vi.mocked(listBookmarks).mockResolvedValue([]);

    await useBookmarkStore.getState().toggleBookmark("repo-1", "src/index.ts", 10);

    expect(useToastStore.getState().toasts[0].message).toBe("Bookmark removed");
  });

  it("sets error on failure", async () => {
    vi.mocked(toggleBookmark).mockRejectedValue(new Error("fail"));

    await useBookmarkStore.getState().toggleBookmark("repo-1", "src/index.ts", 10);

    expect(useBookmarkStore.getState().error["repo-1"]).toBe("Error: fail");
  });
});

describe("bookmarkStore - addBookmark", () => {
  it("creates bookmark, reloads list, shows toast, and returns bookmark", async () => {
    const bm = makeBookmark({ id: "bm-new" });
    vi.mocked(createBookmark).mockResolvedValue(bm);
    vi.mocked(listBookmarks).mockResolvedValue([bm]);

    const result = await useBookmarkStore.getState().addBookmark({
      repoId: "repo-1",
      filePath: "src/index.ts",
      lineNumber: 10,
    });

    expect(result).toEqual(bm);
    expect(useBookmarkStore.getState().bookmarks["repo-1"]).toEqual([bm]);
    expect(useToastStore.getState().toasts[0].message).toBe("Bookmark added");
  });

  it("sets error and re-throws on failure", async () => {
    vi.mocked(createBookmark).mockRejectedValue(new Error("db error"));

    await expect(
      useBookmarkStore.getState().addBookmark({
        repoId: "repo-1",
        filePath: "src/index.ts",
        lineNumber: 10,
      }),
    ).rejects.toThrow("db error");

    expect(useBookmarkStore.getState().error["repo-1"]).toBe("Error: db error");
  });
});

describe("bookmarkStore - editBookmark", () => {
  it("updates bookmark and reloads list", async () => {
    const updated = makeBookmark({ note: "edited" });
    vi.mocked(updateBookmark).mockResolvedValue(updated);
    vi.mocked(listBookmarks).mockResolvedValue([updated]);

    await useBookmarkStore.getState().editBookmark("repo-1", "bm-1", {
      note: "edited",
    });

    expect(updateBookmark).toHaveBeenCalledWith("bm-1", { note: "edited" });
    expect(useBookmarkStore.getState().bookmarks["repo-1"]).toEqual([updated]);
  });

  it("sets error and re-throws on failure", async () => {
    vi.mocked(updateBookmark).mockRejectedValue(new Error("not found"));

    await expect(
      useBookmarkStore.getState().editBookmark("repo-1", "bm-1", { note: "x" }),
    ).rejects.toThrow("not found");

    expect(useBookmarkStore.getState().error["repo-1"]).toBe("Error: not found");
  });
});

describe("bookmarkStore - removeBookmark", () => {
  it("deletes bookmark, removes from local state, shows toast", async () => {
    const bm1 = makeBookmark({ id: "bm-1" });
    const bm2 = makeBookmark({ id: "bm-2", lineNumber: 20 });
    useBookmarkStore.setState({ bookmarks: { "repo-1": [bm1, bm2] } });
    vi.mocked(deleteBookmark).mockResolvedValue(undefined);

    await useBookmarkStore.getState().removeBookmark("repo-1", "bm-1");

    expect(deleteBookmark).toHaveBeenCalledWith("bm-1");
    expect(useBookmarkStore.getState().bookmarks["repo-1"]).toEqual([bm2]);
    expect(useToastStore.getState().toasts[0].message).toBe("Bookmark removed");
  });

  it("sets error on failure", async () => {
    vi.mocked(deleteBookmark).mockRejectedValue(new Error("db error"));

    await useBookmarkStore.getState().removeBookmark("repo-1", "bm-1");

    expect(useBookmarkStore.getState().error["repo-1"]).toBe("Error: db error");
  });
});

describe("bookmarkStore - sync helpers", () => {
  it("setEditingBookmark sets and clears editing state", () => {
    const editing = {
      repoId: "repo-1",
      filePath: "src/index.ts",
      lineNumber: 10,
    };
    useBookmarkStore.getState().setEditingBookmark(editing);
    expect(useBookmarkStore.getState().editingBookmark).toEqual(editing);

    useBookmarkStore.getState().setEditingBookmark(null);
    expect(useBookmarkStore.getState().editingBookmark).toBeNull();
  });

  it("getBookmarksForFile filters by filePath", () => {
    const bm1 = makeBookmark({ filePath: "src/a.ts" });
    const bm2 = makeBookmark({ id: "bm-2", filePath: "src/b.ts" });
    useBookmarkStore.setState({ bookmarks: { "repo-1": [bm1, bm2] } });

    const result = useBookmarkStore.getState().getBookmarksForFile("repo-1", "src/a.ts");
    expect(result).toEqual([bm1]);
  });

  it("getBookmarksForFile returns empty array for unknown repo", () => {
    const result = useBookmarkStore.getState().getBookmarksForFile("unknown", "src/a.ts");
    expect(result).toEqual([]);
  });
});
