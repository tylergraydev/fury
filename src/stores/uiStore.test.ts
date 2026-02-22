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
      bottomTab: "terminal",
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
    expect(state.bottomTab).toBe("terminal");
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

  it("closeViewTab activates a neighbor when closing the active tab", () => {
    useUIStore.getState().openViewTab("settings");
    useUIStore.getState().setActiveViewTab("settings");
    useUIStore.getState().closeViewTab("settings");
    expect(useUIStore.getState().activeViewTabId).toBe("chat");
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

  it("pinViewTab marks a view tab as pinned", () => {
    useUIStore.getState().openViewTab("settings", false);
    expect(useUIStore.getState().viewTabs[1].pinned).toBe(false);
    useUIStore.getState().pinViewTab("settings");
    expect(useUIStore.getState().viewTabs[1].pinned).toBe(true);
  });
});
