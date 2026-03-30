import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Settings & Config (Real Backend)", () => {
  let repoId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<Record<string, unknown>>;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing ? (existing.id as string) : ((await bridge.invoke("add_repository", { path: FURY_PATH })) as Record<string, unknown>).id as string;
  });

  test("get_repo_settings returns valid settings object", async ({ bridge }) => {
    const settings = (await bridge.invoke("get_repo_settings", { repoId })) as Record<string, unknown>;

    expect(settings).toBeTruthy();
    // Settings should have expected shape
    expect(typeof settings.runScriptMode).toBe("string");
    expect(typeof settings.envVars).toBe("object");
  });

  test("update_repo_settings persists changes", async ({ bridge }) => {
    // Get original
    const original = (await bridge.invoke("get_repo_settings", { repoId })) as Record<string, unknown>;

    // Update
    await bridge.invoke("update_repo_settings", {
      repoId,
      settings: { ...original, runScriptMode: "concurrent" },
    });

    // Verify
    const updated = (await bridge.invoke("get_repo_settings", { repoId })) as Record<string, unknown>;
    expect(updated.runScriptMode).toBe("concurrent");

    // Restore
    await bridge.invoke("update_repo_settings", {
      repoId,
      settings: original,
    });
  });

  test("detect_test_framework returns framework config", async ({ bridge }) => {
    const config = (await bridge.invoke("detect_test_framework", { repoId })) as Record<string, unknown>;

    expect(config).toBeTruthy();
    // Fury uses vitest, so framework should be detected
    expect(config.framework).toBe("vitest");
    expect(config.testCommand).toBeTruthy();
  });

  test("get_app_settings has expected shape", async ({ bridge }) => {
    const settings = (await bridge.invoke("get_app_settings")) as Record<string, unknown>;
    expect(settings.theme).toBeTruthy();
    expect(settings.agentType).toBeTruthy();
    expect(typeof settings.experimental).toBe("object");
  });
});
