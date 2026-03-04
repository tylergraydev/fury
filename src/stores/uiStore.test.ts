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
