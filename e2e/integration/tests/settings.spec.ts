import { test, expect } from "../helpers/bridge";

test.describe("Settings Persistence (Real Backend)", () => {
  let originalSettings: Record<string, unknown>;

  test.afterAll(async ({ bridge }) => {
    // Restore original settings
    if (originalSettings) {
      await bridge
        .invoke("update_app_settings", { settings: originalSettings })
        .catch(() => {});
    }
  });

  test("get_app_settings returns current settings", async ({ bridge }) => {
    const settings = (await bridge.invoke(
      "get_app_settings",
    )) as Record<string, unknown>;

    expect(settings).toBeTruthy();
    expect(settings.theme).toBeTruthy();
    expect(settings.agentType).toBeTruthy();

    originalSettings = settings;
  });

  test("update_app_settings persists theme change", async ({ bridge }) => {
    // Change theme
    const newTheme =
      originalSettings.theme === "midnight" ? "blend" : "midnight";

    await bridge.invoke("update_app_settings", {
      settings: { ...originalSettings, theme: newTheme },
    });

    // Read back
    const updated = (await bridge.invoke(
      "get_app_settings",
    )) as Record<string, unknown>;
    expect(updated.theme).toBe(newTheme);

    // Restore
    await bridge.invoke("update_app_settings", {
      settings: originalSettings,
    });

    // Verify restore
    const restored = (await bridge.invoke(
      "get_app_settings",
    )) as Record<string, unknown>;
    expect(restored.theme).toBe(originalSettings.theme);
  });
});
