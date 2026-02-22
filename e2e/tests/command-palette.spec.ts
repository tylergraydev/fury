import { test, expect } from "../helpers/app";

// Playwright's Desktop Chrome uses a non-Mac user agent,
// so the app's keybindings use Ctrl instead of Meta.
const MOD = "Control";

test.describe("Command Palette", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to workspace so palette has full options
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("opens with keyboard shortcut and shows commands", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+k`);

    // Palette input should be visible
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).toBeVisible();

    // Should show sidebar commands (inside the palette dialog)
    const palette = appPage.locator(".command-palette");
    await expect(palette.getByText("All Files")).toBeVisible();
    await expect(palette.getByText("Checks / PR")).toBeVisible();

    // Should show view commands
    await expect(appPage.getByText("Switch to Chat")).toBeVisible();
    await expect(appPage.getByText("Open Settings")).toBeVisible();

    // Should show action commands
    await expect(appPage.getByText("Focus Terminal")).toBeVisible();
    await expect(appPage.getByText("New Session")).toBeVisible();
  });

  test("searching filters commands", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+k`);

    const input = appPage.getByPlaceholder("Type a command...");
    await input.fill("settings");

    await expect(appPage.getByText("Open Settings")).toBeVisible();
    // Unrelated commands should be filtered out
    await expect(appPage.getByText("Focus Terminal")).not.toBeVisible();
  });

  test("selecting a command executes the action", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+k`);

    // Click "Open Settings"
    await appPage.getByText("Open Settings").click();

    // Settings overlay should appear
    await expect(appPage.getByText("Appearance")).toBeVisible();
  });

  test("closes with Escape", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+k`);
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).toBeVisible();

    await appPage.keyboard.press("Escape");
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).not.toBeVisible();
  });

  test("shows workspace switching options", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+k`);

    // Should show "Switch Workspace" group with other workspaces
    await expect(appPage.getByText("Switch Workspace")).toBeVisible();
    // Other workspaces (not the active one) should appear
    await expect(
      appPage.locator("[cmdk-item]", { hasText: "redesign-sidebar" }),
    ).toBeVisible();
  });
});
