import { create } from "zustand";
import {
  type FileBookmark,
  type CreateBookmarkRequest,
  type UpdateBookmarkRequest,
  listBookmarks as listBookmarksCmd,
  createBookmark as createBookmarkCmd,
  updateBookmark as updateBookmarkCmd,
  deleteBookmark as deleteBookmarkCmd,
  toggleBookmark as toggleBookmarkCmd,
} from "../lib/tauri";
import { useToastStore } from "./toastStore";

interface BookmarkStore {
  bookmarks: Record<string, FileBookmark[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  editingBookmark: {
    repoId: string;
    filePath: string;
    lineNumber: number;
    existing?: FileBookmark;
  } | null;

  loadBookmarks: (repoId: string) => Promise<void>;
  toggleBookmark: (
    repoId: string,
    filePath: string,
    lineNumber: number,
  ) => Promise<void>;
  addBookmark: (request: CreateBookmarkRequest) => Promise<FileBookmark>;
  editBookmark: (
    repoId: string,
    bookmarkId: string,
    request: UpdateBookmarkRequest,
  ) => Promise<void>;
  removeBookmark: (repoId: string, bookmarkId: string) => Promise<void>;
  setEditingBookmark: (
    editing: BookmarkStore["editingBookmark"],
  ) => void;
  getBookmarksForFile: (repoId: string, filePath: string) => FileBookmark[];
}

const _inflightBookmarks = new Set<string>();

if (import.meta.hot) {
  import.meta.hot.dispose(() => _inflightBookmarks.clear());
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarks: {},
  loading: {},
  error: {},
  editingBookmark: null,

  loadBookmarks: async (repoId: string) => {
    if (_inflightBookmarks.has(repoId)) return;
    _inflightBookmarks.add(repoId);
    set((state) => ({
      loading: { ...state.loading, [repoId]: true },
      error: { ...state.error, [repoId]: null },
    }));
    try {
      const bookmarks = await listBookmarksCmd(repoId);
      set((state) => ({
        bookmarks: { ...state.bookmarks, [repoId]: bookmarks },
        loading: { ...state.loading, [repoId]: false },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [repoId]: String(e) },
        loading: { ...state.loading, [repoId]: false },
      }));
    } finally {
      _inflightBookmarks.delete(repoId);
    }
  },

  toggleBookmark: async (
    repoId: string,
    filePath: string,
    lineNumber: number,
  ) => {
    try {
      const result = await toggleBookmarkCmd(repoId, filePath, lineNumber);
      // Reload all bookmarks for this repo to stay in sync
      const bookmarks = await listBookmarksCmd(repoId);
      set((state) => ({
        bookmarks: { ...state.bookmarks, [repoId]: bookmarks },
      }));
      if (result) {
        useToastStore.getState().addToast("Bookmark added", "success");
      } else {
        useToastStore.getState().addToast("Bookmark removed", "success");
      }
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [repoId]: String(e) },
      }));
    }
  },

  addBookmark: async (request: CreateBookmarkRequest) => {
    try {
      const bookmark = await createBookmarkCmd(request);
      const bookmarks = await listBookmarksCmd(request.repoId);
      set((state) => ({
        bookmarks: { ...state.bookmarks, [request.repoId]: bookmarks },
      }));
      useToastStore.getState().addToast("Bookmark added", "success");
      return bookmark;
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [request.repoId]: String(e) },
      }));
      throw e;
    }
  },

  editBookmark: async (
    repoId: string,
    bookmarkId: string,
    request: UpdateBookmarkRequest,
  ) => {
    try {
      await updateBookmarkCmd(bookmarkId, request);
      const bookmarks = await listBookmarksCmd(repoId);
      set((state) => ({
        bookmarks: { ...state.bookmarks, [repoId]: bookmarks },
      }));
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [repoId]: String(e) },
      }));
      throw e;
    }
  },

  removeBookmark: async (repoId: string, bookmarkId: string) => {
    try {
      await deleteBookmarkCmd(bookmarkId);
      set((state) => ({
        bookmarks: {
          ...state.bookmarks,
          [repoId]: (state.bookmarks[repoId] ?? []).filter(
            (b) => b.id !== bookmarkId,
          ),
        },
      }));
      useToastStore.getState().addToast("Bookmark removed", "success");
    } catch (e) {
      set((state) => ({
        error: { ...state.error, [repoId]: String(e) },
      }));
    }
  },

  setEditingBookmark: (editing) => {
    set({ editingBookmark: editing });
  },

  getBookmarksForFile: (repoId: string, filePath: string) => {
    return (get().bookmarks[repoId] ?? []).filter(
      (b) => b.filePath === filePath,
    );
  },
}));
