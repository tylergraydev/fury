import { create } from "zustand";
import type { RightSidebarTab, ViewType } from "./uiStore";

export type NotificationType =
  | "agent-complete"
  | "pr-checks-pass"
  | "pr-checks-fail"
  | "pr-merged"
  | "build-error"
  | "merge-conflict";

export interface NotificationNavigateTo {
  viewTab?: ViewType;
  rightSidebarTab?: RightSidebarTab;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  workspaceId: string;
  workspaceName: string;
  read: boolean;
  navigateTo?: NotificationNavigateTo;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  panelOpen: boolean;

  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  closePanel: () => void;
}

const MAX_NOTIFICATIONS = 200;
let nextId = 0;

// Stryker disable all: initial state values — reset by tests in beforeEach, mutations unobservable
export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  panelOpen: false,
// Stryker restore all

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: String(++nextId),
      timestamp: Date.now(),
      read: false,
    };
    set((state) => {
      const updated = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      return {
        notifications: updated,
        unreadCount: updated.filter((item) => !item.read).length,
      };
    });
  },

  markRead: (id) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  dismiss: (id) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),

  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),

  closePanel: () => set({ panelOpen: false }),
}));
