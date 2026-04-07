import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/themes", () => ({
  applyTheme: vi.fn(),
}));

import { useUIStore, type ViewTab } from "./uiStore";
import { applyTheme } from "../lib/themes";

const defaultChatTab: ViewTab = {
  id: "chat",
  type: "chat",
  pinned: true,
  label: "Chat",
};

beforeEach(() => {
  useUIStore.setState(
    {
      theme: "blend",
      rightSidebarTab: "files",
      rightSidebarVisible: true,
      bottomTab: "setup",
      viewTabs: [{ ...defaultChatTab }],
      activeViewTabId: "chat",
      agentPanes: [],
      focusedPaneIndex: 0,
    },
  );
  vi.clearAllMocks();
});

describe("uiStore - initial state", () => {
  it("has correct default values", () => {
    const state = useUIStore.getState();
    expect(state.theme).toBe("blend");
    expect(state.rightSidebarTab).toBe("files");
    expect(state.rightSidebarVisible).toBe(true);
    expect(state.bottomTab).toBe("setup");
    expect(state.viewTabs).toHaveLength(1);
    expect(state.viewTabs[0]).toEqual(defaultChatTab);
    expect(state.activeViewTabId).toBe("chat");
  });
});

describe("uiStore - theme", () => {
  it("setTheme updates theme and calls applyTheme", () => {
    useUIStore.getState().setTheme("midnight");
    expect(useUIStore.getState().theme).toBe("midnight");
    expect(applyTheme).toHaveBeenCalledWith("midnight");
  });
});

describe("uiStore - sidebar", () => {
  it("toggleRightSidebar toggles visibility", () => {
    expect(useUIStore.getState().rightSidebarVisible).toBe(true);
    useUIStore.getState().toggleRightSidebar();
    expect(useUIStore.getState().rightSidebarVisible).toBe(false);
    useUIStore.getState().toggleRightSidebar();
    expect(useUIStore.getState().rightSidebarVisible).toBe(true);
  });

  it("ensureRightSidebarVisible opens sidebar when hidden", () => {
    useUIStore.setState({ rightSidebarVisible: false });
    useUIStore.getState().ensureRightSidebarVisible();
    expect(useUIStore.getState().rightSidebarVisible).toBe(true);
  });

  it("ensureRightSidebarVisible is a no-op when already visible", () => {
    useUIStore.setState({ rightSidebarVisible: true });
    useUIStore.getState().ensureRightSidebarVisible();
    expect(useUIStore.getState().rightSidebarVisible).toBe(true);
  });

  it("setRightSidebarTab changes the active tab", () => {
    useUIStore.getState().setRightSidebarTab("changes");
    expect(useUIStore.getState().rightSidebarTab).toBe("changes");
  });

  it("setBottomTab changes the bottom tab", () => {
    useUIStore.getState().setBottomTab("setup");
    expect(useUIStore.getState().bottomTab).toBe("setup");
  });
});

