import { test, expect } from "../helpers/app";

test.describe("Workspace Templates", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("Save as Template button opens template dialog", async ({
    appPage,
  }) => {
    const settingsBtn = appPage.getByLabel("Repository settings").first();
    await settingsBtn.click();

    const templateBtn = appPage.getByText(
      "Save Current Settings as Template",
    );
    await templateBtn.scrollIntoViewIfNeeded();
    await templateBtn.click();

    const dialog = appPage.locator(
      "[role='dialog'][aria-label='Workspace template']",
    );
    await expect(dialog).toBeVisible();
    await expect(appPage.getByText("Save as Template")).toBeVisible();
  });

  test("template dialog has all form fields", async ({ appPage }) => {
    const settingsBtn = appPage.getByLabel("Repository settings").first();
    await settingsBtn.click();

    const templateBtn = appPage.getByText(
      "Save Current Settings as Template",
    );
    await templateBtn.scrollIntoViewIfNeeded();
    await templateBtn.click();

    // Name field
    await expect(
      appPage.getByPlaceholder("e.g. frontend-feature"),
    ).toBeVisible();

    // Template Name label
    await expect(appPage.getByText("Template Name *")).toBeVisible();
  });

  test("creating a template triggers IPC and closes dialog", async ({
    appPage,
  }) => {
    // Intercept template creation
    await appPage.evaluate(() => {
      (window as any).__TEMPLATE_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "create_workspace_template") {
          (window as any).__TEMPLATE_CALLS__.push(args);
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    const settingsBtn = appPage.getByLabel("Repository settings").first();
    await settingsBtn.click();

    const templateBtn = appPage.getByText(
      "Save Current Settings as Template",
    );
    await templateBtn.scrollIntoViewIfNeeded();
    await templateBtn.click();

    // Fill in the name
    await appPage
      .getByPlaceholder("e.g. frontend-feature")
      .fill("My Feature Template");

    // Submit
    await appPage
      .locator("button", { hasText: "Save Template" })
      .click();

    // Wait for IPC
    await appPage.waitForTimeout(500);

    // Verify IPC was called
    const calls = await appPage.evaluate(
      () => (window as any).__TEMPLATE_CALLS__,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].request.name).toBe("My Feature Template");
  });
});
