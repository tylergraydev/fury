import { test, expect } from "../helpers/app";

// Playwright's Desktop Chrome uses a non-Mac user agent,
// so the app's keybindings use Ctrl instead of Meta.
const MOD = "Control";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("Ctrl+K opens command palette", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+k`);
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).toBeVisible();

    // Close with Escape
    await appPage.keyboard.press("Escape");
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).not.toBeVisible();
  });

  test("Ctrl+B toggles right sidebar visibility", async ({ appPage }) => {
    // Right sidebar should be visible by default (file tree)
    await expect(appPage.getByText("All files")).toBeVisible();

    // Toggle sidebar off
    await appPage.keyboard.press(`${MOD}+b`);
    await expect(appPage.getByText("All files")).not.toBeVisible();

    // Toggle sidebar back on
    await appPage.keyboard.press(`${MOD}+b`);
    await expect(appPage.getByText("All files")).toBeVisible();
  });

  test("Ctrl+, opens settings", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+,`);

    // Settings panel should appear with tabs
    await expect(appPage.getByText("Appearance")).toBeVisible();
    await expect(appPage.getByText("Provider")).toBeVisible();
  });

  test("Ctrl+1 switches right sidebar to Files tab", async ({ appPage }) => {
    // Switch to Changes tab first
    await appPage.keyboard.press(`${MOD}+2`);
    await expect(appPage.getByText("Changes").first()).toBeVisible();

    // Switch back to Files with Ctrl+1
    await appPage.keyboard.press(`${MOD}+1`);
    await expect(appPage.getByText("All files")).toBeVisible();
  });

  test("Ctrl+2 switches right sidebar to Changes tab", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+2`);

    // Changes tab shows diff data from mock
    await expect(appPage.getByText("3 files")).toBeVisible();
    await expect(appPage.getByText("+65")).toBeVisible();
  });

  test("Ctrl+4 toggles notifications panel", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+4`);

    // Notification panel should appear
    await expect(appPage.getByTestId("notification-panel")).toBeVisible();
    await expect(appPage.getByText("No notifications")).toBeVisible();

    // Close with Escape
    await appPage.keyboard.press("Escape");
    await expect(
      appPage.getByTestId("notification-panel"),
    ).not.toBeVisible();
  });

  test("Escape closes open dialogs", async ({ appPage }) => {
    // Open command palette
    await appPage.keyboard.press(`${MOD}+k`);
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).toBeVisible();

    // Escape should close it
    await appPage.keyboard.press("Escape");
    await expect(
      appPage.getByPlaceholder("Type a command..."),
    ).not.toBeVisible();
  });
});
