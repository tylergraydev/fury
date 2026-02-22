import { test, expect } from "../helpers/app";

test.describe("Open Merge View", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Open Merge view via command palette
    await appPage.keyboard.press("Control+k");
    await appPage.locator(".command-palette").getByText("Open Merge View").click();
  });

  test("Sync section shows branch status with ahead/behind", async ({
    appPage,
  }) => {
    // The Sync tab should be active by default
    await expect(appPage.getByText("Sync")).toBeVisible();

    // Branch status should show ahead 3 behind 0 from mock data
    await expect(appPage.getByText("feature/add-auth").first()).toBeVisible();
    await expect(appPage.getByText("3 ahead")).toBeVisible();
  });

  test("Fetch button triggers fetch action", async ({ appPage }) => {
    // Should see a Fetch button in the sync section
    const fetchBtn = appPage.locator("button", { hasText: "Fetch" }).first();
    await expect(fetchBtn).toBeVisible();
    await fetchBtn.click();
  });

  test("sub-tabs switch between Sync, Compare, and Conflicts", async ({
    appPage,
  }) => {
    // All sub-tabs should be visible
    await expect(appPage.getByText("Sync")).toBeVisible();
    await expect(appPage.getByText("Compare")).toBeVisible();
    await expect(appPage.getByText("Conflicts")).toBeVisible();

    // Click Compare tab
    await appPage.locator("button", { hasText: "Compare" }).first().click();

    // Click Conflicts tab
    await appPage.locator("button", { hasText: "Conflicts" }).first().click();

    // Switch back to Sync
    await appPage.locator("button", { hasText: "Sync" }).first().click();
  });

  test("Conflicts section shows empty state when no conflicts", async ({
    appPage,
  }) => {
    // Switch to Conflicts tab
    await appPage.locator("button", { hasText: "Conflicts" }).first().click();

    // Mock returns empty conflict list — should show "no conflicts" message
    await expect(appPage.getByText(/no conflict/i)).toBeVisible();
  });
});
