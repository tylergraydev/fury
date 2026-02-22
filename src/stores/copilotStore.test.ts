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

    await vi.advanceTimersByTimeAsync(5000);
    expect(copilotCheckStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(copilotCheckStatus).toHaveBeenCalledTimes(2);
    expect(useCopilotStore.getState().signInResult).toBeNull();

    vi.useRealTimers();
  });
});
