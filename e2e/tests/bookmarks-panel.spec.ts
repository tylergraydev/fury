import { test, expect } from "../helpers/app";

const MOD = "Control";

test.describe("Bookmarks Panel", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("shows empty state when no bookmarks exist", async ({ appPage }) => {
    // Switch to Bookmarks tab via keyboard shortcut
    await appPage.keyboard.press(`${MOD}+6`);

    await expect(appPage.getByText("No bookmarks yet")).toBeVisible();
    await expect(
      appPage.getByText("Click the gutter margin in the editor to add a bookmark"),
    ).toBeVisible();
  });

  test("displays bookmarks grouped by file", async ({ appPage }) => {
    // Pre-seed bookmarks via the window global
    await appPage.evaluate(() => {
      (window as any).__E2E_BOOKMARKS__ = [
        {
          id: "bm-1",
          repoId: "repo-fury",
          filePath: "src/routes/index.ts",
          lineNumber: 10,
          note: "Check auth middleware",
          color: "blue",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "bm-2",
          repoId: "repo-fury",
          filePath: "src/routes/index.ts",
          lineNumber: 25,
          note: null,
          color: "green",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "bm-3",
          repoId: "repo-fury",
          filePath: "src/lib/auth.ts",
          lineNumber: 5,
          note: "Token validation logic",
          color: "red",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    // Switch to Bookmarks tab
    await appPage.keyboard.press(`${MOD}+6`);

    // File group headers should be visible
    await expect(appPage.getByText("index.ts").first()).toBeVisible();
    await expect(appPage.getByText("auth.ts").first()).toBeVisible();

    // Bookmark entries with line numbers
    await expect(appPage.getByText("L10")).toBeVisible();
    await expect(appPage.getByText("L25")).toBeVisible();
    await expect(appPage.getByText("L5")).toBeVisible();

    // Notes should be visible
    await expect(appPage.getByText("Check auth middleware")).toBeVisible();
    await expect(appPage.getByText("Token validation logic")).toBeVisible();

    // Bookmark without note shows "No note"
    await expect(appPage.getByText("No note")).toBeVisible();
  });

  test("shows count badge per file group", async ({ appPage }) => {
    await appPage.evaluate(() => {
      (window as any).__E2E_BOOKMARKS__ = [
        {
          id: "bm-1",
          repoId: "repo-fury",
          filePath: "src/routes/index.ts",
          lineNumber: 10,
          note: "First bookmark",
          color: "blue",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "bm-2",
          repoId: "repo-fury",
          filePath: "src/routes/index.ts",
          lineNumber: 20,
          note: "Second bookmark",
          color: "blue",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    await appPage.keyboard.press(`${MOD}+6`);

    // Both bookmarks should be displayed with their line numbers
    await expect(appPage.getByText("L10")).toBeVisible();
    await expect(appPage.getByText("L20")).toBeVisible();
    await expect(appPage.getByText("First bookmark")).toBeVisible();
    await expect(appPage.getByText("Second bookmark")).toBeVisible();
  });

  test("bookmark items have edit and delete buttons on hover", async ({
    appPage,
  }) => {
    await appPage.evaluate(() => {
      (window as any).__E2E_BOOKMARKS__ = [
        {
          id: "bm-1",
          repoId: "repo-fury",
          filePath: "src/routes/index.ts",
          lineNumber: 10,
          note: "Test bookmark",
          color: "blue",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    await appPage.keyboard.press(`${MOD}+6`);

    // Hover over the bookmark item to reveal action buttons
    const bookmarkItem = appPage.locator("[role='button']", {
      hasText: "L10",
    });
    await bookmarkItem.hover();

    // Edit and delete buttons should be present (visible on hover via CSS)
    await expect(
      appPage.getByLabel("Edit bookmark"),
    ).toBeAttached();
    await expect(
      appPage.getByLabel("Delete bookmark"),
    ).toBeAttached();
  });
});
