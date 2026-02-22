import { test, expect } from "../helpers/app";

test.describe("Workspace Flow", () => {
  test("clicking a workspace chip transitions to workspace layout", async ({
    appPage,
  }) => {
    // Click the "add-auth" workspace chip on the landing page
    await appPage.getByText("add-auth").click();

    // Should see 3-panel workspace layout
    // TopBar shows workspace name badge
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Sidebar should show "Worktrees" header
    await expect(appPage.getByText("Worktrees")).toBeVisible();
  });

  test("clicking a repo transitions to repo context", async ({ appPage }) => {
    // Click the "fury" repo row (the main button with the path)
    await appPage
      .locator("button", { hasText: "/Users/demo/Code/fury" })
      .click();

    // Should see workspace layout with repo context
    await expect(appPage.getByText("Worktrees")).toBeVisible();
  });

  test("sidebar lists workspaces and switching works", async ({ appPage }) => {
    // Navigate to workspace first
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Sidebar should list other workspaces for the same repo
    const sidebarItem = appPage.locator(".truncate.font-semibold", {
      hasText: "redesign-sidebar",
    });
    await expect(sidebarItem).toBeVisible();

    // Click the redesign-sidebar workspace in the sidebar
    await sidebarItem.click();

    // TopBar should update to show the new workspace
    await expect(
      appPage.getByText("/redesign-sidebar", { exact: true }),
    ).toBeVisible();
  });

  test("chat panel shows pre-seeded messages", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();

    // User message should be visible
    await expect(
      appPage.getByText("Add JWT authentication to the API routes"),
    ).toBeVisible();

    // Assistant response text should be visible
    await expect(
      appPage.getByText("examining the current route structure"),
    ).toBeVisible();
  });

  test("composer shows idle status and placeholder", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();

    // Status indicator should show "Idle"
    await expect(appPage.getByText("Idle")).toBeVisible();

    // Composer placeholder
    await expect(
      appPage.getByPlaceholder(
        "Ask to make changes, @mention files, run /commands",
      ),
    ).toBeVisible();
  });
});
