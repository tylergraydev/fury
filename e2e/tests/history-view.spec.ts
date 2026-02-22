import { test, expect } from "../helpers/app";

test.describe("History View", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Open History view via command palette
    await appPage.keyboard.press("Control+k");
    await appPage.locator(".command-palette").getByText("Open History").click();
  });

  test("shows Activity Timeline header with Refresh button", async ({
    appPage,
  }) => {
    await expect(appPage.getByText("Activity Timeline")).toBeVisible();
    await expect(
      appPage.locator("button", { hasText: "Refresh" }),
    ).toBeVisible();
  });

  test("displays chat messages in timeline", async ({ appPage }) => {
    // Pre-seeded chat messages should appear in the timeline
    // The user message about JWT auth
    await expect(
      appPage.getByText("Add JWT authentication to the API routes"),
    ).toBeVisible();

    // The "You" label for user messages
    await expect(appPage.getByText("You").first()).toBeVisible();

    // The "Claude" label for assistant messages
    await expect(appPage.getByText("Claude").first()).toBeVisible();
  });

  test("shows tool call count badge for assistant messages", async ({
    appPage,
  }) => {
    // The assistant message has 2 tool calls (Read + Write)
    await expect(appPage.getByText("2 tool calls")).toBeVisible();
  });
});
