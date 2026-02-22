import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getAppSettings: vi.fn(),
  updateAppSettings: vi.fn(),
  listMcpServers: vi.fn(),
  addMcpServer: vi.fn(),
  removeMcpServer: vi.fn(),
  detectCursorConfig: vi.fn(),
  importCursorConfig: vi.fn(),
}));

import { useSettingsStore } from "./settingsStore";
import {
  getAppSettings,
  updateAppSettings,
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  detectCursorConfig,
  importCursorConfig,
} from "../lib/tauri";

beforeEach(() => {
  useSettingsStore.setState(
    {
      appSettings: null,
      mcpServers: [],
      cursorDetected: null,
      loading: false,
      error: null,
    },
  );
  vi.clearAllMocks();
});

describe("settingsStore - loadSettings", () => {
  it("loads app settings", async () => {
    const settings = { theme: "blend", apiKey: "key" };
    vi.mocked(getAppSettings).mockResolvedValue(settings as any);
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().appSettings).toEqual(settings);
    expect(useSettingsStore.getState().loading).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(getAppSettings).mockRejectedValue(new Error("fail"));
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().error).toBe("Error: fail");
  });
});

describe("settingsStore - saveSettings", () => {
  it("saves settings and updates state", async () => {
    const settings = { theme: "midnight" };
    vi.mocked(updateAppSettings).mockResolvedValue(undefined);
    await useSettingsStore.getState().saveSettings(settings as any);
    expect(updateAppSettings).toHaveBeenCalledWith(settings);
    expect(useSettingsStore.getState().appSettings).toEqual(settings);
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(updateAppSettings).mockRejectedValue(new Error("save fail"));
    await expect(
      useSettingsStore.getState().saveSettings({} as any),
    ).rejects.toThrow("save fail");
    expect(useSettingsStore.getState().error).toBe("Error: save fail");
  });
});

describe("settingsStore - MCP servers", () => {
  it("loadMcpServers loads the server list", async () => {
    const servers = [{ name: "server1" }];
    vi.mocked(listMcpServers).mockResolvedValue(servers as any);
    await useSettingsStore.getState().loadMcpServers();
    expect(useSettingsStore.getState().mcpServers).toEqual(servers);
  });

  it("addMcpServer calls command then reloads", async () => {
    vi.mocked(addMcpServer).mockResolvedValue(undefined);
    vi.mocked(listMcpServers).mockResolvedValue([]);
    await useSettingsStore.getState().addMcpServer({ name: "s" } as any);
    expect(addMcpServer).toHaveBeenCalledWith({ name: "s" });
    expect(listMcpServers).toHaveBeenCalled();
  });

  it("removeMcpServer calls command then reloads", async () => {
    vi.mocked(removeMcpServer).mockResolvedValue(undefined);
    vi.mocked(listMcpServers).mockResolvedValue([]);
    await useSettingsStore.getState().removeMcpServer({ name: "s" } as any);
    expect(removeMcpServer).toHaveBeenCalledWith({ name: "s" });
    expect(listMcpServers).toHaveBeenCalled();
  });
});

describe("settingsStore - Cursor config", () => {
  it("checkCursorConfig sets cursorDetected", async () => {
    vi.mocked(detectCursorConfig).mockResolvedValue(true);
    await useSettingsStore.getState().checkCursorConfig();
    expect(useSettingsStore.getState().cursorDetected).toBe(true);
  });

  it("checkCursorConfig sets false on failure", async () => {
    vi.mocked(detectCursorConfig).mockRejectedValue(new Error("no"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await useSettingsStore.getState().checkCursorConfig();
    expect(useSettingsStore.getState().cursorDetected).toBe(false);
  });

  it("importCursor calls command and reloads servers", async () => {
    const result = { imported: 2, skipped: 0 };
    vi.mocked(importCursorConfig).mockResolvedValue(result as any);
    vi.mocked(listMcpServers).mockResolvedValue([]);
    const res = await useSettingsStore.getState().importCursor();
    expect(res).toEqual(result);
    expect(listMcpServers).toHaveBeenCalled();
  });
});
