import { Bell } from "lucide-react";
import { useNotificationStore } from "../../stores/notificationStore";

export function NotificationBell() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const togglePanel = useNotificationStore((s) => s.togglePanel);

  return (
    <button
      onClick={togglePanel}
      className="relative rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
      title="Notifications"
      data-testid="notification-bell"
    >
      <Bell className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ backgroundColor: "var(--error)", color: "#fff" }}
          data-testid="notification-badge"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
