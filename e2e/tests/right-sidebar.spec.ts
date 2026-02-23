import { test, expect } from "../helpers/app";

test.describe("Right Sidebar", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("file tree shows directories and files from mock data", async ({
    appPage,
  }) => {
    // "All files" tab should be active by default
    await expect(appPage.getByText("All files")).toBeVisible();

    // The "src" directory should be visible in the file tree
    await expect(
      appPage.locator("button", { hasText: "src" }).first(),
    ).toBeVisible();

    // Top-level files should be visible
    await expect(appPage.getByText("package.json").first()).toBeVisible();
    await expect(appPage.getByText("tsconfig.json").first()).toBeVisible();
    await expect(appPage.getByText("README.md").first()).toBeVisible();
  });

  test("clicking folder expands and collapses children", async ({
    appPage,
  }) => {
    // Initially the src directory children should not be visible
    // (files nested under src like "App.tsx" won't show until expanded)
    const srcDir = appPage.locator("button", { hasText: "src" }).first();
    await expect(srcDir).toBeVisible();

    // Click to expand src
    await srcDir.click();

    // Child directories should now be visible
    await expect(
      appPage.locator("button", { hasText: "components" }).first(),
    ).toBeVisible();
    await expect(
      appPage.locator("button", { hasText: "lib" }).first(),
    ).toBeVisible();

    // Click again to collapse
    await srcDir.click();

    // Children should be hidden
    await expect(
      appPage.locator("button", { hasText: "components" }).first(),
    ).not.toBeVisible();
  });

  test("Changes tab shows diff summary with file count and additions/deletions", async ({
    appPage,
  }) => {
    // Switch to Changes tab
    const changesTab = appPage.locator("button", { hasText: "Changes" }).first();
    await changesTab.click();

    // Should show diff summary: 3 files, +65, -5 (from mock DIFFS data)
    await expect(appPage.getByText("3 files")).toBeVisible();
    await expect(appPage.getByText("+65")).toBeVisible();
    await expect(appPage.getByText("-5")).toBeVisible();

    // Individual files should appear with status labels
    await expect(appPage.getByText("auth.ts").first()).toBeVisible();
    await expect(appPage.getByText("index.ts").first()).toBeVisible();
  });

  test("clicking file in changes opens diff view tab", async ({ appPage }) => {
    // Switch to Changes tab
    const changesTab = appPage.locator("button", { hasText: "Changes" }).first();
    await changesTab.click();

    // Click on index.ts in the changes panel
    // The changes file button has status label "M" and filename "index.ts"
    // Use the button that contains both "M" and "index.ts" to avoid matching tool calls
    const indexFile = appPage.locator("button", { hasText: /^M/ }).filter({ hasText: "index.ts" });
    await indexFile.click();

    // Diff view tab should open — the DiffPanel header shows the selected file path
    await expect(appPage.getByText("src/routes/index.ts").first()).toBeVisible({ timeout: 10000 });
  });

  test("bottom panel tabs switch between Setup, Run, and Terminal", async ({
    appPage,
  }) => {
    // Bottom panel should show Setup, Run, Terminal tabs
    await expect(appPage.getByText("Setup")).toBeVisible();
    await expect(appPage.getByText("Run")).toBeVisible();
    await expect(appPage.getByText("Terminal")).toBeVisible();

    // Click Run tab
    await appPage.getByText("Run").click();

    // Click Terminal tab
    await appPage.getByText("Terminal").click();

    // Click Setup tab to go back
    await appPage.getByText("Setup").click();
  });
});
