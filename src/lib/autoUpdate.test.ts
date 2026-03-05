import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVersion } from "@tauri-apps/api/app";

const mockCheck = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: any[]) => mockCheck(...args),
}));

import { checkForAppUpdate, getAppVersion } from "./autoUpdate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkForAppUpdate", () => {
  it("returns update when available", async () => {
    const fakeUpdate = { version: "2.0.0", downloadAndInstall: vi.fn() };
    mockCheck.mockResolvedValue(fakeUpdate);
    const result = await checkForAppUpdate();
    expect(result).toBe(fakeUpdate);
  });

  it("returns null when no update", async () => {
    mockCheck.mockResolvedValue(null);
    const result = await checkForAppUpdate();
    expect(result).toBeNull();
  });

  it("returns null when check returns undefined", async () => {
    mockCheck.mockResolvedValue(undefined);
    const result = await checkForAppUpdate();
    expect(result).toBeNull();
  });

  it("propagates errors", async () => {
    mockCheck.mockRejectedValue(new Error("offline"));
    await expect(checkForAppUpdate()).rejects.toThrow("offline");
  });
});

describe("getAppVersion", () => {
  it("returns version string on success", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.5.1");
    expect(await getAppVersion()).toBe("1.5.1");
  });

  it("returns 'unknown' on failure", async () => {
    vi.mocked(getVersion).mockRejectedValue(new Error("no version"));
    expect(await getAppVersion()).toBe("unknown");
  });
});
