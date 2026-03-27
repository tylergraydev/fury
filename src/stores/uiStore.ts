import { create } from "zustand";
import { applyTheme } from "../lib/themes";

export type RightSidebarTab = "files" | "changes" | "checks" | "bookmarks";
export type BottomTab = "setup" | "terminal" | "run";
export type ViewType = "chat" | "settings" | "merge" | "history" | "diff" | "team" | "tests" | "usage" | "activity";
export type ChatPaneId = "left" | "right";

export interface ViewTab {
  id: string;
  type: ViewType;
  pinned: boolean;
  label: string;
  contextId?: string;
  contextType?: "workspace" | "repo";
}

const VIEW_LABELS: Record<ViewType, string> = {
  chat: "Chat",
  settings: "Settings",
  merge: "Merge",
  history: "History",
  diff: "Changes",
  team: "Team",
  tests: "Tests",
  usage: "Usage",
  activity: "Activity",
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
  openChatTab: (contextId: string, label: string, contextType: "workspace" | "repo") => void;
  closeChatTabsForContext: (contextId: string) => void;
  splitChatActive: boolean;
  splitChatContextId: string | null;
  splitChatContextType: "workspace" | "repo" | null;
  splitChatFocusedPane: ChatPaneId;
  splitChat: (contextId: string, contextType: "workspace" | "repo") => void;
  closeSplitChat: () => void;
  setSplitChatFocusedPane: (pane: ChatPaneId) => void;
  settingsInitialTab: string | null;
  setSettingsInitialTab: (tab: string | null) => void;
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

  viewTabs: (() => {
    if (import.meta.env.DEV) {
      try {
        const saved = sessionStorage.getItem("fury:viewTabs");
        if (saved) return JSON.parse(saved) as ViewTab[];
      } catch { /* ignore */ }
    }
    return [{ id: "chat", type: "chat" as ViewType, pinned: true, label: "Chat" }];
  })(),
  activeViewTabId: (import.meta.env.DEV ? sessionStorage.getItem("fury:activeViewTabId") : null) ?? "chat",

  openViewTab: (type, pin = true) => {
    if (type === "chat") {
      set({ activeViewTabId: "chat" });
      return;
    }
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
    const { viewTabs, activeViewTabId, splitChatContextId } = get();
    const idx = viewTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const closedTab = viewTabs[idx];
    const updated = viewTabs.filter((t) => t.id !== tabId);
    let nextActive = activeViewTabId;
    if (activeViewTabId === tabId) {
      const neighbor = updated[Math.min(idx, updated.length - 1)];
      nextActive = neighbor?.id ?? "chat";
    }
    const splitUpdates = (closedTab.contextId && closedTab.contextId === splitChatContextId)
      ? { splitChatActive: false, splitChatContextId: null, splitChatContextType: null, splitChatFocusedPane: "left" as const }
      : {};
    set({ viewTabs: updated, activeViewTabId: nextActive, ...splitUpdates });
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

  openChatTab: (contextId, label, contextType) => {
    const { viewTabs } = get();
    const tabId = `chat-${contextId}`;
    const existing = viewTabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeViewTabId: tabId });
      return;
    }
    const newTab: ViewTab = {
      id: tabId,
      type: "chat",
      pinned: true,
      label,
      contextId,
      contextType,
    };
    set({ viewTabs: [...viewTabs, newTab], activeViewTabId: tabId });
  },

  closeChatTabsForContext: (contextId) => {
    const { viewTabs, activeViewTabId, splitChatContextId } = get();
    const tabId = `chat-${contextId}`;
    const updated = viewTabs.filter((t) => t.id !== tabId);
    const nextActive = activeViewTabId === tabId ? "chat" : activeViewTabId;
    const splitUpdates = splitChatContextId === contextId
      ? { splitChatActive: false, splitChatContextId: null, splitChatContextType: null, splitChatFocusedPane: "left" as const }
      : {};
    set({ viewTabs: updated, activeViewTabId: nextActive, ...splitUpdates });
  },

  splitChatActive: false,
  splitChatContextId: null,
  splitChatContextType: null,
  splitChatFocusedPane: "left" as ChatPaneId,

  splitChat: (contextId, contextType) => {
    set({
      splitChatActive: true,
      splitChatContextId: contextId,
      splitChatContextType: contextType,
      splitChatFocusedPane: "right",
    });
  },

  closeSplitChat: () => {
    set({
      splitChatActive: false,
      splitChatContextId: null,
      splitChatContextType: null,
      splitChatFocusedPane: "left",
    });
  },

  setSplitChatFocusedPane: (pane) => set({ splitChatFocusedPane: pane }),

  settingsInitialTab: null,
  setSettingsInitialTab: (tab) => set({ settingsInitialTab: tab }),
}));

if (import.meta.env.DEV) {
  useUIStore.subscribe((state, prev) => {
    if (state.viewTabs !== prev.viewTabs) {
      sessionStorage.setItem("fury:viewTabs", JSON.stringify(state.viewTabs));
    }
    if (state.activeViewTabId !== prev.activeViewTabId) {
      sessionStorage.setItem("fury:activeViewTabId", state.activeViewTabId);
    }
  });
}
