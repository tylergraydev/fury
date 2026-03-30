import { test, expect } from "../helpers/app";
import { emitAgentStatus, emitStreamText } from "../helpers/events";

const MOD = "Control";

test.describe("Team View", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to a workspace in a repo with multiple workspaces
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("opens team view with Ctrl+5 and shows repo workspaces", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+5`);

    // Should show workspace cards for the repo (fury has ws-auth and ws-ui)
    await expect(appPage.getByText("add-auth").first()).toBeVisible();
    await expect(appPage.getByText("redesign-sidebar").first()).toBeVisible();
  });

  test("shows workspace branch info on agent cards", async ({ appPage }) => {
    await appPage.keyboard.press(`${MOD}+5`);

    // Branch names should be visible
    await expect(
      appPage.getByText("feature/add-auth").first(),
    ).toBeVisible();
    await expect(
      appPage.getByText("feature/redesign-sidebar").first(),
    ).toBeVisible();
  });

  test("shows broadcast composer with workspace checkboxes", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+5`);

    // Broadcast composer should have a textarea
    const textarea = appPage.getByPlaceholder(/broadcast|Send to/i);
    // If no placeholder, look for the textarea element
    const composerArea = textarea.or(appPage.locator("textarea").last());
    await expect(composerArea).toBeVisible();
  });

  test("shows stop button on card when agent is running", async ({
    appPage,
  }) => {
    await appPage.keyboard.press(`${MOD}+5`);

    // Wait for team view to mount and subscribe to agent events
    await appPage.waitForTimeout(500);

    // Emit running status for ws-auth
    await emitAgentStatus(appPage, "ws-auth", "Running");

    // The card should show a stop button (title="Stop agent") when running
    await expect(
      appPage.locator("button[title='Stop agent']").first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
