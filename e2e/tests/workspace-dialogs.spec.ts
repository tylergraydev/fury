import { test, expect } from "../helpers/app";

test.describe("Workspace Dialogs", () => {
  test("New workspace dialog opens from sidebar button", async ({
    appPage,
  }) => {
    // The "New Chat Worktree" button is at the bottom of the sidebar.
    // But we're on the landing page initially — need to click a workspace first.
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Now click the "New Chat Worktree" button in the sidebar
    await appPage
      .locator("button", { hasText: "New Chat Worktree" })
      .click();

    // Dialog should appear
    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Create an isolated workspace"),
    ).toBeVisible();
  });

  test("worktree name input visible", async ({
    appPage,
  }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    await appPage
      .locator("button", { hasText: "New Chat Worktree" })
      .click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();

    // Worktree name input
    await expect(dialog.getByText("Worktree Name")).toBeVisible();
    await expect(
      dialog.locator('input[placeholder="feature-auth"]'),
    ).toBeVisible();
  });

  test("branch dropdown loads branches from mock", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    await appPage
      .locator("button", { hasText: "New Chat Worktree" })
      .click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();

    // Base Branch section
    await expect(dialog.getByText("Base Branch")).toBeVisible();

    // Select should have "main" as default value
    const branchSelect = dialog.locator("select").first();
    await expect(branchSelect).toHaveValue("main");
  });

  test("Cancel closes dialog", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    await appPage
      .locator("button", { hasText: "New Chat Worktree" })
      .click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();

    // Click cancel
    await dialog.locator("button", { hasText: "Cancel" }).click();

    // Dialog should be gone
    await expect(dialog).not.toBeVisible();
  });
});
