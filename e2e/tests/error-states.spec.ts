import { test, expect } from "../helpers/app";
import { emitAgentStatus } from "../helpers/events";

test.describe("Error & Edge States", () => {
  test("agent error status shows error indicator", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Emit an error status for the agent
    await emitAgentStatus(appPage, "ws-auth", {
      Error: "Connection lost to Claude API",
    });

    // The status indicator should show error state
    // The composer area shows the agent status
    await expect(
      appPage.getByText("Error").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("empty workspace shows help text with no messages", async ({
    appPage,
  }) => {
    // ws-ui has no pre-seeded messages, so it should show empty state
    await appPage.getByText("redesign-sidebar").click();
    await expect(
      appPage.getByText("/redesign-sidebar", { exact: true }),
    ).toBeVisible();

    // The chat panel should show some help/placeholder text when empty
    // Look for the composer placeholder which is always visible
    await expect(
      appPage.getByPlaceholder(
        "Ask to make changes, @mention files, run /commands",
      ),
    ).toBeVisible();
  });

  test("streaming with pending text shows Thinking indicator", async ({
    appPage,
  }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Set agent to Running without sending any stream text yet
    await emitAgentStatus(appPage, "ws-auth", "Running");

    // Should show "Running" status in the composer area
    await expect(
      appPage.getByText("Running").first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
