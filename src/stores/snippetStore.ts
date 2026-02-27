import { create } from "zustand";
import {
  type CreateSnippetRequest,
  type UpdateSnippetRequest,
  type Snippet,
  createSnippet,
  listSnippets,
  updateSnippet,
  deleteSnippet,
} from "../lib/tauri";

interface SnippetStore {
  snippets: Snippet[];
  loading: boolean;
  error: string | null;

  loadSnippets: () => Promise<void>;
  createSnippet: (request: CreateSnippetRequest) => Promise<Snippet>;
  updateSnippet: (
    snippetId: string,
    request: UpdateSnippetRequest,
  ) => Promise<void>;
  deleteSnippet: (snippetId: string) => Promise<void>;
}

export const useSnippetStore = create<SnippetStore>(
  (set, get) => ({
    snippets: [],
    loading: false,
    error: null,

    loadSnippets: async () => {
      set({ loading: true, error: null });
      try {
        const snippets = await listSnippets();
        set({ snippets, loading: false });
      } catch (e) {
        set({ error: String(e), loading: false });
      }
    },

    createSnippet: async (request: CreateSnippetRequest) => {
      set({ error: null });
      try {
        const snippet = await createSnippet(request);
        set({ snippets: [...get().snippets, snippet] });
        return snippet;
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },

    updateSnippet: async (
      snippetId: string,
      request: UpdateSnippetRequest,
    ) => {
      set({ error: null });
      try {
        const updated = await updateSnippet(snippetId, request);
        set({
          snippets: get().snippets.map((s) =>
            s.id === snippetId ? updated : s,
          ),
        });
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },

    deleteSnippet: async (snippetId: string) => {
      set({ error: null });
      try {
        await deleteSnippet(snippetId);
        set({
          snippets: get().snippets.filter((s) => s.id !== snippetId),
        });
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },
  }),
);
