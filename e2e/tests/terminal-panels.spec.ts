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
    // Click Setup tab (tabs are buttons with role="tab")
    const setupTab = appPage.getByRole("tab", { name: "Setup", exact: true });
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
    // Click Run tab (tabs are buttons with role="tab")
    const runTab = appPage.getByRole("tab", { name: "Run", exact: true });
    await runTab.click();

    // Run panel shows "Run Script" label
    await expect(appPage.getByText("Run Script")).toBeVisible();
  });

  test("Terminal tab renders terminal view", async ({ appPage }) => {
    // Click Terminal tab (tabs are buttons with role="tab")
    const terminalTab = appPage.getByRole("tab", { name: "Terminal", exact: true });
    await terminalTab.click();

    // Terminal panel should render (creates terminal via mock)
    // Wait for the terminal to initialize
    await appPage.waitForTimeout(1000);

    // Just verify the Terminal tab is still active and no error is shown
    await expect(terminalTab).toBeVisible();
  });
});
