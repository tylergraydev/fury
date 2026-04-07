import { create } from "zustand";
import type { IndexProgress } from "../lib/tauri/search";

interface CodebaseSearchState {
  /** Indexing progress per repo — keyed by repoId */
  indexingProgress: Record<string, IndexProgress>;

  setProgress: (repoId: string, progress: IndexProgress) => void;
  clearProgress: (repoId: string) => void;
}

export const useCodebaseSearchStore = create<CodebaseSearchState>((set) => ({
  indexingProgress: {},

  setProgress: (repoId, progress) =>
    set((state) => ({
      indexingProgress: { ...state.indexingProgress, [repoId]: progress },
    })),

  clearProgress: (repoId) =>
    set((state) => {
      const { [repoId]: _, ...rest } = state.indexingProgress;
      return { indexingProgress: rest };
    }),
}));
