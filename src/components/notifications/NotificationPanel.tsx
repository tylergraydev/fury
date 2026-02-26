import { useEffect, useRef } from "react";
import {
  Bot,
  CheckCircle,
  XCircle,
  GitMerge,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  useNotificationStore,
  type Notification,
  type NotificationType,
} from "../../stores/notificationStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";

const typeIcons: Record<NotificationType, typeof Bot> = {
  "agent-complete": Bot,
  "pr-checks-pass": CheckCircle,
  "pr-checks-fail": XCircle,
  "pr-merged": GitMerge,
  "build-error": XCircle,
  "merge-conflict": AlertTriangle,
};

const typeColors: Record<NotificationType, string> = {
  "agent-complete": "var(--accent)",
  "pr-checks-pass": "var(--success)",
  "pr-checks-fail": "var(--error)",
  "pr-merged": "var(--accent-purple)",
  "build-error": "var(--error)",
  "merge-conflict": "var(--warning)",
};

function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TimeGroup {
  label: string;
  items: Notification[];
}

function groupByTime(notifications: Notification[]): TimeGroup[] {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    let label: string;
    if (now - n.timestamp < 5 * 60 * 1000) label = "Just now";
    else if (n.timestamp >= today.getTime()) label = "Today";
    else if (n.timestamp >= yesterday.getTime()) label = "Yesterday";
    else label = "Earlier";
    (groups[label] ??= []).push(n);
  }

  return ["Just now", "Today", "Yesterday", "Earlier"]
    .filter((l) => groups[l]?.length)
    .map((label) => ({ label, items: groups[label] }));
}

function handleNotificationClick(notification: Notification) {
  // Navigate to workspace
  useWorkspaceStore.getState().setActive(notification.workspaceId);

  // Open relevant view/panel
  if (notification.navigateTo?.rightSidebarTab) {
    useUIStore.getState().setRightSidebarTab(notification.navigateTo.rightSidebarTab);
    useUIStore.getState().ensureRightSidebarVisible();
  }
  if (notification.navigateTo?.viewTab) {
    useUIStore.getState().openViewTab(notification.navigateTo.viewTab);
  }

  // Mark read and close
  useNotificationStore.getState().markRead(notification.id);
  useNotificationStore.getState().closePanel();
}

export function NotificationPanel() {
  const panelOpen = useNotificationStore((s) => s.panelOpen);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-testid='notification-bell']")
      ) {
        useNotificationStore.getState().closePanel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  if (!panelOpen) return null;

  const groups = groupByTime(notifications);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 rounded-lg shadow-xl"
      style={{
        top: 60,
        right: 16,
        width: 380,
        maxHeight: 420,
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
      }}
      data-testid="notification-panel"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Notifications
        </span>
        {unreadCount > 0 && (
          <button
            onClick={() => useNotificationStore.getState().markAllRead()}
            className="text-xs transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Mark all read
          </button>
        )}
        {notifications.length > 0 && (
          <button
            onClick={() => useNotificationStore.getState().clearAll()}
            className="text-xs transition-colors hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        )}
        <button
          onClick={() => useNotificationStore.getState().closePanel()}
          className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            No notifications
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div
                className="px-4 py-1.5 text-xs font-medium"
                style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}
              >
                {group.label}
              </div>
              {group.items.map((n) => {
                const Icon = typeIcons[n.type];
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    {/* Unread dot */}
                    <div className="flex h-5 w-2 flex-shrink-0 items-center">
                      {!n.read && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: "var(--accent)" }}
                        />
                      )}
                    </div>

                    {/* Icon */}
                    <Icon
                      className="mt-0.5 h-4 w-4 flex-shrink-0"
                      style={{ color: typeColors[n.type] }}
                    />

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {n.title}
                        </span>
                        <span
                          className="flex-shrink-0 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {relativeTime(n.timestamp)}
                        </span>
                      </div>
                      <div
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {n.message}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