describe("uiStore - view tabs", () => {
  it("openViewTab adds a new tab and activates it", () => {
    useUIStore.getState().openViewTab("settings");
    const { viewTabs, activeViewTabId } = useUIStore.getState();
    expect(viewTabs).toHaveLength(2);
    expect(viewTabs[1]).toEqual({
      id: "settings",
      type: "settings",
      pinned: true,
      label: "Settings",
    });
    expect(activeViewTabId).toBe("settings");
  });

  it("openViewTab activates an existing tab of the same type", () => {
    useUIStore.getState().openViewTab("settings");
    useUIStore.getState().setActiveViewTab("chat");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
    useUIStore.getState().openViewTab("settings");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
    expect(useUIStore.getState().activeViewTabId).toBe("settings");
  });

  it("openViewTab replaces unpinned preview tab when pin=false", () => {
    useUIStore.getState().openViewTab("settings", false);
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
    useUIStore.getState().openViewTab("history", false);
    const { viewTabs } = useUIStore.getState();
    expect(viewTabs).toHaveLength(2);
    expect(viewTabs[1].type).toBe("history");
  });

  it("closeViewTab removes the tab", () => {
    useUIStore.getState().openViewTab("settings");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
    useUIStore.getState().closeViewTab("settings");
    expect(useUIStore.getState().viewTabs).toHaveLength(1);
    expect(useUIStore.getState().viewTabs[0].id).toBe("chat");
  });

  it("closeViewTab cannot close the chat tab", () => {
    useUIStore.getState().closeViewTab("chat");
    expect(useUIStore.getState().viewTabs).toHaveLength(1);
    expect(useUIStore.getState().viewTabs[0].id).toBe("chat");
  });

  it("closeViewTab is a no-op for non-existent tab id", () => {
    useUIStore.getState().closeViewTab("nonexistent");
    expect(useUIStore.getState().viewTabs).toHaveLength(1);
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("closeViewTab activates a neighbor when closing the active tab", () => {
    useUIStore.getState().openViewTab("settings");
    useUIStore.getState().setActiveViewTab("settings");
    useUIStore.getState().closeViewTab("settings");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("closeViewTab activates neighbor at clamped index when closing last tab", () => {
    // Add settings and history tabs
    useUIStore.getState().openViewTab("settings");
    useUIStore.getState().openViewTab("history");
    // Active is history (last tab)
    expect(useUIStore.getState().activeViewTabId).toBe("history");
    // Close history - should activate settings (the new last tab)
    useUIStore.getState().closeViewTab("history");
    expect(useUIStore.getState().activeViewTabId).toBe("settings");
  });

  it("closeViewTab does not change activeViewTabId when closing a non-active tab", () => {
    useUIStore.getState().openViewTab("settings");
    useUIStore.getState().openViewTab("history");
    // Active is "history"
    useUIStore.getState().setActiveViewTab("history");
    expect(useUIStore.getState().activeViewTabId).toBe("history");

    // Close "settings" which is NOT active
    useUIStore.getState().closeViewTab("settings");

    // Active should still be "history"
    expect(useUIStore.getState().activeViewTabId).toBe("history");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
  });

  it("setActiveViewTab changes the active view tab", () => {
    useUIStore.getState().openViewTab("settings");
    useUIStore.getState().setActiveViewTab("chat");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("setActiveViewTab ignores non-existent tab ids", () => {
    useUIStore.getState().setActiveViewTab("nonexistent");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("closeViewTab falls back to 'chat' when no neighbor exists (line 96 ?? branch)", () => {
    // Set state with only a single non-chat tab (bypass the normal chat-protection)
    useUIStore.setState({
      viewTabs: [{ id: "settings", type: "settings", pinned: true, label: "Settings" }],
      activeViewTabId: "settings",
    });
    useUIStore.getState().closeViewTab("settings");
    // With no tabs remaining, neighbor is undefined, so nextActive falls back to "chat"
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
    expect(useUIStore.getState().viewTabs).toHaveLength(0);
  });

  it("pinViewTab marks a view tab as pinned", () => {
    useUIStore.getState().openViewTab("settings", false);
    expect(useUIStore.getState().viewTabs[1].pinned).toBe(false);
    useUIStore.getState().pinViewTab("settings");
    expect(useUIStore.getState().viewTabs[1].pinned).toBe(true);
  });

  it("openViewTab('chat') activates the default chat tab without creating a new one", () => {
    useUIStore.getState().openViewTab("settings");
    expect(useUIStore.getState().activeViewTabId).toBe("settings");
    useUIStore.getState().openViewTab("chat");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
  });
});

describe("uiStore - workspace chat tabs", () => {
  it("openChatTab creates a new tab with contextId", () => {
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    const { viewTabs, activeViewTabId } = useUIStore.getState();
    expect(viewTabs).toHaveLength(2);
    expect(viewTabs[1]).toMatchObject({
      id: "chat-ws-1",
      type: "chat",
      contextId: "ws-1",
      contextType: "workspace",
      label: "My Workspace",
      pinned: true,
    });
    expect(activeViewTabId).toBe("chat-ws-1");
  });

  it("openChatTab activates existing tab if already open", () => {
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    useUIStore.getState().setActiveViewTab("chat");
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
    expect(useUIStore.getState().activeViewTabId).toBe("chat-ws-1");
  });

  it("closeViewTab closes a workspace chat tab", () => {
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    useUIStore.getState().closeViewTab("chat-ws-1");
    expect(useUIStore.getState().viewTabs).toHaveLength(1);
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("closeViewTab cannot close the default chat tab", () => {
    useUIStore.getState().closeViewTab("chat");
    expect(useUIStore.getState().viewTabs).toHaveLength(1);
  });

  it("closeChatTabsForContext removes tabs for a workspace", () => {
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    useUIStore.getState().closeChatTabsForContext("ws-1");
    expect(useUIStore.getState().viewTabs).toHaveLength(1);
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("closeChatTabsForContext falls back to chat when active tab is removed", () => {
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    expect(useUIStore.getState().activeViewTabId).toBe("chat-ws-1");
    useUIStore.getState().closeChatTabsForContext("ws-1");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
  });

  it("closeChatTabsForContext preserves active tab when non-active tab is removed", () => {
    useUIStore.getState().openChatTab("ws-1", "Workspace A", "workspace");
    useUIStore.getState().openChatTab("ws-2", "Workspace B", "workspace");
    expect(useUIStore.getState().activeViewTabId).toBe("chat-ws-2");
    useUIStore.getState().closeChatTabsForContext("ws-1");
    expect(useUIStore.getState().activeViewTabId).toBe("chat-ws-2");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
  });

  it("closeChatTabsForContext is a no-op for non-existent context", () => {
    useUIStore.getState().openChatTab("ws-1", "My Workspace", "workspace");
    useUIStore.getState().closeChatTabsForContext("ws-999");
    expect(useUIStore.getState().viewTabs).toHaveLength(2);
    expect(useUIStore.getState().activeViewTabId).toBe("chat-ws-1");
  });
});

describe("uiStore - agent panes", () => {
  it("has correct agent pane defaults", () => {
    const state = useUIStore.getState();
    expect(state.agentPanes).toEqual([]);
    expect(state.focusedPaneIndex).toBe(0);
  });

  it("addAgentPane adds a pane and focuses it", () => {
    useUIStore.setState({ agentPanes: [{ id: "primary", contextId: "ws-1", contextType: "workspace", label: "WS 1" }] });
    useUIStore.getState().addAgentPane("ws-2", "workspace", "WS 2");
    const state = useUIStore.getState();
    expect(state.agentPanes).toHaveLength(2);
    expect(state.agentPanes[1].contextId).toBe("ws-2");
    expect(state.focusedPaneIndex).toBe(1);
  });

  it("addAgentPane caps at 4 panes", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
        { id: "p3", contextId: "ws-3", contextType: "workspace", label: "WS 3" },
        { id: "p4", contextId: "ws-4", contextType: "workspace", label: "WS 4" },
      ],
    });
    useUIStore.getState().addAgentPane("ws-5", "workspace", "WS 5");
    expect(useUIStore.getState().agentPanes).toHaveLength(4);
  });

  it("addAgentPane prevents duplicates", () => {
    useUIStore.setState({ agentPanes: [{ id: "primary", contextId: "ws-1", contextType: "workspace", label: "WS 1" }] });
    useUIStore.getState().addAgentPane("ws-1", "workspace", "WS 1");
    expect(useUIStore.getState().agentPanes).toHaveLength(1);
  });

  it("removeAgentPane removes the pane and clamps focus", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
      ],
      focusedPaneIndex: 1,
    });
    useUIStore.getState().removeAgentPane("p2");
    const state = useUIStore.getState();
    expect(state.agentPanes).toHaveLength(1);
    expect(state.focusedPaneIndex).toBe(0);
  });

  it("removeAgentPane is a no-op when only one pane exists", () => {
    useUIStore.setState({ agentPanes: [{ id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" }] });
    useUIStore.getState().removeAgentPane("p1");
    expect(useUIStore.getState().agentPanes).toHaveLength(1);
  });

  it("setFocusedPane changes focused index within bounds", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
      ],
    });
    useUIStore.getState().setFocusedPane(1);
    expect(useUIStore.getState().focusedPaneIndex).toBe(1);
  });

  it("setFocusedPane ignores out-of-bounds index", () => {
    useUIStore.setState({ agentPanes: [{ id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" }] });
    useUIStore.getState().setFocusedPane(5);
    expect(useUIStore.getState().focusedPaneIndex).toBe(0);
  });

  it("closeAllSplitPanes keeps only the first pane", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
        { id: "p3", contextId: "ws-3", contextType: "workspace", label: "WS 3" },
      ],
      focusedPaneIndex: 2,
    });
    useUIStore.getState().closeAllSplitPanes();
    const state = useUIStore.getState();
    expect(state.agentPanes).toHaveLength(1);
    expect(state.agentPanes[0].contextId).toBe("ws-1");
    expect(state.focusedPaneIndex).toBe(0);
  });

  it("updatePaneContext updates a specific pane's context", () => {
    useUIStore.setState({ agentPanes: [{ id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" }] });
    useUIStore.getState().updatePaneContext("p1", "ws-99", "repo", "Repo 99");
    const pane = useUIStore.getState().agentPanes[0];
    expect(pane.contextId).toBe("ws-99");
    expect(pane.contextType).toBe("repo");
    expect(pane.label).toBe("Repo 99");
  });

  it("removeAgentPanesForContext removes panes matching context", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
      ],
    });
    useUIStore.getState().removeAgentPanesForContext("ws-2");
    expect(useUIStore.getState().agentPanes).toHaveLength(1);
    expect(useUIStore.getState().agentPanes[0].contextId).toBe("ws-1");
  });

  it("removeAgentPanesForContext preserves at least one pane", () => {
    useUIStore.setState({
      agentPanes: [{ id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" }],
    });
    useUIStore.getState().removeAgentPanesForContext("ws-1");
    expect(useUIStore.getState().agentPanes).toHaveLength(1);
  });

  it("closeChatTabsForContext removes panes for that context", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
      ],
    });
    useUIStore.getState().openChatTab("ws-2", "Workspace B", "workspace");
    useUIStore.getState().closeChatTabsForContext("ws-2");
    expect(useUIStore.getState().agentPanes).toHaveLength(1);
    expect(useUIStore.getState().agentPanes[0].contextId).toBe("ws-1");
  });

  it("closeChatTabsForContext preserves panes for different context", () => {
    useUIStore.setState({
      agentPanes: [
        { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
        { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
      ],
    });
    useUIStore.getState().openChatTab("ws-2", "Workspace B", "workspace");
    useUIStore.getState().openChatTab("ws-3", "Workspace C", "workspace");
    useUIStore.getState().closeChatTabsForContext("ws-3");
    expect(useUIStore.getState().agentPanes).toHaveLength(2);
  });
});

describe("uiStore - setSettingsInitialTab", () => {
  it("sets and clears settingsInitialTab", () => {
    useUIStore.getState().setSettingsInitialTab("keybindings");
    expect(useUIStore.getState().settingsInitialTab).toBe("keybindings");

    useUIStore.getState().setSettingsInitialTab(null);
    expect(useUIStore.getState().settingsInitialTab).toBeNull();
  });
});
