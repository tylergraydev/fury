import { create } from "zustand";
import { applyTheme } from "../lib/themes";

export type RightSidebarTab = "files" | "changes" | "checks" | "bookmarks";
export type BottomTab = "setup" | "terminal" | "run" | "activity";
export type ViewType = "chat" | "settings" | "merge" | "history" | "diff" | "team" | "tests" | "usage" | "activity" | "browser";
export interface AgentPane {
  id: string;
  contextId: string;
  contextType: "workspace" | "repo";
  label: string;
}

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
  browser: "Browser",
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
  agentPanes: AgentPane[];
  focusedPaneIndex: number;
  addAgentPane: (contextId: string, contextType: "workspace" | "repo", label: string) => void;
  removeAgentPane: (paneId: string) => void;
  setFocusedPane: (index: number) => void;
  updatePaneContext: (paneId: string, contextId: string, contextType: "workspace" | "repo", label: string) => void;
  closeAllSplitPanes: () => void;
  removeAgentPanesForContext: (contextId: string) => void;
  splitBrowserActive: boolean;
  splitBrowser: () => void;
  closeSplitBrowser: () => void;
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
    const { viewTabs, activeViewTabId } = get();
    const idx = viewTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const closedTab = viewTabs[idx];
    const updated = viewTabs.filter((t) => t.id !== tabId);
    let nextActive = activeViewTabId;
    if (activeViewTabId === tabId) {
      const neighbor = updated[Math.min(idx, updated.length - 1)];
      nextActive = neighbor?.id ?? "chat";
    }
    const paneUpdates: Partial<UIStore> = {};
    if (closedTab.contextId) {
      const panes = get().agentPanes.filter((p) => p.contextId !== closedTab.contextId);
      if (panes.length < get().agentPanes.length) {
        paneUpdates.agentPanes = panes.length > 0 ? panes : get().agentPanes.slice(0, 1);
        paneUpdates.focusedPaneIndex = 0;
      }
    }
    set({ viewTabs: updated, activeViewTabId: nextActive, ...paneUpdates });
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
    const { viewTabs, activeViewTabId, agentPanes } = get();
    const tabId = `chat-${contextId}`;
    const updated = viewTabs.filter((t) => t.id !== tabId);
    const nextActive = activeViewTabId === tabId ? "chat" : activeViewTabId;
    const filteredPanes = agentPanes.filter((p) => p.contextId !== contextId);
    const paneUpdates: Partial<UIStore> = {};
    if (filteredPanes.length < agentPanes.length) {
      paneUpdates.agentPanes = filteredPanes.length > 0 ? filteredPanes : agentPanes.slice(0, 1);
      paneUpdates.focusedPaneIndex = 0;
    }
    set({ viewTabs: updated, activeViewTabId: nextActive, ...paneUpdates });
  },

  agentPanes: [],
  focusedPaneIndex: 0,

  addAgentPane: (contextId, contextType, label) => {
    const { agentPanes } = get();
    if (agentPanes.length >= 4) return;
    if (agentPanes.some((p) => p.contextId === contextId)) return;
    const newPane: AgentPane = {
      id: crypto.randomUUID(),
      contextId,
      contextType,
      label,
    };
    set({
      agentPanes: [...agentPanes, newPane],
      focusedPaneIndex: agentPanes.length,
    });
  },

  removeAgentPane: (paneId) => {
    const { agentPanes, focusedPaneIndex } = get();
    if (agentPanes.length <= 1) return;
    const idx = agentPanes.findIndex((p) => p.id === paneId);
    if (idx === -1) return;
    const updated = agentPanes.filter((p) => p.id !== paneId);
    set({
      agentPanes: updated,
      focusedPaneIndex: Math.min(focusedPaneIndex, updated.length - 1),
    });
  },

  setFocusedPane: (index) => {
    const { agentPanes } = get();
    if (index >= 0 && index < agentPanes.length) {
      set({ focusedPaneIndex: index });
    }
  },

  updatePaneContext: (paneId, contextId, contextType, label) => {
    set((state) => ({
      agentPanes: state.agentPanes.map((p) =>
        p.id === paneId ? { ...p, contextId, contextType, label } : p,
      ),
    }));
  },

  closeAllSplitPanes: () => {
    const { agentPanes } = get();
    if (agentPanes.length <= 1) return;
    set({ agentPanes: agentPanes.slice(0, 1), focusedPaneIndex: 0 });
  },

  removeAgentPanesForContext: (contextId) => {
    const { agentPanes } = get();
    const filtered = agentPanes.filter((p) => p.contextId !== contextId);
    if (filtered.length === agentPanes.length) return;
    set({
      agentPanes: filtered.length > 0 ? filtered : agentPanes.slice(0, 1),
      focusedPaneIndex: 0,
    });
  },

  splitBrowserActive: false,

  splitBrowser: () => {
    // Ensure browser tab exists
    const { viewTabs } = get();
    if (!viewTabs.find((t) => t.id === "browser")) {
      const newTab: ViewTab = {
        id: "browser",
        type: "browser",
        pinned: true,
        label: "Browser",
      };
      set({
        viewTabs: [...viewTabs, newTab],
        activeViewTabId: "chat",
        splitBrowserActive: true,
      });
    } else {
      set({ activeViewTabId: "chat", splitBrowserActive: true });
    }
  },

  closeSplitBrowser: () => {
    set({ splitBrowserActive: false });
  },

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
    if (state.agentPanes !== prev.agentPanes) {
      sessionStorage.setItem("fury:agentPanes", JSON.stringify(state.agentPanes));
    }
  });
}
