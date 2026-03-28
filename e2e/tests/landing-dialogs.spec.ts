import { test, expect } from "../helpers/app";

test.describe("Landing Dialogs", () => {
  test("Clone dialog: URL input populates and Clone button enables", async ({
    appPage,
  }) => {
    await appPage.locator("button", { hasText: "Clone Repository" }).click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();

    const urlInput = dialog.locator(
      'input[placeholder="https://github.com/user/repo.git"]',
    );
    const cloneBtn = dialog.locator("button", { hasText: "Clone" }).last();

    // Initially disabled
    await expect(cloneBtn).toBeDisabled();

    // Type a URL
    await urlInput.fill("https://github.com/acme/my-app.git");

    // Clone button should now be enabled
    await expect(cloneBtn).toBeEnabled();
  });

  test("Clone dialog: Clone button disabled when URL is empty", async ({
    appPage,
  }) => {
    await appPage.locator("button", { hasText: "Clone Repository" }).click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    const cloneBtn = dialog.locator("button", { hasText: "Clone" }).last();

    // Initially disabled (empty URL)
    await expect(cloneBtn).toBeDisabled();

    // Type a URL — button should become enabled
    const urlInput = dialog.locator(
      'input[placeholder="https://github.com/user/repo.git"]',
    );
    await urlInput.fill("https://github.com/user/repo.git");
    await expect(cloneBtn).toBeEnabled();
  });

  test("Clone dialog: submitting triggers clone_repository IPC", async ({
    appPage,
  }) => {
    await appPage.evaluate(() => {
      (window as any).__CLONE_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "clone_repository") {
          (window as any).__CLONE_CALLS__.push(args);
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await appPage.locator("button", { hasText: "Clone Repository" }).click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    const urlInput = dialog.locator(
      'input[placeholder="https://github.com/user/repo.git"]',
    );
    await urlInput.fill("https://github.com/acme/test-repo.git");

    // Click Clone
    const cloneBtn = dialog.locator("button", { hasText: "Clone" }).last();
    await cloneBtn.click();

    // Wait for IPC
    await appPage.waitForTimeout(500);

    const calls = await appPage.evaluate(
      () => (window as any).__CLONE_CALLS__,
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://github.com/acme/test-repo.git");
  });

  test("Clone dialog: Cancel closes without triggering clone", async ({
    appPage,
  }) => {
    await appPage.evaluate(() => {
      (window as any).__CLONE_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "clone_repository") {
          (window as any).__CLONE_CALLS__.push(args);
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await appPage.locator("button", { hasText: "Clone Repository" }).click();
    await appPage.getByText("Cancel", { exact: true }).click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).not.toBeVisible();

    const calls = await appPage.evaluate(
      () => (window as any).__CLONE_CALLS__,
    );
    expect(calls.length).toBe(0);
  });

  test("New AI Project dialog: validates project name", async ({
    appPage,
  }) => {
    await appPage
      .locator("button", { hasText: "New AI Project" })
      .click();

    const dialog = appPage.locator(".fixed.inset-0.z-50");
    await expect(dialog).toBeVisible();

    // Create button should be disabled when name is empty
    const createBtn = dialog
      .locator("button", { hasText: "Create" })
      .last();
    await expect(createBtn).toBeDisabled();

    // Fill in a project name
    const nameInput = dialog.locator(
      'input[placeholder="my-awesome-project"]',
    );
    await nameInput.fill("test-project");
    await expect(createBtn).toBeEnabled();
  });

  test("Open Repository button opens directory picker without crashing", async ({
    appPage,
  }) => {
    const openButton = appPage.locator("button", {
      hasText: "Open Repository",
    });
    await expect(openButton).toBeVisible();

    // Clicking triggers the file dialog mock, then attempts to add repo
    await openButton.click();
    await appPage.waitForTimeout(500);

    // Page should still be interactive (no crash)
    await expect(appPage.locator("body")).toBeVisible();
  });
});
