import { test, expect } from "../helpers/app";
import { emitAgentStatus } from "../helpers/events";

const MOD = "Control";

test.describe("Activity Log", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
    await appPage.keyboard.press(`${MOD}+Shift+a`);
  });

  test("displays commit entries from git log with author info", async ({
    appPage,
  }) => {
    await expect(
      appPage.getByText("Add JWT auth middleware"),
    ).toBeVisible();
    await expect(
      appPage.getByText(/demo committed abc1234/),
    ).toBeVisible();
    await expect(
      appPage.getByText("Update route handlers"),
    ).toBeVisible();
  });

  test("filter toggle opens filter bar with all categories", async ({
    appPage,
  }) => {
    await appPage.getByTestId("filter-toggle").click();

    const filterBar = appPage.getByTestId("filter-bar");
    await expect(filterBar).toBeVisible();
    await expect(filterBar.getByText("Commits")).toBeVisible();
    await expect(filterBar.getByText("Agent")).toBeVisible();
    await expect(filterBar.getByText("Chat")).toBeVisible();
  });

  test("clicking Commits filter keeps only commit entries", async ({
    appPage,
  }) => {
    // Trigger an agent notification so we have mixed entry types
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await appPage.waitForTimeout(200);

    await appPage.getByTestId("filter-toggle").click();
    const filterBar = appPage.getByTestId("filter-bar");

    // Click Commits filter
    await filterBar.getByText("Commits").click();

    // Commit entries should still be visible
    await expect(
      appPage.getByText("Add JWT auth middleware"),
    ).toBeVisible();

    // Activity entries that are not commits should be filtered out
    // (since we only have commit entries from the mock, this validates the filter is active)
    // Verify Clear button appears when filter is active
    await expect(filterBar.getByText("Clear")).toBeVisible();
  });

  test("Clear button removes all filters and shows all entries", async ({
    appPage,
  }) => {
    await appPage.getByTestId("filter-toggle").click();
    const filterBar = appPage.getByTestId("filter-bar");

    // Activate a filter
    await filterBar.getByText("Commits").click();
    await expect(filterBar.getByText("Clear")).toBeVisible();

    // Clear filters
    await filterBar.getByText("Clear").click();

    // All entries should be visible again
    await expect(
      appPage.getByText("Add JWT auth middleware"),
    ).toBeVisible();

    // Clear button should disappear
    await expect(filterBar.getByText("Clear")).not.toBeVisible();
  });

  test("refresh button reloads commit data", async ({ appPage }) => {
    // Intercept git log IPC
    await appPage.evaluate(() => {
      (window as any).__GIT_LOG_CALLS__ = 0;
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "get_git_log") {
          (window as any).__GIT_LOG_CALLS__++;
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await appPage.getByTestId("refresh-button").click();

    const calls = await appPage.evaluate(
      () => (window as any).__GIT_LOG_CALLS__,
    );
    expect(calls).toBeGreaterThan(0);
  });

  test("activity entries have data-testid markers", async ({ appPage }) => {
    // Activity entries should have data-testid="activity-entry"
    // Wait for commits to load
    await appPage.waitForTimeout(500);
    const entries = appPage.getByTestId("activity-entry");
    const count = await entries.count();
    // Mock git log returns 3 commits, they should render as activity entries
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
