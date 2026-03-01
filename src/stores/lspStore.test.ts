import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getLspCatalog: vi.fn(),
  listLspPlugins: vi.fn(),
  installLspPlugin: vi.fn(),
  uninstallLspPlugin: vi.fn(),
}));

import { useLspStore } from "./lspStore";
import {
  getLspCatalog,
  listLspPlugins,
  installLspPlugin,
  uninstallLspPlugin,
} from "../lib/tauri";
import type { LspCatalogEntry, LspPlugin } from "../lib/tauri";

function makeCatalogEntry(
  overrides: Partial<LspCatalogEntry> = {},
): LspCatalogEntry {
  return {
    pluginName: "typescript-lsp",
    language: "TypeScript",
    binaryName: "typescript-language-server",
    extensions: [".ts", ".tsx"],
    installHint: "npm install -g typescript-language-server",
    ...overrides,
  };
}

function makePlugin(overrides: Partial<LspPlugin> = {}): LspPlugin {
  return {
    name: "typescript-lsp",
    scope: "user",
    enabled: true,
    binaryFound: true,
    binaryName: "typescript-language-server",
    installHint: "npm install -g typescript-language-server",
    ...overrides,
  };
}

beforeEach(() => {
  useLspStore.setState({
    catalog: [],
    installedPlugins: [],
    loading: false,
    error: null,
    installingPlugins: [],
  });
  vi.clearAllMocks();
});

describe("lspStore - loadCatalog", () => {
  it("loads catalog entries", async () => {
    const entries = [makeCatalogEntry()];
    vi.mocked(getLspCatalog).mockResolvedValue(entries);

    await useLspStore.getState().loadCatalog();

    expect(useLspStore.getState().catalog).toEqual(entries);
    expect(getLspCatalog).toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    vi.mocked(getLspCatalog).mockRejectedValue(new Error("network error"));

    await useLspStore.getState().loadCatalog();

    expect(useLspStore.getState().error).toBe("Error: network error");
  });
});

describe("lspStore - loadInstalledPlugins", () => {
  it("loads installed plugins and sets loading state", async () => {
    const plugins = [makePlugin()];
    vi.mocked(listLspPlugins).mockResolvedValue(plugins);

    await useLspStore.getState().loadInstalledPlugins();

    expect(useLspStore.getState().installedPlugins).toEqual(plugins);
    expect(useLspStore.getState().loading).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(listLspPlugins).mockRejectedValue(new Error("cli error"));

    await useLspStore.getState().loadInstalledPlugins();

    expect(useLspStore.getState().error).toBe("Error: cli error");
    expect(useLspStore.getState().loading).toBe(false);
  });
});

describe("lspStore - installPlugin", () => {
  it("installs a plugin and reloads the list", async () => {
    vi.mocked(installLspPlugin).mockResolvedValue(undefined);
    vi.mocked(listLspPlugins).mockResolvedValue([makePlugin()]);

    await useLspStore.getState().installPlugin("typescript-lsp", "user");

    expect(installLspPlugin).toHaveBeenCalledWith({
      pluginName: "typescript-lsp",
      scope: "user",
    });
    expect(listLspPlugins).toHaveBeenCalled();
    expect(useLspStore.getState().installingPlugins).not.toContain(
      "typescript-lsp",
    );
  });

  it("tracks installing state during install", async () => {
    let resolveInstall: () => void = () => {};
    vi.mocked(installLspPlugin).mockReturnValue(
      new Promise((resolve) => {
        resolveInstall = () => resolve(undefined);
      }),
    );
    vi.mocked(listLspPlugins).mockResolvedValue([]);

    const promise = useLspStore
      .getState()
      .installPlugin("typescript-lsp", "user");

    expect(useLspStore.getState().installingPlugins).toContain(
      "typescript-lsp",
    );

    resolveInstall();
    await promise;

    expect(useLspStore.getState().installingPlugins).not.toContain(
      "typescript-lsp",
    );
  });

  it("sets error and clears installing state on failure", async () => {
    vi.mocked(installLspPlugin).mockRejectedValue(
      new Error("install failed"),
    );

    await expect(
      useLspStore.getState().installPlugin("typescript-lsp", "user"),
    ).rejects.toThrow("install failed");

    expect(useLspStore.getState().error).toBe("Error: install failed");
    expect(useLspStore.getState().installingPlugins).not.toContain(
      "typescript-lsp",
    );
  });
});

describe("lspStore - uninstallPlugin", () => {
  it("uninstalls a plugin and reloads the list", async () => {
    vi.mocked(uninstallLspPlugin).mockResolvedValue(undefined);
    vi.mocked(listLspPlugins).mockResolvedValue([]);

    await useLspStore.getState().uninstallPlugin("typescript-lsp", "user");

    expect(uninstallLspPlugin).toHaveBeenCalledWith({
      pluginName: "typescript-lsp",
      scope: "user",
    });
    expect(listLspPlugins).toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    vi.mocked(uninstallLspPlugin).mockRejectedValue(
      new Error("uninstall failed"),
    );

    await expect(
      useLspStore.getState().uninstallPlugin("typescript-lsp", "user"),
    ).rejects.toThrow("uninstall failed");

    expect(useLspStore.getState().error).toBe("Error: uninstall failed");
  });
});
