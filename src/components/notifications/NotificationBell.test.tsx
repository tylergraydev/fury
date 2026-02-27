import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "./NotificationBell";
import { useNotificationStore } from "../../stores/notificationStore";

beforeEach(() => {
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
    panelOpen: false,
  });
});

describe("NotificationBell", () => {
  it("renders bell button", () => {
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-bell")).toBeTruthy();
  });

  it("shows no badge when unreadCount is 0", () => {
    render(<NotificationBell />);
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("shows badge with count when unreadCount > 0", () => {
    useNotificationStore.setState({ unreadCount: 5 });
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-badge").textContent).toBe("5");
  });

  it("shows 99+ when unreadCount > 99", () => {
    useNotificationStore.setState({ unreadCount: 150 });
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-badge").textContent).toBe("99+");
  });

  it("shows exact count at 99", () => {
    useNotificationStore.setState({ unreadCount: 99 });
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-badge").textContent).toBe("99");
  });

  it("clicking button calls togglePanel", async () => {
    const user = userEvent.setup();
    const togglePanel = vi.fn();
    useNotificationStore.setState({ togglePanel });

    render(<NotificationBell />);
    await user.click(screen.getByTestId("notification-bell"));

    expect(togglePanel).toHaveBeenCalled();
  });

  it("has correct title attribute", () => {
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-bell").title).toBe("Notifications");
  });
});
