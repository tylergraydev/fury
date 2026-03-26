import { test, expect } from "../helpers/app";
import {
  emitAgentStatus,
  emitStreamText,
  emitPermissionRequest,
  emitResult,
} from "../helpers/events";

test.describe("Permission Flow", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to the add-auth workspace
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("shows permission bar when permission request received", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Send a message to start the agent
    await textarea.fill("Fix the bug in auth.ts");
    await textarea.press("Enter");

    // Simulate agent becoming Running
    await emitAgentStatus(appPage, "ws-auth", "Running");

    // Simulate some streaming text
    await emitStreamText(appPage, "ws-auth", "I'll fix the bug in auth.ts. ");

    // Simulate a permission request for file write
    await emitPermissionRequest(appPage, "ws-auth", "write_file", {
      file_path: "/src/auth.ts",
    });

    // The permission bar should appear with the tool name
    await expect(appPage.getByText("write_file")).toBeVisible();
    await expect(appPage.getByRole("button", { name: "Allow" })).toBeVisible();
    await expect(appPage.getByRole("button", { name: "Deny" })).toBeVisible();
  });

  test("allow button clears permission bar", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Fix the bug");
    await textarea.press("Enter");
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitPermissionRequest(appPage, "ws-auth", "shell_exec", {
      command: "npm test",
    });

    // Permission bar should be visible
    await expect(appPage.getByText("shell_exec")).toBeVisible();

    // Click Allow button
    await appPage.getByRole("button", { name: "Allow" }).click();

    // After allowing, simulate the agent continuing and finishing
    await emitStreamText(appPage, "ws-auth", "Running tests now...");
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Permission bar should be gone
    await expect(appPage.getByText("shell_exec")).not.toBeVisible();
  });

  test("deny button clears permission bar", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Delete everything");
    await textarea.press("Enter");
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitPermissionRequest(appPage, "ws-auth", "bash", {
      command: "rm -rf /",
    });

    // Permission bar should be visible
    await expect(appPage.getByText("bash")).toBeVisible();

    // Click Deny button
    await appPage.getByRole("button", { name: "Deny" }).click();

    // Simulate agent finishing after denial
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Permission bar should be gone
    await expect(appPage.getByText("bash")).not.toBeVisible();
  });

  test("permission bar disappears on result event", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Do something");
    await textarea.press("Enter");
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitPermissionRequest(appPage, "ws-auth", "write_file");

    await expect(appPage.getByText("write_file")).toBeVisible();

    // Agent finishes (e.g., timed out) — permission bar should clear
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    await expect(appPage.getByText("write_file")).not.toBeVisible();
  });
});
