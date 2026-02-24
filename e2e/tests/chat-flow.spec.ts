import { test, expect } from "../helpers/app";
import {
  emitAgentStatus,
  emitStreamText,
  emitToolUse,
  emitToolResult,
  emitResult,
} from "../helpers/events";

test.describe("Chat Flow", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to the add-auth workspace
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("displays pre-seeded messages with tool calls", async ({ appPage }) => {
    // User message
    await expect(
      appPage.getByText("Add JWT authentication to the API routes"),
    ).toBeVisible();

    // Assistant text
    await expect(
      appPage.getByText("examining the current route structure"),
    ).toBeVisible();

    // Completed turns are collapsed — expand to see tool call badges
    await appPage.getByText("2 tool calls").click();
    await expect(appPage.locator("button", { hasText: "Read" }).first()).toBeVisible();
    await expect(appPage.locator("button", { hasText: "Write" }).first()).toBeVisible();
  });

  test("typing a message enables send button", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );
    const sendButton = appPage.locator("button[title='Send message']");

    // Initially the send button should be styled as disabled
    await expect(textarea).toBeVisible();

    // Type a message
    await textarea.fill("Can you add rate limiting?");

    // Send button should now be clickable
    await expect(sendButton).toBeEnabled();
  });

  test("sending a message adds user bubble and clears input", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Add rate limiting to the auth middleware");
    await textarea.press("Enter");

    // New user message should appear in the chat
    await expect(
      appPage.getByText("Add rate limiting to the auth middleware"),
    ).toBeVisible();

    // Textarea should be cleared
    await expect(textarea).toHaveValue("");
  });

  test("simulated assistant response streams in real time", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Send a message
    await textarea.fill("Add tests for the auth middleware");
    await textarea.press("Enter");
    await expect(
      appPage.getByText("Add tests for the auth middleware"),
    ).toBeVisible();

    // Simulate agent becoming Running
    await emitAgentStatus(appPage, "ws-auth", "Running");
    await expect(appPage.getByTitle("Stop")).toBeVisible();

    // Simulate streaming assistant text
    await emitStreamText(
      appPage,
      "ws-auth",
      "I'll create comprehensive tests for the auth middleware. ",
    );

    // Simulate a tool use
    await emitToolUse(appPage, "ws-auth", {
      id: "t-test-1",
      name: "Write",
      input: { file_path: "/src/middleware/__tests__/auth.test.ts" },
    });

    await emitToolResult(appPage, "ws-auth", {
      toolUseId: "t-test-1",
      content: "File written successfully",
    });

    // Simulate agent finishing
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Verify the streamed text appeared
    await expect(
      appPage.getByText("comprehensive tests for the auth middleware"),
    ).toBeVisible();

    // Verify status returned to Idle (stop button disappears, placeholder restored)
    await expect(appPage.getByText("Stop")).not.toBeVisible();
    await expect(
      appPage.getByPlaceholder("Ask to make changes, @mention files, run /commands"),
    ).toBeEnabled();
  });
});
