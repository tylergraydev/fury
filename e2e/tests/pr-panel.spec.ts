import { test, expect } from "../helpers/app";

test.describe("PR Panel (Checks Tab)", () => {
  test.describe("Create PR (no existing PR)", () => {
    test.beforeEach(async ({ appPage }) => {
      // ws-auth has no PR (prNumber: null)
      await appPage.getByText("add-auth").click();
      await expect(
        appPage.getByText("/add-auth", { exact: true }),
      ).toBeVisible();

      // Switch to Checks tab in right sidebar
      await appPage.locator("button", { hasText: "Checks" }).click();
    });

    test("shows Create PR button when no PR exists", async ({
      appPage,
    }) => {
      await expect(appPage.getByText("No pull request")).toBeVisible();
      await expect(
        appPage.locator("button", { hasText: "Create PR" }),
      ).toBeVisible();
    });

    test("Create PR button triggers agent message", async ({ appPage }) => {
      const createButton = appPage.locator("button", {
        hasText: "Create PR",
      });
      await createButton.click();

      // Button should show creating state
      await expect(appPage.getByText("Creating...")).toBeVisible();
    });
  });

  test.describe("PR status view (existing PR)", () => {
    test.beforeEach(async ({ appPage }) => {
      // ws-ui has an existing PR (#42)
      await appPage.getByText("redesign-sidebar").click();
      await expect(
        appPage.getByText("/redesign-sidebar", { exact: true }),
      ).toBeVisible();

      // Switch to Checks tab
      await appPage.locator("button", { hasText: "Checks" }).click();
    });

    test("shows PR number and title", async ({ appPage }) => {
      await expect(
        appPage.getByText("#42").first(),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        appPage.getByText("Redesign sidebar layout").first(),
      ).toBeVisible();
    });

    test("CI checks display with status indicators", async ({ appPage }) => {
      // Wait for PR info to load
      await expect(
        appPage.getByText("#42").first(),
      ).toBeVisible({ timeout: 5000 });

      // Check names should be visible
      await expect(appPage.getByText("build").first()).toBeVisible();
      await expect(appPage.getByText("lint").first()).toBeVisible();
      await expect(appPage.getByText("test").first()).toBeVisible();

      // Success/failure labels
      await expect(appPage.getByText("success").first()).toBeVisible();
      await expect(appPage.getByText("failure").first()).toBeVisible();
      await expect(appPage.getByText("pending").first()).toBeVisible();
    });

    test("Push button and Fix with Claude button visible", async ({
      appPage,
    }) => {
      await expect(
        appPage.getByText("#42").first(),
      ).toBeVisible({ timeout: 5000 });

      // Push button (inline ChecksPanel shows "Push")
      await expect(
        appPage.locator("button", { hasText: "Push" }).first(),
      ).toBeVisible();

      // Fix with Claude button appears because there's a failing check
      await expect(
        appPage.locator("button", { hasText: "Fix with Claude" }),
      ).toBeVisible();
    });
  });
});
