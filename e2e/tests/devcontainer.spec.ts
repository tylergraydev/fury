import { test, expect } from "../helpers/app";

test.describe("DevContainer", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("repo settings panel opens and shows sections", async ({ appPage }) => {
    // Click the repo settings button
    const settingsBtn = appPage.getByLabel("Repository settings").first();
    await settingsBtn.click();

    // The panel should show key sections
    await expect(appPage.getByText("Environment Variables")).toBeVisible();
  });

  test("repo settings shows Dev Container section when scrolled", async ({
    appPage,
  }) => {
    const settingsBtn = appPage.getByLabel("Repository settings").first();
    await settingsBtn.click();

    // Dev Container section may be below the fold — scroll to it
    const devContainerLabel = appPage.getByText("Dev Container", { exact: true }).first();
    await devContainerLabel.scrollIntoViewIfNeeded();
    await expect(devContainerLabel).toBeVisible();
  });

  test("dev container checkbox to enable for new workspaces", async ({
    appPage,
  }) => {
    const settingsBtn = appPage.getByLabel("Repository settings").first();
    await settingsBtn.click();

    // Scroll to Dev Container section
    const enableLabel = appPage.getByText(
      "Enable dev container for new workspaces",
    );
    await enableLabel.scrollIntoViewIfNeeded();
    await expect(enableLabel).toBeVisible();
  });
});
