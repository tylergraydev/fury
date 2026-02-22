import { test, expect } from "../helpers/app";

test.describe("Sidebar Details", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to a workspace to get the sidebar visible
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("repo section collapses and expands on click", async ({ appPage }) => {
    // The sidebar shows "Repository: fury" as a clickable section
    const repoHeader = appPage
      .locator("button")
      .filter({ hasText: "Repository" })
      .filter({ hasText: "fury" })
      .first();
    await expect(repoHeader).toBeVisible();

    // Workspaces under fury should be visible
    await expect(appPage.getByText("redesign-sidebar").first()).toBeVisible();

    // Click to collapse the fury repo section
    await repoHeader.click();

    // Workspaces under fury should be hidden
    await expect(
      appPage.getByText("redesign-sidebar"),
    ).not.toBeVisible();

    // Click to expand again
    await repoHeader.click();
    await expect(appPage.getByText("redesign-sidebar").first()).toBeVisible();
  });

  test("double-click workspace name enables rename", async ({ appPage }) => {
    // Double-click the workspace name in the sidebar
    const wsName = appPage
      .locator("span.font-semibold", { hasText: "add-auth" })
      .first();
    await wsName.dblclick();

    // Should show an input field with the current name
    const renameInput = appPage.locator("input[value='add-auth']").first();
    await expect(renameInput).toBeVisible();
  });

  test("archive button appears on workspace hover", async ({ appPage }) => {
    // Hover over a workspace item to show action buttons
    const wsItem = appPage
      .locator('[class*="cursor-pointer"]', { hasText: "add-auth" })
      .first();
    await wsItem.hover();

    // Archive button should appear (title="Archive worktree")
    const archiveBtn = appPage
      .locator('button[title="Archive worktree"]')
      .first();
    await expect(archiveBtn).toBeVisible();
  });

  test("Archived section expands and shows empty state", async ({
    appPage,
  }) => {
    // Click Archived section at bottom of sidebar
    const archivedBtn = appPage.locator("button", { hasText: "Archived" });
    await expect(archivedBtn).toBeVisible();
    await archivedBtn.click();

    // Should show "No archived workspaces" (mock returns empty list)
    await expect(
      appPage.getByText("No archived workspaces"),
    ).toBeVisible();
  });
});
