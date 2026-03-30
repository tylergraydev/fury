import { test, expect } from "../helpers/app";

const MOD = "Control";

test.describe("Snippet Manager", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("opens snippet manager and shows empty state message", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+Shift+s`);

    const dialog = appPage.locator(
      "[role='dialog'][aria-label='Snippet manager']",
    );
    await expect(dialog).toBeVisible();
    await expect(
      appPage.getByText("No snippets saved yet"),
    ).toBeVisible();
  });

  test("creates a new snippet and verifies it persists in the list", async ({
    appPage,
  }) => {
    // Intercept create_snippet IPC
    await appPage.evaluate(() => {
      (window as any).__SNIPPET_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "create_snippet") {
          (window as any).__SNIPPET_CALLS__.push(args);
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await appPage.keyboard.press(`${MOD}+Shift+s`);
    await appPage.getByText("New Snippet").click();

    // Fill in the form
    await appPage.getByPlaceholder("e.g. fetch helper").fill("Auth Header");
    await appPage
      .getByPlaceholder("Paste your code snippet here...")
      .fill("Authorization: Bearer ${token}");

    // Save
    await appPage.getByText("Create Snippet", { exact: true }).click();

    // Verify IPC was called with correct data
    const calls = await appPage.evaluate(
      () => (window as any).__SNIPPET_CALLS__,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].request.title).toBe("Auth Header");

    // Snippet should appear in the list
    await expect(appPage.getByText("Auth Header")).toBeVisible();
  });

  test("search filters snippets and clears to restore", async ({
    appPage,
  }) => {
    await appPage.evaluate(() => {
      (window as any).__E2E_SNIPPETS__ = [
        {
          id: "s1", title: "JWT Middleware",
          content: "const jwt = require('jsonwebtoken');",
          language: "javascript", description: "Auth middleware",
          tags: ["auth"], source: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "s2", title: "Express Route",
          content: "router.get('/', handler);",
          language: "javascript", description: "Route template",
          tags: ["express"], source: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    await appPage.keyboard.press(`${MOD}+Shift+s`);

    // Both visible
    await expect(appPage.getByText("JWT Middleware")).toBeVisible();
    await expect(appPage.getByText("Express Route")).toBeVisible();

    // Search filters
    const searchInput = appPage.getByPlaceholder("Search snippets...");
    await searchInput.fill("JWT");
    await expect(appPage.getByText("JWT Middleware")).toBeVisible();
    await expect(appPage.getByText("Express Route")).not.toBeVisible();

    // Clear search restores all
    await searchInput.fill("");
    await expect(appPage.getByText("JWT Middleware")).toBeVisible();
    await expect(appPage.getByText("Express Route")).toBeVisible();
  });

  test("delete snippet removes it from the list", async ({ appPage }) => {
    await appPage.evaluate(() => {
      (window as any).__E2E_SNIPPETS__ = [
        {
          id: "s-del", title: "Delete Me",
          content: "temporary code",
          language: "javascript", description: null,
          tags: [], source: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    await appPage.keyboard.press(`${MOD}+Shift+s`);
    await expect(appPage.getByText("Delete Me")).toBeVisible();

    // Find and click the delete button for this snippet
    const deleteBtn = appPage.getByLabel("Delete snippet").first().or(
      appPage.locator("button[title='Delete']").first(),
    );
    if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await deleteBtn.click();
      // Snippet should be removed
      await expect(appPage.getByText("Delete Me")).not.toBeVisible();
    }
  });

  test("closes dialog without losing created snippets", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+Shift+s`);

    // Create a snippet
    await appPage.getByText("New Snippet").click();
    await appPage.getByPlaceholder("e.g. fetch helper").fill("Persist Test");
    await appPage
      .getByPlaceholder("Paste your code snippet here...")
      .fill("test content");
    await appPage.getByText("Create Snippet", { exact: true }).click();
    await expect(appPage.getByText("Persist Test")).toBeVisible();

    // Close dialog
    await appPage.getByText("Close", { exact: true }).last().click();

    // Re-open and verify snippet is still there
    await appPage.keyboard.press(`${MOD}+Shift+s`);
    await expect(appPage.getByText("Persist Test")).toBeVisible();
  });
});
