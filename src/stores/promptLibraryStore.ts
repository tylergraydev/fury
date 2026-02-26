import { create } from "zustand";
import {
  type CreatePromptRequest,
  type UpdatePromptRequest,
  type Prompt,
  createPrompt,
  listPrompts,
  updatePrompt,
  deletePrompt,
} from "../lib/tauri";

interface PromptLibraryStore {
  prompts: Prompt[];
  loading: boolean;
  error: string | null;

  loadPrompts: () => Promise<void>;
  createPrompt: (request: CreatePromptRequest) => Promise<Prompt>;
  updatePrompt: (
    promptId: string,
    request: UpdatePromptRequest,
  ) => Promise<void>;
  deletePrompt: (promptId: string) => Promise<void>;
}

export const usePromptLibraryStore = create<PromptLibraryStore>(
  (set, get) => ({
    prompts: [],
    loading: false,
    error: null,

    loadPrompts: async () => {
      set({ loading: true, error: null });
      try {
        const prompts = await listPrompts();
        set({ prompts, loading: false });
      } catch (e) {
        set({ error: String(e), loading: false });
      }
    },

    createPrompt: async (request: CreatePromptRequest) => {
      set({ error: null });
      try {
        const prompt = await createPrompt(request);
        set({ prompts: [...get().prompts, prompt] });
        return prompt;
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },

    updatePrompt: async (
      promptId: string,
      request: UpdatePromptRequest,
    ) => {
      set({ error: null });
      try {
        const updated = await updatePrompt(promptId, request);
        set({
          prompts: get().prompts.map((p) =>
            p.id === promptId ? updated : p,
          ),
        });
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },

    deletePrompt: async (promptId: string) => {
      set({ error: null });
      try {
        await deletePrompt(promptId);
        set({
          prompts: get().prompts.filter((p) => p.id !== promptId),
        });
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },
  }),
);
