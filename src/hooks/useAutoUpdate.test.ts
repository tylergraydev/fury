import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../lib/tauri", () => ({
  checkForUpdate: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import { useAutoUpdate } from "./useAutoUpdate";
import { checkForUpdate } from "../lib/tauri";
import { useToastStore } from "../stores/toastStore";
import { relaunch } from "@tauri-apps/plugin-process";

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoUpdate", () => {
  it("shows update toast when update available", async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);
    vi.mocked(checkForUpdate).mockResolvedValue({
      version: "2.0.0",
      downloadAndInstall: mockDownloadAndInstall,
    } as any);

    renderHook(() => useAutoUpdate());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      // Flush microtasks
      await Promise.resolve();
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBeGreaterThanOrEqual(1);
    expect(toasts[0].message).toContain("v2.0.0");
    expect(toasts[0].type).toBe("info");
  });

  it("does not show toast when no update available", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue(null as any);

    renderHook(() => useAutoUpdate());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("silently catches checkForUpdate errors", async () => {
    vi.mocked(checkForUpdate).mockRejectedValue(new Error("network error"));

    renderHook(() => useAutoUpdate());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("clears timeout on unmount", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      version: "2.0.0",
      downloadAndInstall: vi.fn(),
    } as any);

    const { unmount } = renderHook(() => useAutoUpdate());
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("action callback calls downloadAndInstall then relaunch", async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);
    vi.mocked(checkForUpdate).mockResolvedValue({
      version: "2.0.0",
      downloadAndInstall: mockDownloadAndInstall,
    } as any);
    vi.mocked(relaunch).mockResolvedValue(undefined);

    renderHook(() => useAutoUpdate());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    const toast = useToastStore.getState().toasts[0];
    expect(toast.action).toBeDefined();

    await act(async () => {
      await toast.action!.onClick();
    });

    expect(mockDownloadAndInstall).toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalled();
  });

  it("action callback shows error toast on install failure", async () => {
    const mockDownloadAndInstall = vi.fn().mockRejectedValue(new Error("install failed"));
    vi.mocked(checkForUpdate).mockResolvedValue({
      version: "2.0.0",
      downloadAndInstall: mockDownloadAndInstall,
    } as any);

    renderHook(() => useAutoUpdate());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    const toast = useToastStore.getState().toasts[0];
    await act(async () => {
      await toast.action!.onClick();
    });

    const toasts = useToastStore.getState().toasts;
    const errorToast = toasts.find((t) => t.type === "error");
    expect(errorToast).toBeDefined();
    expect(errorToast!.message).toContain("install failed");
  });
});
