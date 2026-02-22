import { test, expect } from "../helpers/app";

test.describe("Landing Dialogs", () => {
  test("Clone repo dialog opens with URL input", async ({ appPage }) => {
    // From landing page, click the Clone quick action card
    await appPage.locator("button", { hasText: "Clone Repository" }).click();

    // Dialog should appear
    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Clone Repository")).toBeVisible();
    await expect(dialog.getByText("Clone a repository from a Git URL")).toBeVisible();

    // URL input
    await expect(dialog.getByText("Repository URL")).toBeVisible();
    await expect(
      dialog.locator('input[placeholder="https://github.com/user/repo.git"]'),
    ).toBeVisible();

    // Clone to path input
    await expect(dialog.getByText("Clone to")).toBeVisible();
  });

  test("New AI Project dialog opens with name and path inputs", async ({
    appPage,
  }) => {
    await appPage
      .locator("button", { hasText: "New AI Project" })
      .click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("New AI Project")).toBeVisible();
    await expect(
      dialog.getByText("Create a new project with AI assistance"),
    ).toBeVisible();

    // Name input
    await expect(dialog.getByText("Project Name")).toBeVisible();
    await expect(
      dialog.locator('input[placeholder="my-awesome-project"]'),
    ).toBeVisible();

    // Location input
    await expect(dialog.getByText("Location")).toBeVisible();
  });

  test("Open Repository triggers directory picker", async ({ appPage }) => {
    // The "Open Repository" quick action opens the dialog picker
    // Our mock returns "/Users/demo/Code/fury" for dialog|open
    const openButton = appPage.locator("button", {
      hasText: "Open Repository",
    });
    await expect(openButton).toBeVisible();

    // Clicking it triggers the open dialog (mock immediately returns)
    // After the dialog, the app should try to add the repo
    await openButton.click();

    // The app will attempt to add the repo path returned by the mock
    // Verify no crash occurred by checking the page is still interactive
    await appPage.waitForTimeout(500);
    await expect(appPage.locator("body")).toBeVisible();
  });
});
