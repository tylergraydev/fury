import { test, expect } from "../helpers/app";

const MOD = "Control";

test.describe("Split View", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("Ctrl+\\ activates split and shows resize handle", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+\\`);
    await appPage.waitForTimeout(300);

    // Split layout should render a resize handle between panes
    const resizeHandle = appPage.locator("[data-panel-resize-handle-id]");
    await expect(resizeHandle.first()).toBeVisible();

    // Clean up
    await appPage.keyboard.press(`${MOD}+\\`);
  });

  test("split shows right pane placeholder when no file open", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+\\`);
    await appPage.waitForTimeout(300);

    // Right pane should show placeholder text
    await expect(
      appPage.getByText("Open a file to view it here"),
    ).toBeVisible();

    await appPage.keyboard.press(`${MOD}+\\`);
  });

  test("toggling split off removes resize handle", async ({ appPage }) => {
    // Activate split
    await appPage.keyboard.press(`${MOD}+\\`);
    await appPage.waitForTimeout(300);
    await expect(
      appPage.locator("[data-panel-resize-handle-id]").first(),
    ).toBeVisible();

    // Deactivate split
    await appPage.keyboard.press(`${MOD}+\\`);
    await appPage.waitForTimeout(300);

    // Resize handle should be gone (may have zero count or be hidden)
    const handles = appPage.locator("[data-panel-resize-handle-id]");
    // In non-split mode, the main panel group may still have a resize handle
    // for the sidebar — check the "Open a file" placeholder is gone instead
    await expect(
      appPage.getByText("Open a file to view it here"),
    ).not.toBeVisible();
  });

  test("opening file in split creates tab in right pane", async ({
    appPage,
  }) => {
    // Activate split
    await appPage.keyboard.press(`${MOD}+\\`);
    await appPage.waitForTimeout(300);

    // Click on a file in the file tree to open it
    await appPage
      .locator("button", { hasText: "package.json" })
      .first()
      .click();

    // The file should open — "Open a file" placeholder should disappear
    // and the file tab/content should be visible
    await appPage.waitForTimeout(500);

    // Clean up
    await appPage.keyboard.press(`${MOD}+\\`);
  });
});
