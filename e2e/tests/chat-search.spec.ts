import { test, expect } from "../helpers/app";

test.describe("Chat Search", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to ws-auth which has pre-seeded chat messages
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("search button opens popup with input and hint text", async ({
    appPage,
  }) => {
    await appPage.getByLabel("Search messages").click();

    const searchInput = appPage.getByPlaceholder("Search messages...");
    await expect(searchInput).toBeVisible();
    await expect(
      appPage.getByText("Type to search conversation history"),
    ).toBeVisible();
  });

  test("typing a query returns matching results", async ({ appPage }) => {
    await appPage.getByLabel("Search messages").click();

    const searchInput = appPage.getByPlaceholder("Search messages...");
    await searchInput.fill("JWT");

    // Wait for debounce (300ms) + render
    await appPage.waitForTimeout(500);

    // Should show results matching the mock message about JWT authentication
    await expect(
      appPage.getByText(/JWT authentication/i).first(),
    ).toBeVisible();
  });

  test("no results shows empty state", async ({ appPage }) => {
    await appPage.getByLabel("Search messages").click();

    const searchInput = appPage.getByPlaceholder("Search messages...");
    await searchInput.fill("xyznonexistent");

    await appPage.waitForTimeout(500);

    await expect(appPage.getByText("No results found")).toBeVisible();
  });

  test("search all workspaces toggle is visible", async ({ appPage }) => {
    await appPage.getByLabel("Search messages").click();

    await expect(
      appPage.getByText("Search all workspaces"),
    ).toBeVisible();
  });

  test("Escape closes search popup", async ({ appPage }) => {
    await appPage.getByLabel("Search messages").click();

    const searchInput = appPage.getByPlaceholder("Search messages...");
    await expect(searchInput).toBeVisible();

    await appPage.keyboard.press("Escape");
    await expect(searchInput).not.toBeVisible();
  });
});
