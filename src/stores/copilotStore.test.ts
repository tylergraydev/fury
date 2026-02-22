import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/copilot", () => ({
  startCopilot: vi.fn(),
  stopCopilot: vi.fn(),
  copilotSignIn: vi.fn(),
  copilotCheckStatus: vi.fn(),
  registerCopilotProvider: vi.fn(),
  disposeCopilotProvider: vi.fn(),
}));

import { useCopilotStore } from "./copilotStore";
import {
  startCopilot,
  stopCopilot,
  copilotSignIn,
  copilotCheckStatus,
  registerCopilotProvider,
  disposeCopilotProvider,
} from "../lib/copilot";

beforeEach(() => {
  useCopilotStore.setState(
    {
      connectionStatus: "disconnected",
      authStatus: null,
      signInResult: null,
      error: null,
    },
  );
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("copilotStore - initialize", () => {
  it("transitions disconnected -> connecting -> connected", async () => {
    vi.mocked(startCopilot).mockResolvedValue(undefined);
    vi.mocked(copilotCheckStatus).mockResolvedValue(null);

    await useCopilotStore.getState().initialize("file:///root");

    expect(startCopilot).toHaveBeenCalledWith("file:///root");
    expect(registerCopilotProvider).toHaveBeenCalled();
    expect(useCopilotStore.getState().connectionStatus).toBe("connected");
  });

  it("skips if already connected", async () => {
    useCopilotStore.setState({ connectionStatus: "connected" });
    await useCopilotStore.getState().initialize("file:///root");
    expect(startCopilot).not.toHaveBeenCalled();
  });

  it("skips if already connecting", async () => {
    useCopilotStore.setState({ connectionStatus: "connecting" });
    await useCopilotStore.getState().initialize("file:///root");
    expect(startCopilot).not.toHaveBeenCalled();
  });

  it("sets error state on failure", async () => {
    vi.mocked(startCopilot).mockRejectedValue(new Error("fail"));
    await useCopilotStore.getState().initialize("file:///root");
    expect(useCopilotStore.getState().connectionStatus).toBe("error");
    expect(useCopilotStore.getState().error).toBe("Error: fail");
  });

  it("auto-checks auth status after connecting (checkStatus failure is swallowed)", async () => {
    vi.mocked(startCopilot).mockResolvedValue(undefined);
    vi.mocked(copilotCheckStatus).mockRejectedValue(new Error("check fail"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await useCopilotStore.getState().initialize("file:///root");

    expect(useCopilotStore.getState().connectionStatus).toBe("connected");
    // The checkStatus failure is caught and warned, not thrown
  });

  it("catches and warns when checkStatus rejects after initialize (line 50 catch callback)", async () => {
    vi.mocked(startCopilot).mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Make checkStatus itself reject (not just copilotCheckStatus)
    // by temporarily replacing it with a rejecting function
    const store = useCopilotStore;
    const originalCheckStatus = store.getState().checkStatus;
    store.setState({
      checkStatus: async () => { throw new Error("checkStatus boom"); },
    } as any);

    await store.getState().initialize("file:///root");

    // Wait for the .catch() callback to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(warnSpy).toHaveBeenCalledWith(
      "[copilot] Failed to check auth status:",
      expect.any(Error),
    );

    // Restore
    store.setState({ checkStatus: originalCheckStatus } as any);
  });

});

describe("copilotStore - shutdown", () => {
  it("disposes provider, stops copilot, resets state", async () => {
    vi.mocked(stopCopilot).mockResolvedValue(undefined);
    useCopilotStore.setState({ connectionStatus: "connected" });

    await useCopilotStore.getState().shutdown();

    expect(disposeCopilotProvider).toHaveBeenCalled();
    expect(stopCopilot).toHaveBeenCalled();
    expect(useCopilotStore.getState().connectionStatus).toBe("disconnected");
    expect(useCopilotStore.getState().authStatus).toBeNull();
    expect(useCopilotStore.getState().signInResult).toBeNull();
  });

  it("swallows stopCopilot failure and still resets state", async () => {
    vi.mocked(stopCopilot).mockRejectedValue(new Error("stop fail"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useCopilotStore.setState({ connectionStatus: "connected" });

    await useCopilotStore.getState().shutdown();

    expect(useCopilotStore.getState().connectionStatus).toBe("disconnected");
    expect(useCopilotStore.getState().authStatus).toBeNull();
  });
});

describe("copilotStore - signIn", () => {
  it("stores result for SignedIn status", async () => {
    const result = { status: "SignedIn" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);
    vi.mocked(copilotCheckStatus).mockResolvedValue(null);

    await useCopilotStore.getState().signIn();

    expect(useCopilotStore.getState().signInResult).toEqual(result);
  });

  it("stores result for AlreadySignedIn status", async () => {
    const result = { status: "AlreadySignedIn" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);
    vi.mocked(copilotCheckStatus).mockResolvedValue(null);

    await useCopilotStore.getState().signIn();

    expect(useCopilotStore.getState().signInResult).toEqual(result);
  });

  it("calls checkStatus after OK sign-in result", async () => {
    const result = { status: "OK" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);
    vi.mocked(copilotCheckStatus).mockResolvedValue({ user: "testuser" } as any);

    await useCopilotStore.getState().signIn();

    expect(useCopilotStore.getState().signInResult).toEqual(result);
    // checkStatus should have been called
    expect(copilotCheckStatus).toHaveBeenCalled();
  });

  it("swallows checkStatus failure after signIn", async () => {
    const result = { status: "SignedIn" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);
    vi.mocked(copilotCheckStatus).mockRejectedValue(new Error("check fail"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await useCopilotStore.getState().signIn();

    expect(useCopilotStore.getState().signInResult).toEqual(result);
  });

  it("catches and warns when checkStatus rejects after signIn (line 82 catch callback)", async () => {
    const result = { status: "SignedIn" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Make checkStatus itself reject so the .catch() callback on line 82 fires
    const store = useCopilotStore;
    const originalCheckStatus = store.getState().checkStatus;
    store.setState({
      checkStatus: async () => { throw new Error("checkStatus boom"); },
    } as any);

    await store.getState().signIn();

    // Wait for the .catch() callback to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(warnSpy).toHaveBeenCalledWith(
      "[copilot] Failed to check auth status after sign-in:",
      expect.any(Error),
    );

    // Restore
    store.setState({ checkStatus: originalCheckStatus } as any);
  });

  it("does not poll when result has no userCode and is not a success status", async () => {
    const result = { status: "NotSignedIn" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);

    await useCopilotStore.getState().signIn();

    // Should not call checkStatus (no success status) and not start polling (no userCode)
    expect(copilotCheckStatus).not.toHaveBeenCalled();
    expect(useCopilotStore.getState().signInResult).toEqual(result);
  });

  it("starts polling for device flow (userCode present)", async () => {
    const result = { status: "DeviceFlow", userCode: "ABC123" };
    vi.mocked(copilotSignIn).mockResolvedValue(result as any);
    vi.mocked(copilotCheckStatus).mockResolvedValue(null);

    const pollSpy = vi.spyOn(useCopilotStore.getState(), "pollUntilSignedIn");

    await useCopilotStore.getState().signIn();

    expect(pollSpy).toHaveBeenCalled();
    useCopilotStore.getState().stopPolling();
  });

  it("sets error on failure", async () => {
    vi.mocked(copilotSignIn).mockRejectedValue(new Error("sign-in fail"));

    await useCopilotStore.getState().signIn();

    expect(useCopilotStore.getState().error).toBe("Error: sign-in fail");
  });
});

describe("copilotStore - checkStatus", () => {
  it("stores auth status", async () => {
    const status = { user: "testuser" };
    vi.mocked(copilotCheckStatus).mockResolvedValue(status);

    await useCopilotStore.getState().checkStatus();

    expect(useCopilotStore.getState().authStatus).toEqual(status);
  });

  it("sets error on failure", async () => {
    vi.mocked(copilotCheckStatus).mockRejectedValue(new Error("check fail"));

    await useCopilotStore.getState().checkStatus();

    expect(useCopilotStore.getState().error).toBe("Error: check fail");
  });
});

describe("copilotStore - pollUntilSignedIn", () => {
  it("polls every 5s and stops when user found", async () => {
    vi.useFakeTimers();
    vi.mocked(copilotCheckStatus)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: "testuser" } as any);

    useCopilotStore.getState().pollUntilSignedIn();

    // First tick: returns null (no user), keeps polling
    await vi.advanceTimersByTimeAsync(5000);
    expect(copilotCheckStatus).toHaveBeenCalledTimes(1);

    // Second tick: returns { user: "testuser" }, stops polling
    await vi.advanceTimersByTimeAsync(5000);
    expect(copilotCheckStatus).toHaveBeenCalledTimes(2);

    // Wait for async operations to settle
    await vi.runAllTimersAsync();

    expect(useCopilotStore.getState().signInResult).toBeNull();
    expect(useCopilotStore.getState().authStatus).toEqual({ user: "testuser" });

    vi.useRealTimers();
  });

  it("times out after maxAttempts and sets error", async () => {
    vi.useFakeTimers();
    // Always return null (no user) so it times out
    vi.mocked(copilotCheckStatus).mockResolvedValue(null);

    useCopilotStore.getState().pollUntilSignedIn();

    // Advance 61 intervals (5000ms each = 305000ms) to exceed 60 max attempts
    for (let i = 0; i < 61; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    expect(useCopilotStore.getState().error).toContain("timed out");
    expect(useCopilotStore.getState().signInResult).toBeNull();

    vi.useRealTimers();
  });

  it("keeps polling when status has no user property", async () => {
    vi.useFakeTimers();
    vi.mocked(copilotCheckStatus).mockResolvedValue({ status: "NotSignedIn" } as any);

    useCopilotStore.getState().pollUntilSignedIn();

    await vi.advanceTimersByTimeAsync(5000);
    expect(copilotCheckStatus).toHaveBeenCalledTimes(1);
    // Should still be polling since no user field
    expect(useCopilotStore.getState().authStatus).toEqual({ status: "NotSignedIn" });

    useCopilotStore.getState().stopPolling();
    vi.useRealTimers();
  });

  it("keeps polling when status returns a string (non-object)", async () => {
    vi.useFakeTimers();
    vi.mocked(copilotCheckStatus).mockResolvedValue("pending" as any);

    useCopilotStore.getState().pollUntilSignedIn();

    await vi.advanceTimersByTimeAsync(5000);
    expect(copilotCheckStatus).toHaveBeenCalledTimes(1);

    useCopilotStore.getState().stopPolling();
    vi.useRealTimers();
  });

  it("stopPolling is a no-op when no timer is running", () => {
    useCopilotStore.getState().stopPolling();
    // Should not throw
  });

  it("swallows checkStatus failure during polling", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(copilotCheckStatus).mockRejectedValueOnce(new Error("poll fail"));

    useCopilotStore.getState().pollUntilSignedIn();

    await vi.advanceTimersByTimeAsync(5000);

    // Should not throw, error is swallowed
    expect(copilotCheckStatus).toHaveBeenCalledTimes(1);
    useCopilotStore.getState().stopPolling();

    vi.useRealTimers();
  });
});
