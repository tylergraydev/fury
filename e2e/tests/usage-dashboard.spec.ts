import { test, expect } from "../helpers/app";

const MOD = "Control";

test.describe("Usage Dashboard", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
    await appPage.keyboard.press(`${MOD}+Shift+u`);
  });

  test("displays summary cards with values from mock data", async ({
    appPage,
  }) => {
    // Mock returns 3 data points totaling $0.92, ~37000 tokens, 10 turns
    await expect(appPage.getByText("Total Cost")).toBeVisible();
    await expect(appPage.getByText("Total Tokens")).toBeVisible();
    await expect(appPage.getByText("Total Turns")).toBeVisible();

    // Cost should show $0.92 (sum of 0.45 + 0.32 + 0.15)
    await expect(appPage.getByText(/\$0\.92/)).toBeVisible();
  });

  test("shows per-workspace breakdown table", async ({ appPage }) => {
    // Workspace names should appear in the breakdown
    await expect(appPage.getByText("add-auth").first()).toBeVisible();
    await expect(
      appPage.getByText("redesign-sidebar").first(),
    ).toBeVisible();
    await expect(
      appPage.getByText("fix-pagination").first(),
    ).toBeVisible();
  });

  test("switching time period triggers data reload", async ({ appPage }) => {
    // Intercept IPC calls
    await appPage.evaluate(() => {
      (window as any).__USAGE_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "get_usage_data") {
          (window as any).__USAGE_CALLS__.push(args);
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    // Click "Today"
    await appPage.getByText("Today", { exact: true }).first().click();

    const calls = await appPage.evaluate(
      () => (window as any).__USAGE_CALLS__,
    );
    expect(calls.length).toBeGreaterThan(0);
    // "Today" should pass a since parameter (today's midnight)
    expect(calls[calls.length - 1].since).toBeTruthy();
  });

  test("All time period has no since filter", async ({ appPage }) => {
    await appPage.evaluate(() => {
      (window as any).__USAGE_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "get_usage_data") {
          (window as any).__USAGE_CALLS__.push(args);
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await appPage.getByText("All time", { exact: true }).click();

    const calls = await appPage.evaluate(
      () => (window as any).__USAGE_CALLS__,
    );
    expect(calls.length).toBeGreaterThan(0);
    // "All time" should NOT pass a since parameter
    expect(calls[calls.length - 1].since).toBeUndefined();
  });
});
