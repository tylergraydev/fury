import type { Page } from "@playwright/test";

/**
 * Emit a mock agent status event.
 * The agentStore listens on `agent-status:{workspaceId}`.
 */
export async function emitAgentStatus(
  page: Page,
  workspaceId: string,
  status: "Idle" | "Running" | "Stopping" | { Error: string },
) {
  await page.evaluate(
    ([eventName, payload]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, payload);
    },
    [`agent-status:${workspaceId}`, { workspaceId, status }] as const,
  );
}

/**
 * Emit a streaming assistant text event.
 * The chatStore listens on `agent-stream:{workspaceId}`.
 */
export async function emitStreamText(
  page: Page,
  workspaceId: string,
  text: string,
) {
  await page.evaluate(
    ([eventName, payload]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, payload);
    },
    [`agent-stream:${workspaceId}`, { type: "assistantText", text }] as const,
  );
}

/**
 * Emit a tool use event in the agent stream.
 */
export async function emitToolUse(
  page: Page,
  workspaceId: string,
  tool: { id: string; name: string; input: unknown },
) {
  await page.evaluate(
    ([eventName, payload]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, payload);
    },
    [
      `agent-stream:${workspaceId}`,
      { type: "toolUse", id: tool.id, name: tool.name, input: tool.input },
    ] as const,
  );
}

/**
 * Emit a tool result event in the agent stream.
 */
export async function emitToolResult(
  page: Page,
  workspaceId: string,
  result: { toolUseId: string; content: string },
) {
  await page.evaluate(
    ([eventName, payload]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, payload);
    },
    [
      `agent-stream:${workspaceId}`,
      {
        type: "toolResult",
        toolUseId: result.toolUseId,
        content: result.content,
      },
    ] as const,
  );
}

/**
 * Emit a permission request event in the agent stream.
 */
export async function emitPermissionRequest(
  page: Page,
  workspaceId: string,
  toolName: string,
  input: unknown = {},
  suggestions?: unknown[],
) {
  // Use stringified args to avoid Playwright serialization issues with nested objects
  const eventName = `agent-stream:${workspaceId}`;
  const payload = JSON.stringify(
    suggestions
      ? { type: "permissionRequest", toolName, input, suggestions }
      : { type: "permissionRequest", toolName, input },
  );
  await page.evaluate(
    ([eventName, payloadStr]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, JSON.parse(payloadStr));
    },
    [eventName, payload] as const,
  );
}

/**
 * Emit an AskFollowupQuestion tool use event.
 * Triggers the QuestionCard in the Composer.
 */
export async function emitQuestionToolUse(
  page: Page,
  workspaceId: string,
  question: string,
  options?: string[],
) {
  await emitToolUse(page, workspaceId, {
    id: `ask-${Date.now()}`,
    name: "AskFollowupQuestion",
    input: { question, ...(options ? { options } : {}) },
  });
}

/**
 * Emit an ExitPlanMode tool use event.
 * Triggers plan approval UI in the Composer.
 */
export async function emitPlanApproval(
  page: Page,
  workspaceId: string,
) {
  await emitToolUse(page, workspaceId, {
    id: `exitplan-${Date.now()}`,
    name: "ExitPlanMode",
    input: {},
  });
}

/**
 * Emit a test runner event.
 * The testRunnerStore listens on `test-runner:{contextId}`.
 */
export async function emitTestRunEvent(
  page: Page,
  contextId: string,
  payload: unknown,
) {
  const eventName = `test-runner:${contextId}`;
  const payloadStr = JSON.stringify(payload);
  await page.evaluate(
    ([eventName, payloadStr]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, JSON.parse(payloadStr));
    },
    [eventName, payloadStr] as const,
  );
}

/**
 * Emit a result event (agent finished) in the agent stream.
 */
export async function emitResult(
  page: Page,
  workspaceId: string,
  options?: { isError?: boolean; result?: string },
) {
  await page.evaluate(
    ([eventName, payload]) => {
      (window as any).__E2E_EMIT_EVENT__(eventName, payload);
    },
    [
      `agent-stream:${workspaceId}`,
      {
        type: "result",
        isError: options?.isError ?? false,
        result: options?.result ?? null,
        sessionId: "session-e2e",
      },
    ] as const,
  );
}
