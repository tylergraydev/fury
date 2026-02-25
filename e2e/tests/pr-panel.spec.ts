import { test, expect } from "../helpers/app";

test.describe("PR Panel (Checks Tab)", () => {
  test.describe("Create PR form (no existing PR)", () => {
    test.beforeEach(async ({ appPage }) => {
      // ws-auth has no PR (prNumber: null)
      await appPage.getByText("add-auth").click();
      await expect(
        appPage.getByText("/add-auth", { exact: true }),
      ).toBeVisible();

      // Switch to Checks tab in right sidebar
      await appPage.locator("button", { hasText: "Checks" }).click();
    });

    test("shows Create Pull Request form with title input", async ({
      appPage,
    }) => {
      await expect(appPage.getByText("Create Pull Request")).toBeVisible();
      await expect(
        appPage.locator('input[placeholder="PR title"]'),
      ).toBeVisible();
    });

    test("title defaults to workspace branch name", async ({ appPage }) => {
      const titleInput = appPage.locator('input[placeholder="PR title"]');
      await expect(titleInput).toHaveValue("feature/add-auth");
    });

    test("Create PR button submits form", async ({ appPage }) => {
      const checksPanel = appPage.locator('[data-testid="panel-checks"]');
      const titleInput = checksPanel.locator('input[placeholder="PR title"]');
      await titleInput.fill("Add JWT authentication");

      const createButton = checksPanel.locator("button", {
        hasText: "Create PR",
      });
      await createButton.click();

      // After creation, should show PR status (mock returns PR #42)
      await expect(checksPanel.getByText("#42").first()).toBeVisible({ timeout: 5000 });
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
      const checksPanel = appPage.locator('[data-testid="panel-checks"]');
      await expect(
        checksPanel.getByText("#42").first(),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        checksPanel.getByText("Redesign sidebar layout").first(),
      ).toBeVisible();
    });

    test("CI checks display with status indicators", async ({ appPage }) => {
      const checksPanel = appPage.locator('[data-testid="panel-checks"]');
      // Wait for PR info to load
      await expect(
        checksPanel.getByText("#42").first(),
      ).toBeVisible({ timeout: 5000 });

      // Check names should be visible
      await expect(checksPanel.getByText("build").first()).toBeVisible();
      await expect(checksPanel.getByText("lint").first()).toBeVisible();
      await expect(checksPanel.getByText("test").first()).toBeVisible();

      // Success/failure labels
      await expect(checksPanel.getByText("success").first()).toBeVisible();
      await expect(checksPanel.getByText("failure").first()).toBeVisible();
      await expect(checksPanel.getByText("pending").first()).toBeVisible();
    });

    test("Push button and Fix with Claude button visible", async ({
      appPage,
    }) => {
      const checksPanel = appPage.locator('[data-testid="panel-checks"]');
      await expect(
        checksPanel.getByText("#42").first(),
      ).toBeVisible({ timeout: 5000 });

      // Push button (inline ChecksPanel shows "Push")
      await expect(
        checksPanel.locator("button", { hasText: "Push" }).first(),
      ).toBeVisible();

      // Fix with Claude button appears because there's a failing check
      await expect(
        checksPanel.locator("button", { hasText: "Fix with Claude" }),
      ).toBeVisible();
    });
  });
});
