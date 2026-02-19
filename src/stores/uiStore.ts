import { create } from "zustand";

export type RightSidebarTab = "files" | "changes" | "checks";
export type BottomTab = "setup" | "terminal" | "run";

interface UIStore {
  rightSidebarTab: RightSidebarTab;
  setRightSidebarTab: (tab: RightSidebarTab) => void;
  rightSidebarVisible: boolean;
  toggleRightSidebar: () => void;
  bottomTab: BottomTab;
  setBottomTab: (tab: BottomTab) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  rightSidebarTab: "files",
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
  rightSidebarVisible: true,
  toggleRightSidebar: () =>
    set((state) => ({ rightSidebarVisible: !state.rightSidebarVisible })),
  bottomTab: "terminal",
  setBottomTab: (tab) => set({ bottomTab: tab }),
}));
