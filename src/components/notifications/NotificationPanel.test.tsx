import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationPanel } from "./NotificationPanel";
import { useNotificationStore, type Notification, type NotificationType } from "../../stores/notificationStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-1",
    type: "agent-complete" as NotificationType,
    title: "Agent finished",
    message: "Task completed successfully",
    timestamp: Date.now() - 30 * 1000, // 30 seconds ago → "just now"
    workspaceId: "ws-1",
    workspaceName: "My Workspace",
    read: false,
    ...overrides,
  };
}

beforeEach(() => {
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
    panelOpen: false,
  });
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
  });
  vi.clearAllMocks();
});

describe("NotificationPanel", () => {
  it("returns null when panel is closed", () => {
    const { container } = render(<NotificationPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("renders panel when open", () => {
    useNotificationStore.setState({ panelOpen: true });
    render(<NotificationPanel />);
    expect(screen.getByTestId("notification-panel")).toBeTruthy();
  });

  it("shows No notifications when empty", () => {
    useNotificationStore.setState({ panelOpen: true, notifications: [] });
    render(<NotificationPanel />);
    expect(screen.getByText("No notifications")).toBeTruthy();
  });

  it("renders grouped notifications with time labels", () => {
    // Use fake timers set to noon so "3 hours ago" is always after midnight (i.e. "Today"),
    // regardless of the CI runner's timezone.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // Jan 15, 2026 12:00 noon
    const now = Date.now();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({ id: "n-1", timestamp: now - 60 * 1000 }), // Just now (<5 min)
        makeNotification({ id: "n-2", timestamp: now - 3 * 60 * 60 * 1000 }), // Today
      ],
    });
    render(<NotificationPanel />);

    expect(screen.getByText("Just now")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    vi.useRealTimers();
  });

  it("shows Mark all read when unreadCount > 0", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotification()],
      unreadCount: 3,
    });
    render(<NotificationPanel />);
    expect(screen.getByText("Mark all read")).toBeTruthy();
  });

  it("hides Mark all read when unreadCount is 0", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotification({ read: true })],
      unreadCount: 0,
    });
    render(<NotificationPanel />);
    expect(screen.queryByText("Mark all read")).toBeNull();
  });

  it("Mark all read button calls markAllRead", async () => {
    const user = userEvent.setup();
    const markAllRead = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotification()],
      unreadCount: 1,
      markAllRead,
    });
    render(<NotificationPanel />);

    await user.click(screen.getByText("Mark all read"));
    expect(markAllRead).toHaveBeenCalled();
  });

  it("Clear button calls clearAll", async () => {
    const user = userEvent.setup();
    const clearAll = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotification()],
      unreadCount: 0,
      clearAll,
    });
    render(<NotificationPanel />);

    await user.click(screen.getByText("Clear"));
    expect(clearAll).toHaveBeenCalled();
  });

  it("Close button calls closePanel", async () => {
    const user = userEvent.setup();
    const closePanel = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [],
      closePanel,
    });
    render(<NotificationPanel />);

    // The X close button
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(
      (b) => b.querySelector("svg") && !b.textContent,
    );
    await user.click(closeBtn!);
    expect(closePanel).toHaveBeenCalled();
  });

  it("clicking notification navigates to workspace", async () => {
    const user = userEvent.setup();
    const setActive = vi.fn();
    useWorkspaceStore.setState({ setActive } as any);
    const markRead = vi.fn();
    const closePanel = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotification()],
      unreadCount: 1,
      markRead,
      closePanel,
    });
    render(<NotificationPanel />);

    await user.click(screen.getByText("Agent finished"));
    expect(setActive).toHaveBeenCalledWith("ws-1");
    expect(markRead).toHaveBeenCalledWith("n-1");
    expect(closePanel).toHaveBeenCalled();
  });

  it("clicking notification with navigateTo opens sidebar tab", async () => {
    const user = userEvent.setup();
    const setActive = vi.fn();
    useWorkspaceStore.setState({ setActive } as any);
    const setRightSidebarTab = vi.fn();
    const ensureRightSidebarVisible = vi.fn();
    useUIStore.setState({ setRightSidebarTab, ensureRightSidebarVisible } as any);
    const markRead = vi.fn();
    const closePanel = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({
          navigateTo: { rightSidebarTab: "test-runner" as any },
        }),
      ],
      unreadCount: 1,
      markRead,
      closePanel,
    });
    render(<NotificationPanel />);

    await user.click(screen.getByText("Agent finished"));
    expect(setRightSidebarTab).toHaveBeenCalledWith("test-runner");
    expect(ensureRightSidebarVisible).toHaveBeenCalled();
  });

  it("shows unread dot for unread notifications", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotification({ read: false })],
      unreadCount: 1,
    });
    render(<NotificationPanel />);
    // The unread dot is a span with rounded-full class inside the notification button
    const dots = document.querySelectorAll("span.rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("click outside closes panel", () => {
    const closePanel = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [],
      closePanel,
    });
    render(<NotificationPanel />);

    fireEvent.mouseDown(document.body);
    expect(closePanel).toHaveBeenCalled();
  });

  it("renders relative time for notifications", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({ timestamp: Date.now() - 10 * 1000 }),
      ],
      unreadCount: 1,
    });
    render(<NotificationPanel />);
    expect(screen.getByText("just now")).toBeTruthy();
  });

  it("renders relative time in minutes", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({ timestamp: Date.now() - 5 * 60 * 1000 }),
      ],
      unreadCount: 1,
    });
    render(<NotificationPanel />);
    expect(screen.getByText("5m ago")).toBeTruthy();
  });

  it("renders relative time in hours", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({ timestamp: Date.now() - 3 * 60 * 60 * 1000 }),
      ],
      unreadCount: 1,
    });
    render(<NotificationPanel />);
    expect(screen.getByText("3h ago")).toBeTruthy();
  });

  it("renders relative time in days", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({ timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 }),
      ],
      unreadCount: 1,
    });
    render(<NotificationPanel />);
    expect(screen.getByText("2d ago")).toBeTruthy();
  });

  it("groups notifications into Yesterday and Earlier", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    const yesterday = new Date(2026, 0, 14, 0, 0, 0).getTime();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({ id: "n-y", timestamp: yesterday + 3600000 }), // Yesterday
        makeNotification({ id: "n-e", timestamp: yesterday - 24 * 3600000 }), // Earlier
      ],
    });
    render(<NotificationPanel />);
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
    vi.useRealTimers();
  });

  it("clicking notification with viewTab navigateTo opens view tab", async () => {
    const user = userEvent.setup();
    const setActive = vi.fn();
    useWorkspaceStore.setState({ setActive } as any);
    const openViewTab = vi.fn();
    useUIStore.setState({ openViewTab } as any);
    const markRead = vi.fn();
    const closePanel = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({
          navigateTo: { viewTab: "diff" as any },
        }),
      ],
      unreadCount: 1,
      markRead,
      closePanel,
    });
    render(<NotificationPanel />);

    await user.click(screen.getByText("Agent finished"));
    expect(openViewTab).toHaveBeenCalledWith("diff");
  });

  it("clicking notification with both rightSidebarTab and viewTab navigateTo", async () => {
    const user = userEvent.setup();
    const setActive = vi.fn();
    useWorkspaceStore.setState({ setActive } as any);
    const setRightSidebarTab = vi.fn();
    const ensureRightSidebarVisible = vi.fn();
    const openViewTab = vi.fn();
    useUIStore.setState({ setRightSidebarTab, ensureRightSidebarVisible, openViewTab } as any);
    const markRead = vi.fn();
    const closePanel = vi.fn();
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotification({
          navigateTo: { rightSidebarTab: "test-runner" as any, viewTab: "diff" as any },
        }),
      ],
      unreadCount: 1,
      markRead,
      closePanel,
    });
    render(<NotificationPanel />);

    await user.click(screen.getByText("Agent finished"));
    expect(setRightSidebarTab).toHaveBeenCalledWith("test-runner");
    expect(openViewTab).toHaveBeenCalledWith("diff");
  });

  it("does not show Clear button when notifications list is empty", () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [],
      unreadCount: 0,
    });
    render(<NotificationPanel />);
    expect(screen.queryByText("Clear")).toBeNull();
  });
});
