import { create } from "zustand";
import {
  startCopilot,
  stopCopilot,
  copilotSignIn,
  copilotCheckStatus,
  registerCopilotProvider,
  disposeCopilotProvider,
  type CopilotSignInResult,
} from "../lib/copilot";

type CopilotConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface CopilotStore {
  connectionStatus: CopilotConnectionStatus;
  authStatus: unknown;
  signInResult: CopilotSignInResult | null;
  error: string | null;

  initialize: (rootUri: string) => Promise<void>;
  shutdown: () => Promise<void>;
  signIn: () => Promise<void>;
  checkStatus: () => Promise<void>;
  pollUntilSignedIn: () => void;
  stopPolling: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useCopilotStore = create<CopilotStore>((set, get) => ({
  connectionStatus: "disconnected",
  authStatus: null,
  signInResult: null,
  error: null,

  initialize: async (rootUri: string) => {
    const status = get().connectionStatus;
    if (status === "connected" || status === "connecting") return;

    set({ connectionStatus: "connecting", error: null });
    try {
      await startCopilot(rootUri);
      registerCopilotProvider();
      set({ connectionStatus: "connected" });
      // Auto-check auth status
      get().checkStatus().catch((e) => console.warn("[copilot] Failed to check auth status:", e));
    } catch (e) {
      set({ connectionStatus: "error", error: String(e) });
    }
  },

  shutdown: async () => {
    get().stopPolling();
    disposeCopilotProvider();
    try {
      await stopCopilot();
    } catch (e) {
      console.warn("[copilot] Failed to stop Copilot LS:", e);
    }
    set({
      connectionStatus: "disconnected",
      authStatus: null,
      signInResult: null,
      error: null,
    });
  },

  signIn: async () => {
    set({ error: null, signInResult: null });
    try {
      const result = await copilotSignIn();
      set({ signInResult: result });
      if (
        result.status === "SignedIn" ||
        result.status === "AlreadySignedIn" ||
        result.status === "OK"
      ) {
        get().checkStatus().catch((e) => console.warn("[copilot] Failed to check auth status after sign-in:", e));
      } else if (result.userCode) {
        // Device flow started — poll checkStatus until signed in
        get().pollUntilSignedIn();
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  checkStatus: async () => {
    try {
      const status = await copilotCheckStatus();
      set({ authStatus: status });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  pollUntilSignedIn: () => {
    get().stopPolling();
    let attempts = 0;
    const maxAttempts = 60; // ~5 minutes at 5s intervals

    pollTimer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        set({ error: "Sign-in verification timed out. Please try again.", signInResult: null });
        get().stopPolling();
        return;
      }

      try {
        const status = await copilotCheckStatus();
        set({ authStatus: status });

        const statusObj = status as Record<string, unknown> | null;
        if (
          statusObj &&
          typeof statusObj === "object" &&
          "user" in statusObj &&
          statusObj.user
        ) {
          // Successfully signed in
          set({ signInResult: null });
          get().stopPolling();
        }
      } catch (e) {
        console.warn("[copilot] Polling check-status failed:", e);
      }
    }, 5000);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
}));
