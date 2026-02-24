import { create } from "zustand";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
  persistent?: boolean;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"], options?: { action?: ToastAction; persistent?: boolean }) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message, type = "info", options) => {
    const id = String(++nextId);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, action: options?.action, persistent: options?.persistent }],
    }));
    if (!options?.persistent) {
      const duration = type === "error" ? 8000 : 3000;
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
