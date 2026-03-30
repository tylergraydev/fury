import { test, expect } from "../helpers/app";
import { emitAgentStatus } from "../helpers/events";

test.describe("Notifications", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("notification bell is visible in top bar", async ({ appPage }) => {
    await expect(appPage.getByTestId("notification-bell")).toBeVisible();

    // No badge when there are no notifications
    await expect(
      appPage.getByTestId("notification-badge"),
    ).not.toBeVisible();
  });

  test("clicking bell opens panel with empty state", async ({ appPage }) => {
    await appPage.getByTestId("notification-bell").click();

    const panel = appPage.getByTestId("notification-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("No notifications")).toBeVisible();
  });

  test("shows unread badge after agent completes", async ({ appPage }) => {
    // Transition agent from Running -> Idle to trigger agent-complete notification
    await emitAgentStatus(appPage, "ws-auth", "Running");
    // Small delay for store subscription to register the "Running" state
    await appPage.waitForTimeout(100);
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Badge should appear on the bell
    await expect(appPage.getByTestId("notification-badge")).toBeVisible();
    await expect(appPage.getByTestId("notification-badge")).toHaveText("1");

    // Open panel — should show the notification
    await appPage.getByTestId("notification-bell").click();
    await expect(appPage.getByTestId("notification-panel")).toBeVisible();
    await expect(appPage.getByText("Agent completed")).toBeVisible();
  });

  test("mark all read clears unread badge", async ({ appPage }) => {
    // Trigger a notification
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await appPage.waitForTimeout(100);
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    await expect(appPage.getByTestId("notification-badge")).toBeVisible();

    // Open panel and mark all read
    await appPage.getByTestId("notification-bell").click();
    await appPage.getByText("Mark all read").click();

    // Badge should disappear
    await expect(
      appPage.getByTestId("notification-badge"),
    ).not.toBeVisible();
  });

  test("clear removes all notifications", async ({ appPage }) => {
    // Trigger a notification
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await appPage.waitForTimeout(100);
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Open panel and clear
    await appPage.getByTestId("notification-bell").click();
    const panel = appPage.getByTestId("notification-panel");
    await panel.getByText("Clear").click();

    // Should show empty state
    await expect(panel.getByText("No notifications")).toBeVisible();
  });

  test("panel closes on Escape key", async ({ appPage }) => {
    await appPage.getByTestId("notification-bell").click();
    await expect(appPage.getByTestId("notification-panel")).toBeVisible();

    await appPage.keyboard.press("Escape");
    await expect(
      appPage.getByTestId("notification-panel"),
    ).not.toBeVisible();
  });

  test("panel closes when clicking outside", async ({ appPage }) => {
    await appPage.getByTestId("notification-bell").click();
    await expect(appPage.getByTestId("notification-panel")).toBeVisible();

    // Click on the main content area (outside the panel)
    await appPage.locator("#root").click({ position: { x: 100, y: 300 } });
    await expect(
      appPage.getByTestId("notification-panel"),
    ).not.toBeVisible();
  });
});
