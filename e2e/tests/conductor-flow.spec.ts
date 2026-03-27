import { test, expect } from "../helpers/app";
import {
  emitAgentStatus,
  emitStreamText,
  emitToolUse,
  emitQuestionToolUse,
  emitPlanApproval,
  emitResult,
} from "../helpers/events";

test.describe("Conductor Flow", () => {
  test.beforeEach(async ({ appPage }) => {
    // Navigate to the add-auth workspace
    await appPage.getByText("add-auth").click();
    await expect(
      appPage.getByText("/add-auth", { exact: true }),
    ).toBeVisible();
  });

  test("question card appears when AskFollowupQuestion tool is called", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Add a new settings page");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitStreamText(appPage, "ws-auth", "Let me understand your requirements.");

    // Emit the question tool use
    await emitQuestionToolUse(
      appPage,
      "ws-auth",
      "What framework are you using for the frontend?",
      ["React", "Vue", "Svelte"],
    );
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Question card should be visible
    await expect(appPage.getByText("Question from agent")).toBeVisible();
    await expect(
      appPage.getByText("What framework are you using for the frontend?"),
    ).toBeVisible();

    // Option pills should be visible
    await expect(appPage.getByRole("button", { name: "React" })).toBeVisible();
    await expect(appPage.getByRole("button", { name: "Vue" })).toBeVisible();
    await expect(appPage.getByRole("button", { name: "Svelte" })).toBeVisible();

    // Custom answer input should be visible
    await expect(
      appPage.getByPlaceholder("Type a custom answer..."),
    ).toBeVisible();

    // Normal composer textarea should be hidden
    await expect(textarea).not.toBeVisible();
  });

  test("clicking an option pill sends the answer and restores composer", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Capture send_message IPC calls
    await appPage.evaluate(() => {
      (window as any).__SEND_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "send_message") {
          (window as any).__SEND_CALLS__.push({ cmd, args });
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await textarea.fill("Build me a dashboard");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitQuestionToolUse(appPage, "ws-auth", "Which chart library?", [
      "Recharts",
      "Chart.js",
    ]);
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Click the option pill
    await appPage.getByRole("button", { name: "Recharts" }).click();

    // Verify the answer was sent
    const calls = await appPage.evaluate(() => (window as any).__SEND_CALLS__);
    const answerCall = calls.find(
      (c: any) => c.args.request?.message === "Recharts",
    );
    expect(answerCall).toBeTruthy();

    // Question card should be gone, textarea restored
    await expect(appPage.getByText("Question from agent")).not.toBeVisible();
    await expect(appPage.locator(".composer-textarea")).toBeVisible();
  });

  test("custom answer via text input sends the answer", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Capture send_message IPC calls
    await appPage.evaluate(() => {
      (window as any).__SEND_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "send_message") {
          (window as any).__SEND_CALLS__.push({ cmd, args });
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await textarea.fill("Add authentication");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitQuestionToolUse(
      appPage,
      "ws-auth",
      "What auth provider do you prefer?",
      ["Auth0", "Firebase"],
    );
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Type a custom answer
    const customInput = appPage.getByPlaceholder("Type a custom answer...");
    await customInput.fill("Supabase Auth");
    await customInput.press("Enter");

    // Verify the custom answer was sent
    const calls = await appPage.evaluate(() => (window as any).__SEND_CALLS__);
    const answerCall = calls.find(
      (c: any) => c.args.request?.message === "Supabase Auth",
    );
    expect(answerCall).toBeTruthy();

    // Question card should be gone
    await expect(appPage.getByText("Question from agent")).not.toBeVisible();
  });

  test("plan message styled as card when ExitPlanMode detected", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Add a caching layer");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");

    // Stream some plan content
    await emitStreamText(
      appPage,
      "ws-auth",
      "## Plan\n\n1. Add Redis client\n2. Create cache middleware\n3. Wire up routes",
    );

    // Emit ExitPlanMode to trigger plan approval
    await emitPlanApproval(appPage, "ws-auth");

    // Emit result so agent finishes
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Plan card should have "Implementation Plan" header
    await expect(appPage.getByText("Implementation Plan")).toBeVisible();

    // Plan approval bar should be visible with enhanced buttons
    await expect(
      appPage.getByText("Review the plan above, then approve or request changes"),
    ).toBeVisible();
    await expect(
      appPage.getByRole("button", { name: "Approve" }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("button", { name: "Request Changes" }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("button", { name: "Copy" }),
    ).toBeVisible();
  });

  test("approve button sends yes message", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    // Capture send_message IPC calls
    await appPage.evaluate(() => {
      (window as any).__SEND_CALLS__ = [];
      const origInvoke = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = function (cmd: string, args: any) {
        if (cmd === "send_message") {
          (window as any).__SEND_CALLS__.push({ cmd, args });
        }
        return origInvoke.call(this, cmd, args);
      };
    });

    await textarea.fill("Refactor the API");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitStreamText(appPage, "ws-auth", "Here is my plan for the refactor.");
    await emitPlanApproval(appPage, "ws-auth");
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Click Approve
    await appPage.getByRole("button", { name: "Approve" }).click();

    // Verify "yes" was sent
    const calls = await appPage.evaluate(() => (window as any).__SEND_CALLS__);
    const approveCall = calls.find((c: any) => c.args.request?.message === "yes");
    expect(approveCall).toBeTruthy();
  });

  test("request changes button focuses textarea", async ({ appPage }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Add tests");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");
    await emitStreamText(appPage, "ws-auth", "Plan: write unit tests for auth module.");
    await emitPlanApproval(appPage, "ws-auth");
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Click Request Changes
    await appPage.getByRole("button", { name: "Request Changes" }).click();

    // The plan adjustment textarea should be focused
    const planTextarea = appPage.getByPlaceholder(
      "Enter your plan adjustments here...",
    );
    await expect(planTextarea).toBeFocused();
  });

  test("research indicator shows during research phase", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Add dark mode");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");

    // Simulate Think tool (starts research phase)
    await emitToolUse(appPage, "ws-auth", {
      id: "think-1",
      name: "Think",
      input: { thought: "Let me analyze the codebase..." },
    });

    // Simulate Read tool (continues research)
    await emitToolUse(appPage, "ws-auth", {
      id: "read-1",
      name: "Read",
      input: { file_path: "/src/lib/themes.ts" },
    });

    // Research indicator should be visible with operation count
    await expect(appPage.getByText("Researching codebase...")).toBeVisible();
    await expect(appPage.getByText("2 operations")).toBeVisible();
  });

  test("question card without options shows only text input", async ({
    appPage,
  }) => {
    const textarea = appPage.getByPlaceholder(
      "Ask to make changes, @mention files, run /commands",
    );

    await textarea.fill("Build a feature");
    await textarea.press("Enter");

    await emitAgentStatus(appPage, "ws-auth", "Running");

    // Emit question without options
    await emitQuestionToolUse(
      appPage,
      "ws-auth",
      "Can you describe the feature in more detail?",
    );
    await emitResult(appPage, "ws-auth");
    await emitAgentStatus(appPage, "ws-auth", "Idle");

    // Question text should be visible
    await expect(
      appPage.getByText("Can you describe the feature in more detail?"),
    ).toBeVisible();

    // Custom input should be visible
    await expect(
      appPage.getByPlaceholder("Type a custom answer..."),
    ).toBeVisible();

    // No option pills should exist (no roles with pill-like button besides system ones)
    // The question card should only have the send button and the text input
    await expect(appPage.getByText("Question from agent")).toBeVisible();
  });
});
