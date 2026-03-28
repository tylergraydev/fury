import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Chat Persistence (Real Backend)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<Record<string, unknown>>;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing ? (existing.id as string) : ((await bridge.invoke("add_repository", { path: FURY_PATH })) as Record<string, unknown>).id as string;

    const suffix = Date.now();
    const ws = (await bridge.invoke("create_workspace", {
      request: { repoId, workspaceName: `chat-test-${suffix}`, branchName: `chat-test-${suffix}` },
    }, { slow: true })) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge.invoke("clear_chat_messages", { workspaceId }).catch(() => {});
      await bridge.invoke("delete_workspace", { workspaceId }, { slow: true }).catch(() => {});
    }
  });

  test("save and retrieve a chat message round-trip", async ({ bridge }) => {
    const msgId = crypto.randomUUID();
    await bridge.invoke("save_chat_message", {
      message: {
        id: msgId,
        workspaceId,
        role: "user",
        content: [{ type: "text", text: "Hello from integration test" }],
        timestamp: new Date().toISOString(),
      },
    });

    const messages = (await bridge.invoke("list_chat_messages", { workspaceId })) as Array<Record<string, unknown>>;
    const found = messages.find((m) => m.id === msgId);
    expect(found).toBeTruthy();
    expect(found!.role).toBe("user");

    const content = found!.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("Hello from integration test");
  });

  test("search_chat_messages finds saved message", async ({ bridge }) => {
    const results = (await bridge.invoke("search_chat_messages", {
      query: "integration test",
      workspaceId,
    })) as Array<Record<string, unknown>>;

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].matchedText).toContain("integration test");
  });

  test("clear_chat_messages removes all messages", async ({ bridge }) => {
    await bridge.invoke("clear_chat_messages", { workspaceId });

    const messages = (await bridge.invoke("list_chat_messages", { workspaceId })) as Array<Record<string, unknown>>;
    expect(messages.length).toBe(0);
  });
});
