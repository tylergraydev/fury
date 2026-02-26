import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getVersion } from "@tauri-apps/api/app";

const mockCheck = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: any[]) => mockCheck(...args),
}));

import { useAutoUpdate, getAppVersion } from "./autoUpdate";

// Capture the 5-second timer callback instead of using fake timers.
// Dynamic import() inside setTimeout doesn't resolve reliably under
// Vitest fake timers when running the full test suite.
const _realSetTimeout = globalThis.setTimeout;
let capturedCb: (() => Promise<void>) | null = null;

beforeEach(() => {
  capturedCb = null;
  vi.clearAllMocks();
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: any,
    ms?: number,
  ) => {
    if (ms === 5_000) {
      capturedCb = fn;
      return 999 as unknown as ReturnType<typeof setTimeout>;
    }
    return _realSetTimeout(fn, ms ?? 0);
  }) as typeof setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fire the captured timer callback inside act() so React processes updates */
async function fireTimer() {
  await act(async () => {
    await capturedCb?.();
  });
}

describe("useAutoUpdate", () => {
  it("has correct initial state", () => {
    const { result, unmount } = renderHook(() => useAutoUpdate());
    expect(result.current.update).toBeNull();
    expect(result.current.checking).toBe(false);
    expect(result.current.installing).toBe(false);
    expect(result.current.installed).toBe(false);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("does not call check immediately", () => {
    const { unmount } = renderHook(() => useAutoUpdate());
    expect(mockCheck).not.toHaveBeenCalled();
    unmount();
  });

  it("sets update when check finds an update", async () => {
    const fakeUpdate = { downloadAndInstall: vi.fn() };
    mockCheck.mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBe(fakeUpdate);
    expect(result.current.checking).toBe(false);
    unmount();
  });

  it("sets update to null when check returns null", async () => {
    mockCheck.mockResolvedValue(null);
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBeNull();
    expect(result.current.checking).toBe(false);
    unmount();
  });

  it("sets update to null when check returns undefined", async () => {
    mockCheck.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBeNull();
    expect(result.current.checking).toBe(false);
    unmount();
  });

  it("silently fails when check rejects", async () => {
    mockCheck.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.checking).toBe(false);
    unmount();
  });

  it("cleans up timer on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() => useAutoUpdate());
    unmount();
    expect(clearSpy).toHaveBeenCalledWith(999);
  });

  it("install calls downloadAndInstall and sets installed", async () => {
    const fakeUpdate = {
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    };
    mockCheck.mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBeTruthy();
    await act(async () => {
      await result.current.install();
    });
    expect(fakeUpdate.downloadAndInstall).toHaveBeenCalled();
    expect(result.current.installed).toBe(true);
    expect(result.current.installing).toBe(false);
    unmount();
  });

  it("install sets error when downloadAndInstall fails", async () => {
    const fakeUpdate = {
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("disk full")),
    };
    mockCheck.mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBeTruthy();
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.error).toBe("Install failed: Error: disk full");
    expect(result.current.installing).toBe(false);
    unmount();
  });

  it("install is a no-op when no update", async () => {
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.installing).toBe(false);
    unmount();
  });

  it("dismiss clears the update", async () => {
    const fakeUpdate = { downloadAndInstall: vi.fn() };
    mockCheck.mockResolvedValue(fakeUpdate);
    const { result, unmount } = renderHook(() => useAutoUpdate());
    await fireTimer();
    expect(result.current.update).toBe(fakeUpdate);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.update).toBeNull();
    unmount();
  });
});

describe("getAppVersion", () => {
  it("returns version string on success", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.5.1");
    const version = await getAppVersion();
    expect(version).toBe("1.5.1");
  });

  it("returns 'unknown' on failure", async () => {
    vi.mocked(getVersion).mockRejectedValue(new Error("no version"));
    const version = await getAppVersion();
    expect(version).toBe("unknown");
  });
});
