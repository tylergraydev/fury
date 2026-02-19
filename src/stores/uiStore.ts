import { create } from "zustand";

export type RightSidebarTab = "files" | "changes" | "checks";
export type BottomTab = "setup" | "terminal" | "run";

interface UIStore {
  rightSidebarTab: RightSidebarTab;
  setRightSidebarTab: (tab: RightSidebarTab) => void;
  rightSidebarVisible: boolean;
  toggleRightSidebar: () => void;
  ensureRightSidebarVisible: () => void;
  bottomTab: BottomTab;
  setBottomTab: (tab: BottomTab) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  rightSidebarTab: "files",
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
  rightSidebarVisible: true,
  toggleRightSidebar: () =>
    set((state) => ({ rightSidebarVisible: !state.rightSidebarVisible })),
  ensureRightSidebarVisible: () => {
    if (!get().rightSidebarVisible) {
      set({ rightSidebarVisible: true });
    }
  },
  bottomTab: "terminal",
  setBottomTab: (tab) => set({ bottomTab: tab }),
}));
