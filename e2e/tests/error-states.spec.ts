import { test, expect } from "../helpers/app";
import {
  emitAgentStatus,
  emitStreamText,
  emitResult,
} from "../helpers/events";

test.describe("Error & Edge States", () => {
  test("agent error status shows error indicator", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    await emitAgentStatus(appPage, "ws-auth", {
      Error: "Connection lost to Claude API",
    });

    await expect(
      appPage.locator("[title='Agent error']"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("agent recovers from error when set back to Idle", async ({
    appPage,
  }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Set error state
    await emitAgentStatus(appPage, "ws-auth", {
      Error: "API rate limit exceeded",
    });
    await expect(
      appPage.locator("[title='Agent error']"),
    ).toBeVisible({ timeout: 5000 });

    // Recover to Idle
    await emitAgentStatus(appPage, "ws-auth", "Idle");
    await expect(
      appPage.locator("[title='Agent error']"),
    ).not.toBeVisible();
  });

  test("empty workspace shows composer placeholder", async ({ appPage }) => {
    await appPage.getByText("redesign-sidebar").click();
    await expect(
      appPage.getByText("/redesign-sidebar", { exact: true }),
    ).toBeVisible();

    await expect(
      appPage.getByPlaceholder(
        "Ask to make changes, @mention files, run /commands",
      ),
    ).toBeVisible();
  });

  test("running agent shows stop button, idle hides it", async ({
    appPage,
  }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Running → stop button visible
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await expect(
      appPage.getByTitle("Stop"),
    ).toBeVisible({ timeout: 5000 });

    // Idle → stop button hidden
    await emitAgentStatus(appPage, "ws-auth", "Idle");
    await expect(appPage.getByTitle("Stop")).not.toBeVisible();
  });

  test("agent result with error emits notification", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    // Start agent, stream text, then error result
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await appPage.waitForTimeout(100);
    await emitStreamText(appPage, "ws-auth", "Analyzing code...");
    await emitResult(appPage, "ws-auth", {
      isError: true,
      result: "Process exited with code 1",
    });
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Streamed text should still be in the chat
    await expect(
      appPage.getByText("Analyzing code...").first(),
    ).toBeVisible();

    // Notification badge should appear (agent completed notification)
    await expect(
      appPage.getByTestId("notification-badge"),
    ).toBeVisible();
  });

  test("stopping state transitions correctly", async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();

    await emitAgentStatus(appPage, "ws-auth", "Running");
    await expect(appPage.getByTitle("Stop")).toBeVisible({ timeout: 5000 });

    // Transition to Stopping
    await emitAgentStatus(appPage, "ws-auth", "Stopping");
    await appPage.waitForTimeout(100);

    // Finally Idle
    await emitAgentStatus(appPage, "ws-auth", "Idle");
    await expect(appPage.getByTitle("Stop")).not.toBeVisible();
  });
});
