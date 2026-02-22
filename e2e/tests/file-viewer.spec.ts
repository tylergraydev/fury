import { test, expect } from "../helpers/app";

test.describe("File Viewer & Tabs", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to the add-auth workspace
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("clicking a file in the sidebar opens a file tab", async ({
    appPage,
  }) => {
    // The right sidebar "All files" tab should be visible and show the file tree
    await expect(appPage.getByText("All files")).toBeVisible();

    // Expand "src" directory first
    const srcDir = appPage.locator("button", { hasText: "src" }).first();
    await srcDir.click();

    // Click on a file to open it
    const appFile = appPage.locator("button", { hasText: "App.tsx" }).first();
    await appFile.click();

    // A file tab should appear in the tab bar with the filename
    await expect(appPage.locator("span", { hasText: "App.tsx" }).first()).toBeVisible();

    // The tab text should be italic (unpinned preview)
    const tabLabel = appPage.locator("span[style*='italic']", { hasText: "App.tsx" }).first();
    await expect(tabLabel).toBeVisible();
  });

  test("clicking Chat tab returns to chat view", async ({ appPage }) => {
    // Open a file first
    const srcDir = appPage.locator("button", { hasText: "src" }).first();
    await srcDir.click();
    const appFile = appPage.locator("button", { hasText: "App.tsx" }).first();
    await appFile.click();

    // Verify file tab exists
    await expect(appPage.locator("span", { hasText: "App.tsx" }).first()).toBeVisible();

    // Click the Chat tab button (exact match to avoid "New Chat Worktree" sidebar button)
    const chatTab = appPage.getByRole("button", { name: "Chat", exact: true });
    await chatTab.click();

    // The pre-seeded chat messages should be visible again
    await expect(
      appPage.getByText("Add JWT authentication to the API routes"),
    ).toBeVisible();
  });

  test("close button removes file tab", async ({ appPage }) => {
    // Open a file
    const srcDir = appPage.locator("button", { hasText: "src" }).first();
    await srcDir.click();
    const appFile = appPage.locator("button", { hasText: "App.tsx" }).first();
    await appFile.click();

    // Verify the tab is visible
    const tabContainer = appPage.locator("span", { hasText: "App.tsx" }).first();
    await expect(tabContainer).toBeVisible();

    // Click the close (X) button on the tab
    // The X button is inside the tab span, it's a button with an svg
    const closeBtn = tabContainer.locator("button").first();
    await closeBtn.click();

    // The tab should be removed — no more App.tsx in the tab bar area
    // Chat should be shown since there are no remaining tabs
    await expect(
      appPage.getByText("Add JWT authentication to the API routes"),
    ).toBeVisible();
  });

  test("double-click file tab pins it (removes italic)", async ({
    appPage,
  }) => {
    // Open a file (single click = unpinned)
    const srcDir = appPage.locator("button", { hasText: "src" }).first();
    await srcDir.click();
    const appFile = appPage.locator("button", { hasText: "App.tsx" }).first();
    await appFile.click();

    // Tab label should be italic (unpinned)
    const tabLabel = appPage.locator("span[style*='italic']", { hasText: "App.tsx" }).first();
    await expect(tabLabel).toBeVisible();

    // Double-click the tab label to pin it
    await tabLabel.dblclick();

    // After pinning, the fontStyle should be "normal" (not italic)
    const pinnedLabel = appPage.locator("span[style*='font-style: normal']", { hasText: "App.tsx" }).first();
    await expect(pinnedLabel).toBeVisible();
  });

  test("multiple file tabs, clicking switches active tab", async ({
    appPage,
  }) => {
    // Expand src directory
    const srcDir = appPage.locator("button", { hasText: "src" }).first();
    await srcDir.click();

    // Double-click first file to pin it (so it stays when opening another)
    const appFile = appPage.locator("button", { hasText: "App.tsx" }).first();
    await appFile.dblclick();

    // Open a second file (also pinned via double-click)
    await appPage.locator("button", { hasText: "main.tsx" }).first().dblclick();

    // Both file tabs should be visible in the tab bar
    const tabs = appPage.locator("span[style*='font-style']");
    await expect(tabs.filter({ hasText: "App.tsx" }).first()).toBeVisible();
    await expect(tabs.filter({ hasText: "main.tsx" }).first()).toBeVisible();

    // Click on the App.tsx tab to switch back to it
    await appPage.locator("span", { hasText: "App.tsx" }).first().click();

    // The App.tsx tab should be the active one (accent colored border)
    const appTab = appPage.locator("span", { hasText: "App.tsx" }).first();
    await expect(appTab).toHaveCSS("border-bottom-color", /./);
  });
});
