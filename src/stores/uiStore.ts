import { create } from "zustand";
import { applyTheme } from "../lib/themes";

export type RightSidebarTab = "files" | "changes" | "checks";
export type BottomTab = "setup" | "terminal" | "run";
export type ViewType = "chat" | "settings" | "merge" | "history" | "diff" | "team" | "tests";

export interface ViewTab {
  id: string;
  type: ViewType;
  pinned: boolean;
  label: string;
}

const VIEW_LABELS: Record<ViewType, string> = {
  chat: "Chat",
  settings: "Settings",
  merge: "Merge",
  history: "History",
  diff: "Changes",
  team: "Team",
  tests: "Tests",
};

interface UIStore {
  theme: string;
  setTheme: (name: string) => void;
  rightSidebarTab: RightSidebarTab;
  setRightSidebarTab: (tab: RightSidebarTab) => void;
  rightSidebarVisible: boolean;
  toggleRightSidebar: () => void;
  ensureRightSidebarVisible: () => void;
  bottomTab: BottomTab;
  setBottomTab: (tab: BottomTab) => void;
  viewTabs: ViewTab[];
  activeViewTabId: string;
  openViewTab: (type: ViewType, pin?: boolean) => void;
  closeViewTab: (tabId: string) => void;
  setActiveViewTab: (tabId: string) => void;
  pinViewTab: (tabId: string) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  theme: "blend",
  setTheme: (name) => {
    applyTheme(name);
    set({ theme: name });
  },
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
  bottomTab: "setup",
  setBottomTab: (tab) => set({ bottomTab: tab }),

  viewTabs: [{ id: "chat", type: "chat" as ViewType, pinned: true, label: "Chat" }],
  activeViewTabId: "chat",

  openViewTab: (type, pin = true) => {
    const { viewTabs } = get();
    const existing = viewTabs.find((t) => t.type === type);
    if (existing) {
      set({ activeViewTabId: existing.id });
      return;
    }
    const newTab: ViewTab = {
      id: type,
      type,
      pinned: pin,
      label: VIEW_LABELS[type],
    };
    if (!pin) {
      const unpinnedIdx = viewTabs.findIndex((t) => !t.pinned);
      if (unpinnedIdx !== -1) {
        const updated = [...viewTabs];
        updated[unpinnedIdx] = newTab;
        set({ viewTabs: updated, activeViewTabId: newTab.id });
        return;
      }
    }
    set({ viewTabs: [...viewTabs, newTab], activeViewTabId: newTab.id });
  },

  closeViewTab: (tabId) => {
    if (tabId === "chat") return;
    const { viewTabs, activeViewTabId } = get();
    const idx = viewTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const updated = viewTabs.filter((t) => t.id !== tabId);
    let nextActive = activeViewTabId;
    if (activeViewTabId === tabId) {
      const neighbor = updated[Math.min(idx, updated.length - 1)];
      nextActive = neighbor?.id ?? "chat";
    }
    set({ viewTabs: updated, activeViewTabId: nextActive });
  },

  setActiveViewTab: (tabId) => {
    if (get().viewTabs.some((t) => t.id === tabId)) {
      set({ activeViewTabId: tabId });
    }
  },

  pinViewTab: (tabId) => {
    set((state) => ({
      viewTabs: state.viewTabs.map((t) =>
        t.id === tabId ? { ...t, pinned: true } : t,
      ),
    }));
  },
}));
