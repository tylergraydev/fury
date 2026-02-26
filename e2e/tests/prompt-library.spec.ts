import { test, expect } from "../helpers/app";

test.describe("Prompt Library", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to a workspace so the Composer is visible
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Reset prompts state for each test
    await appPage.evaluate(() => {
      (window as any).__E2E_PROMPTS__ = [];
    });
  });

  test("opens prompt library from plus menu", async ({ appPage }) => {
    // Click plus menu button
    await appPage.getByTitle("Add file or context").click();

    // Prompt Library button should be visible
    await expect(appPage.getByText("Prompt Library")).toBeVisible();

    // Click to open prompt library dialog
    await appPage.getByText("Prompt Library").click();

    // Dialog should appear
    await expect(appPage.getByText("Prompt Library").first()).toBeVisible();
    await expect(appPage.getByText("No prompts saved yet. Create one to get started.")).toBeVisible();
  });

  test("creates a new prompt", async ({ appPage }) => {
    // Open prompt library
    await appPage.getByTitle("Add file or context").click();
    await appPage.getByText("Prompt Library").click();

    // Click "New Prompt"
    await appPage.locator("button", { hasText: "New Prompt" }).click();

    // Fill in the form
    await expect(appPage.getByPlaceholder("e.g. code-review")).toBeVisible();
    await appPage.getByPlaceholder("e.g. code-review").fill("security-review");
    await appPage
      .getByPlaceholder("Review {{file}} for security vulnerabilities and suggest fixes.")
      .fill("Check {{file}} for OWASP top 10 vulnerabilities");
    await appPage.getByPlaceholder("Optional description").fill("Security audit prompt");
    await appPage.getByPlaceholder("e.g. Code Review").fill("Security");

    // Click Create
    await appPage.locator("button", { hasText: "Create Prompt" }).click();

    // Should return to library view with the new prompt listed
    await expect(appPage.getByText("security-review").first()).toBeVisible();
    await expect(appPage.getByText("Security audit prompt").first()).toBeVisible();
  });

  test("inserts a simple prompt into the composer", async ({ appPage }) => {
    // Seed a prompt without custom variables
    await appPage.evaluate(() => {
      (window as any).__E2E_PROMPTS__ = [
        {
          id: "p-1",
          name: "explain-code",
          content: "Explain what this code does in simple terms.",
          description: "Code explanation",
          category: "Learning",
          tags: [],
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    // Open prompt library
    await appPage.getByTitle("Add file or context").click();
    await appPage.getByText("Prompt Library").click();

    // Wait for the prompt to appear
    await expect(appPage.getByText("explain-code")).toBeVisible();

    // Click the prompt to insert it
    await appPage.getByText("explain-code").click();

    // Dialog should close and text should be in the composer
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );
    await expect(textarea).toHaveValue("Explain what this code does in simple terms.");
  });

  test("searches and filters prompts", async ({ appPage }) => {
    // Seed multiple prompts
    await appPage.evaluate(() => {
      (window as any).__E2E_PROMPTS__ = [
        {
          id: "p-1",
          name: "code-review",
          content: "Review code for issues",
          description: "Code review helper",
          category: "Review",
          tags: ["review"],
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "p-2",
          name: "write-tests",
          content: "Write unit tests for the module",
          description: "Test writer",
          category: "Testing",
          tags: ["tests"],
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    // Open prompt library
    await appPage.getByTitle("Add file or context").click();
    await appPage.getByText("Prompt Library").click();

    // Both prompts should be visible
    await expect(appPage.getByText("code-review")).toBeVisible();
    await expect(appPage.getByText("write-tests")).toBeVisible();

    // Search for "test"
    await appPage.getByPlaceholder("Search prompts...").fill("test");

    // Only write-tests should be visible
    await expect(appPage.getByText("write-tests")).toBeVisible();
    await expect(appPage.getByText("code-review")).not.toBeVisible();
  });

  test("shows category filter pills", async ({ appPage }) => {
    // Seed prompts with categories
    await appPage.evaluate(() => {
      (window as any).__E2E_PROMPTS__ = [
        {
          id: "p-1",
          name: "review-prompt",
          content: "Review this",
          description: null,
          category: "Review",
          tags: [],
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "p-2",
          name: "test-prompt",
          content: "Write tests",
          description: null,
          category: "Testing",
          tags: [],
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    // Open prompt library
    await appPage.getByTitle("Add file or context").click();
    await appPage.getByText("Prompt Library").click();

    // Category pills should appear
    await expect(appPage.getByRole("button", { name: "All", exact: true })).toBeVisible();

    // Click "Testing" category to filter
    await appPage.locator("button", { hasText: "Testing" }).first().click();

    // Only test-prompt should show
    await expect(appPage.getByText("test-prompt")).toBeVisible();
    await expect(appPage.getByText("review-prompt")).not.toBeVisible();
  });

  test("closes prompt library with Close button", async ({ appPage }) => {
    // Open prompt library
    await appPage.getByTitle("Add file or context").click();
    await appPage.getByText("Prompt Library").click();

    await expect(
      appPage.getByText("No prompts saved yet. Create one to get started."),
    ).toBeVisible();

    // Click Close
    await appPage.locator("button", { hasText: "Close" }).click();

    // Dialog should be gone
    await expect(
      appPage.getByText("No prompts saved yet. Create one to get started."),
    ).not.toBeVisible();
  });

  test("slash command /prompt: autocomplete shows saved prompts", async ({
    appPage,
  }) => {
    // Seed a prompt
    await appPage.evaluate(() => {
      (window as any).__E2E_PROMPTS__ = [
        {
          id: "p-1",
          name: "quick-fix",
          content: "Fix the bug in this code",
          description: "Quick bug fix",
          category: null,
          tags: [],
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    // Reload prompts by briefly opening the prompt library
    await appPage.getByTitle("Add file or context").click();
    await appPage.getByText("Prompt Library").click();
    await expect(appPage.getByText("quick-fix")).toBeVisible();
    await appPage.locator("button", { hasText: "Close" }).click();

    // Type /prompt: in the composer to trigger autocomplete
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );
    await textarea.fill("/prompt:");

    // The prompt command should appear in autocomplete
    await expect(appPage.getByText("/prompt:quick-fix")).toBeVisible();
  });
});
