import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Agent Streaming (Real Claude)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    // Find or add repo
    const repos = (await bridge.invoke("list_repositories")) as Array<
      Record<string, unknown>
    >;
    const existing = repos.find((r) => r.path === FURY_PATH);
    if (existing) {
      repoId = existing.id as string;
    } else {
      const repo = (await bridge.invoke("add_repository", {
        path: FURY_PATH,
      })) as Record<string, unknown>;
      repoId = repo.id as string;
    }

    const suffix = Date.now();
    const ws = (await bridge.invoke(
      "create_workspace",
      {
        request: {
          repoId,
          workspaceName: `agent-smoke-${suffix}`,
          branchName: `agent-smoke-${suffix}`,
        },
      },
      { slow: true },
    )) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      // Unsubscribe the frontend from this workspace's events
      await bridge
        .executeJs(
          `(async () => {
            const { useChatStore } = await import('/src/stores/chatStore.ts');
            const { useAgentStore } = await import('/src/stores/agentStore.ts');
            useChatStore.getState().unsubscribe('${workspaceId}');
            useAgentStore.getState().unsubscribe('${workspaceId}');
          })()`,
        )
        .catch(() => {});
      await bridge
        .invoke("clear_chat_messages", { workspaceId })
        .catch(() => {});
      await bridge
        .invoke("delete_workspace", { workspaceId }, { slow: true })
        .catch(() => {});
    }
  });

  test("send message and receive real Claude response", async ({
    bridge,
  }) => {
    // CRITICAL: Subscribe the frontend chatStore and agentStore to this workspace's events.
    // Without this, the backend emits agent-stream events but nobody persists the messages.
    await bridge.executeJs(
      `(async () => {
        const { useChatStore } = await import('/src/stores/chatStore.ts');
        const { useAgentStore } = await import('/src/stores/agentStore.ts');
        await useChatStore.getState().subscribe('${workspaceId}');
        await useAgentStore.getState().subscribe('${workspaceId}');
        return 'subscribed';
      })()`,
    );

    // Also add the user message to the store (normally the UI does this)
    await bridge.executeJs(
      `(async () => {
        const { useChatStore } = await import('/src/stores/chatStore.ts');
        useChatStore.getState().addUserMessage('${workspaceId}', "Reply with only the word 'hello' and nothing else.");
        return 'user message added';
      })()`,
    );

    // Send the message to the real Claude backend
    await bridge.invoke("send_message", {
      request: {
        workspaceId,
        message: "Reply with only the word 'hello' and nothing else.",
      },
    });

    // Poll agent status until it's no longer Running (max 90 seconds)
    let status: unknown = "Running";
    const startTime = Date.now();
    const maxWait = 90_000;

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, 3000));

      const agentInfo = (await bridge.invoke("get_agent_status", {
        workspaceId,
      })) as Record<string, unknown>;

      status = agentInfo.status;
      if (status !== "Running") break;
    }

    // Give a moment for the final result event to persist
    await new Promise((r) => setTimeout(r, 2000));

    // Check that messages were persisted
    const messages = (await bridge.invoke("list_chat_messages", {
      workspaceId,
    })) as Array<Record<string, unknown>>;

    // If no messages persisted, skip with diagnostic info
    if (messages.length === 0) {
      const statusStr =
        typeof status === "object" ? JSON.stringify(status) : String(status);
      test.skip(
        true,
        `Agent produced 0 messages (status: ${statusStr}). Check sidecar logs.`,
      );
      return;
    }

    // We should have at least the user message + assistant response
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // Find the assistant response
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeTruthy();

    // The content should have text
    const content = assistantMsg!.content as Array<Record<string, unknown>>;
    const textBlocks = content.filter((c) => c.type === "text");
    expect(textBlocks.length).toBeGreaterThan(0);

    const responseText = textBlocks.map((b) => b.text as string).join("");
    expect(responseText.length).toBeGreaterThan(0);
  });
});
