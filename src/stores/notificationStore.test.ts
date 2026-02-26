import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore, type Notification } from "./notificationStore";

type AddInput = Omit<Notification, "id" | "timestamp" | "read">;

function addSample(overrides?: Partial<AddInput>) {
  useNotificationStore.getState().addNotification({
    type: "agent-complete",
    title: "Agent completed",
    message: "Task finished",
    workspaceId: "ws-1",
    workspaceName: "my-workspace",
    ...overrides,
  });
}

describe("notificationStore", () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0, panelOpen: false });
  });

  describe("addNotification", () => {
    it("adds a notification with generated id, timestamp, and read=false", () => {
      addSample();
      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe("Agent completed");
      expect(notifications[0].read).toBe(false);
      expect(notifications[0].id).toBeTruthy();
      expect(notifications[0].timestamp).toBeGreaterThan(0);
    });

    it("prepends new notifications (newest first)", () => {
      addSample({ title: "First" });
      addSample({ title: "Second" });
      const notifications = useNotificationStore.getState().notifications;
      expect(notifications[0].title).toBe("Second");
      expect(notifications[1].title).toBe("First");
    });

    it("updates unreadCount on add", () => {
      addSample();
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      addSample();
      expect(useNotificationStore.getState().unreadCount).toBe(2);
    });

    it("caps at 200 notifications", () => {
      for (let i = 0; i < 210; i++) {
        addSample({ title: `n-${i}` });
      }
      expect(useNotificationStore.getState().notifications).toHaveLength(200);
      // Newest should be first
      expect(useNotificationStore.getState().notifications[0].title).toBe("n-209");
    });

    it("preserves navigateTo field", () => {
      addSample({ navigateTo: { rightSidebarTab: "checks" } });
      expect(useNotificationStore.getState().notifications[0].navigateTo?.rightSidebarTab).toBe("checks");
    });
  });

  describe("markRead", () => {
    it("marks a specific notification as read", () => {
      addSample();
      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().markRead(id);
      expect(useNotificationStore.getState().notifications[0].read).toBe(true);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it("is a no-op for unknown id", () => {
      addSample();
      useNotificationStore.getState().markRead("nonexistent");
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });
  });

  describe("markAllRead", () => {
    it("marks all notifications as read", () => {
      addSample();
      addSample();
      addSample();
      useNotificationStore.getState().markAllRead();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
      expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true);
    });
  });

  describe("dismiss", () => {
    it("removes a specific notification", () => {
      addSample({ title: "a" });
      addSample({ title: "b" });
      const id = useNotificationStore.getState().notifications[1].id; // "a"
      useNotificationStore.getState().dismiss(id);
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
      expect(useNotificationStore.getState().notifications[0].title).toBe("b");
    });

    it("updates unreadCount after dismiss", () => {
      addSample();
      addSample();
      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().dismiss(id);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });
  });

  describe("clearAll", () => {
    it("removes all notifications", () => {
      addSample();
      addSample();
      useNotificationStore.getState().clearAll();
      expect(useNotificationStore.getState().notifications).toHaveLength(0);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe("togglePanel / closePanel", () => {
    it("toggles panel open state", () => {
      expect(useNotificationStore.getState().panelOpen).toBe(false);
      useNotificationStore.getState().togglePanel();
      expect(useNotificationStore.getState().panelOpen).toBe(true);
      useNotificationStore.getState().togglePanel();
      expect(useNotificationStore.getState().panelOpen).toBe(false);
    });

    it("closePanel sets panelOpen to false", () => {
      useNotificationStore.getState().togglePanel();
      expect(useNotificationStore.getState().panelOpen).toBe(true);
      useNotificationStore.getState().closePanel();
      expect(useNotificationStore.getState().panelOpen).toBe(false);
    });
  });
});
