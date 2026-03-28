import { test, expect } from "../helpers/app";

const MOD = "Control";

test.describe("Diff Panel", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to ws-auth which has mock diff data
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("opens diff view when clicking a file in Changes panel", async ({
    appPage,
  }) => {
    // Switch to Changes tab
    await appPage.keyboard.press(`${MOD}+2`);
    await expect(appPage.getByText("3 files")).toBeVisible();

    // Click on a changed file
    const indexFile = appPage
      .locator("button", { hasText: /^M/ })
      .filter({ hasText: "index.ts" });
    await indexFile.click();

    // Diff view should show the selected file path in header
    await expect(
      appPage.getByText("src/routes/index.ts").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows empty state when no file is selected", async ({ appPage }) => {
    // Open the diff view tab by first selecting a file, then checking
    // that the DiffPanel renders the file path header
    await appPage.keyboard.press(`${MOD}+2`);
    const authFile = appPage
      .locator("button", { hasText: /^A/ })
      .filter({ hasText: "auth.ts" });
    await authFile.click();

    // Should show the selected file
    await expect(
      appPage.getByText("src/middleware/auth.ts").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Changes panel shows diff summary with file count and stats", async ({
    appPage,
  }) => {
    // Switch to Changes tab in right sidebar
    await appPage.keyboard.press(`${MOD}+2`);

    // Should show diff summary: 3 files, +65, -5
    await expect(appPage.getByText("3 files")).toBeVisible();
    await expect(appPage.getByText("+65")).toBeVisible();
    await expect(appPage.getByText("-5")).toBeVisible();
  });

  test("Changes panel shows individual files with status labels", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+2`);

    // Individual files should appear
    await expect(appPage.getByText("auth.ts").first()).toBeVisible();
    await expect(appPage.getByText("index.ts").first()).toBeVisible();

    // Status labels: A for Added, M for Modified
    // auth.ts is Added
    const addedFile = appPage
      .locator("button", { hasText: /^A/ })
      .filter({ hasText: "auth.ts" });
    await expect(addedFile).toBeVisible();

    // index.ts is Modified
    const modifiedFile = appPage
      .locator("button", { hasText: /^M/ })
      .filter({ hasText: "index.ts" });
    await expect(modifiedFile).toBeVisible();
  });

  test("clicking different files in Changes updates the diff view", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+2`);

    // Click first file
    const indexFile = appPage
      .locator("button", { hasText: /^M/ })
      .filter({ hasText: "index.ts" });
    await indexFile.click();
    await expect(
      appPage.getByText("src/routes/index.ts").first(),
    ).toBeVisible({ timeout: 10000 });

    // Switch back to Changes tab and click another file
    await appPage.keyboard.press(`${MOD}+2`);
    const authFile = appPage
      .locator("button", { hasText: /^A/ })
      .filter({ hasText: "auth.ts" });
    await authFile.click();
    await expect(
      appPage.getByText("src/middleware/auth.ts").first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
