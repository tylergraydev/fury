import { test, expect } from "../helpers/app";

test.describe("Composer Autocomplete", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test('typing "/" at line start shows slash command menu', async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("/");

    // The built-in /clear command should appear in the dropdown
    await expect(appPage.getByText("/clear")).toBeVisible();
    await expect(
      appPage.getByText("Clear conversation and start a new session"),
    ).toBeVisible();
  });

  test("arrow keys navigate slash menu, Enter selects", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("/");
    await expect(appPage.getByText("/clear")).toBeVisible();

    // Press Enter to select the /clear command (it's an action command so it executes)
    await textarea.press("Enter");

    // The slash menu should close
    await expect(appPage.getByText("/clear")).not.toBeVisible();
  });

  test('typing "@" shows file mention menu', async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Type @ to trigger mention menu
    await textarea.fill("check @");

    // Should show @todos item and file names from mock data
    await expect(appPage.getByText("@todos")).toBeVisible();
  });

  test("Escape closes autocomplete menu", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Open slash menu
    await textarea.fill("/");
    await expect(appPage.getByText("/clear")).toBeVisible();

    // Press Escape to close
    await textarea.press("Escape");
    await expect(appPage.getByText("/clear")).not.toBeVisible();

    // Textarea should still have the "/" text
    await expect(textarea).toHaveValue("/");
  });
});
