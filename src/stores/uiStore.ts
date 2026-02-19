import { create } from "zustand";

type ViewMode = "chat" | "diff" | "pr" | "notes";

interface UIStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleDiff: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: "chat",
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleDiff: () =>
    set((state) => ({
      viewMode: state.viewMode === "diff" ? "chat" : "diff",
    })),
}));
