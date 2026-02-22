import { test, expect } from "../helpers/app";
import {
  emitAgentStatus,
  emitStreamText,
  emitToolUse,
  emitToolResult,
  emitResult,
} from "../helpers/events";

test.describe("Tool Calls", () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("expand tool call shows input and result sections", async ({
    appPage,
  }) => {
    // The pre-seeded assistant message has a Read tool call with summary "routes/index.ts"
    const readTool = appPage.locator("button", { hasText: "Read" }).first();
    await expect(readTool).toBeVisible();

    // Click to expand
    await readTool.click();

    // Should show Input and Result headings
    await expect(appPage.getByText("Input").first()).toBeVisible();
    await expect(appPage.getByText("Result").first()).toBeVisible();

    // Result content from mock data
    await expect(appPage.getByText("express", { exact: false }).first()).toBeVisible();
  });

  test("collapse tool call hides details", async ({ appPage }) => {
    const readTool = appPage.locator("button", { hasText: "Read" }).first();
    // Expand
    await readTool.click();
    await expect(appPage.getByText("Input").first()).toBeVisible();

    // Collapse
    await readTool.click();
    // Input/Result should no longer be visible (the detail panel is removed from DOM)
    await expect(
      appPage.locator(".ml-5", { hasText: "Input" }),
    ).not.toBeVisible();
  });

  test("tool name badge shows normalized name with summary", async ({
    appPage,
  }) => {
    // Read tool should show file path summary
    const readTool = appPage.locator("button", { hasText: "Read" }).first();
    await expect(readTool).toBeVisible();
    await expect(readTool.getByText("routes/index.ts")).toBeVisible();

    // Write tool should show file path summary
    const writeTool = appPage.locator("button", { hasText: "Write" }).first();
    await expect(writeTool).toBeVisible();
    await expect(writeTool.getByText("middleware/auth.ts")).toBeVisible();
  });

  test("multiple tool calls each expand independently", async ({
    appPage,
  }) => {
    const readTool = appPage.locator("button", { hasText: "Read" }).first();
    const writeTool = appPage.locator("button", { hasText: "Write" }).first();

    // Expand Read
    await readTool.click();
    // Read's detail should be visible
    const readDetail = appPage.locator(".ml-5").first();
    await expect(readDetail.getByText("Input")).toBeVisible();

    // Expand Write too
    await writeTool.click();
    // Both should have their details visible
    const allDetails = appPage.locator(".ml-5");
    await expect(allDetails).toHaveCount(2);
  });

  test("streamed tool calls appear during agent response", async ({
    appPage,
  }) => {
    // Send a new message to start a fresh agent interaction
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );
    await textarea.fill("List all TypeScript files");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");

    // Stream a Glob tool use
    await emitStreamText(appPage, "ws-auth", "Let me find the TypeScript files. ");
    await emitToolUse(appPage, "ws-auth", {
      id: "t-glob-1",
      name: "Glob",
      input: { pattern: "**/*.ts" },
    });
    await emitToolResult(appPage, "ws-auth", {
      toolUseId: "t-glob-1",
      content: "src/index.ts\nsrc/lib/api.ts\nsrc/routes/index.ts",
    });

    // Stream a Bash tool use
    await emitToolUse(appPage, "ws-auth", {
      id: "t-bash-1",
      name: "Bash",
      input: { command: "wc -l src/**/*.ts" },
    });
    await emitToolResult(appPage, "ws-auth", {
      toolUseId: "t-bash-1",
      content: "  42 total",
    });

    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Glob and Bash tool badges should appear
    await expect(
      appPage.locator("button", { hasText: "Glob" }).first(),
    ).toBeVisible();
    await expect(
      appPage.locator("button", { hasText: "Bash" }).first(),
    ).toBeVisible();

    // Expand Bash to verify summary
    const bashTool = appPage.locator("button", { hasText: "Bash" }).first();
    await bashTool.click();
    await expect(appPage.getByText("42 total")).toBeVisible();
  });
});
