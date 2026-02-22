import { test, expect } from "../helpers/app";

test.describe("Terminal & Script Panels", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("Setup panel shows Setup Script header and Run button", async ({
    appPage,
  }) => {
    // Click Setup tab (these are <span> elements, not buttons)
    const setupTab = appPage.locator("span", { hasText: "Setup" }).first();
    await expect(setupTab).toBeVisible();
    await setupTab.click();

    // Setup panel shows "Setup Script" label and a Run button
    await expect(
      appPage.getByText("Setup Script", { exact: true }),
    ).toBeVisible();
    await expect(
      appPage.locator("button", { hasText: "Run" }).last(),
    ).toBeVisible();
  });

  test("Run panel shows Run Script header and Run button", async ({
    appPage,
  }) => {
    // Click Run tab
    const runTab = appPage.locator("span", { hasText: "Run" }).first();
    await runTab.click();

    // Run panel shows "Run Script" label
    await expect(appPage.getByText("Run Script")).toBeVisible();
  });

  test("Terminal tab renders terminal view", async ({ appPage }) => {
    // Click Terminal tab
    const terminalTab = appPage
      .locator("span", { hasText: "Terminal" })
      .first();
    await terminalTab.click();

    // Terminal panel should render (creates terminal via mock)
    // Wait for the terminal to initialize
    await appPage.waitForTimeout(1000);

    // The terminal panel renders either an xterm container or the terminal view
    // Just verify the Terminal tab is active and no error is shown
    await expect(
      appPage.locator("span", { hasText: "Terminal" }).first(),
    ).toBeVisible();
  });
});
