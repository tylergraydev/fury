import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  createBrowser,
  navigateBrowser,
  updateBrowserBounds,
  showBrowser,
  hideBrowser,
  closeBrowser,
} from "../lib/tauri";
import { useUIStore } from "./uiStore";

interface BrowserStore {
  webviewId: string | null;
  url: string;
  isLoading: boolean;
  error: string | null;
  consoleVisible: boolean;

  create: (url: string, x: number, y: number, width: number, height: number) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  updateBounds: (x: number, y: number, width: number, height: number) => Promise<void>;
  show: () => Promise<void>;
  hide: () => Promise<void>;
  close: () => Promise<void>;
  setConsoleVisible: (visible: boolean) => void;
  setError: (error: string | null) => void;
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  webviewId: null,
  url: "http://localhost:3000",
  isLoading: false,
  error: null,
  consoleVisible: false,

  create: async (url, x, y, width, height) => {
    set({ isLoading: true, error: null });
    try {
      const id = await createBrowser(url, x, y, width, height);
      set({ webviewId: id, url, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  navigate: async (url) => {
    const { webviewId } = get();
    if (!webviewId) return;
    set({ isLoading: true, url });
    try {
      await navigateBrowser(webviewId, url);
      set({ isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateBounds: async (x, y, width, height) => {
    const { webviewId } = get();
    if (!webviewId) return;
    try {
      await updateBrowserBounds(webviewId, x, y, width, height);
    } catch {
      // Silently ignore bounds update failures (can happen during rapid resize)
    }
  },

  show: async () => {
    const { webviewId } = get();
    if (!webviewId) return;
    try {
      await showBrowser(webviewId);
    } catch {
      // Ignore
    }
  },

  hide: async () => {
    const { webviewId } = get();
    if (!webviewId) return;
    try {
      await hideBrowser(webviewId);
    } catch {
      // Ignore
    }
  },

  close: async () => {
    const { webviewId } = get();
    if (!webviewId) return;
    try {
      await closeBrowser(webviewId);
    } catch {
      // Ignore
    }
    set({ webviewId: null });
  },

  setConsoleVisible: (visible) => set({ consoleVisible: visible }),
  setError: (error) => set({ error }),
}));

// Listen for MCP-triggered browser open events
listen<string>("browser-open", (event) => {
  const url = event.payload;
  if (url) {
    useBrowserStore.setState({ url });
    useUIStore.getState().openViewTab("browser");
  }
});
