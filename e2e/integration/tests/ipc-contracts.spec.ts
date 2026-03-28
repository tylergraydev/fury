/**
 * IPC Contract Validation Tests
 *
 * These tests verify that the shape of data returned by Rust IPC commands
 * matches what the TypeScript frontend expects. Each test calls a real
 * IPC command and asserts the response has the correct fields and types.
 *
 * If a Rust struct is modified without updating the TS interface (or vice
 * versa), these tests will catch the mismatch.
 */
import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("IPC Contract Validation", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<
      Record<string, unknown>
    >;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing
      ? (existing.id as string)
      : (
          (await bridge.invoke("add_repository", {
            path: FURY_PATH,
          })) as Record<string, unknown>
        ).id as string;

    const suffix = Date.now();
    const ws = (await bridge.invoke(
      "create_workspace",
      {
        request: {
          repoId,
          workspaceName: `contract-test-${suffix}`,
          branchName: `contract-test-${suffix}`,
        },
      },
      { slow: true },
    )) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge
        .invoke("delete_workspace", { workspaceId }, { slow: true })
        .catch(() => {});
    }
  });

  // ─── Repository ────────────────────────────────────────────────────

  test("Repository shape matches TS interface", async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<
      Record<string, unknown>
    >;
    const repo = repos.find((r) => r.id === repoId)!;

    // interface Repository { id, name, path, defaultBranch, currentBranch, provider, remoteUrl }
    expect(typeof repo.id).toBe("string");
    expect(typeof repo.name).toBe("string");
    expect(typeof repo.path).toBe("string");
    expect(typeof repo.defaultBranch).toBe("string");
    // currentBranch can be string | null
    expect(
      repo.currentBranch === null || typeof repo.currentBranch === "string",
    ).toBe(true);
  });

  // ─── Workspace ─────────────────────────────────────────────────────

  test("WorkspaceInfo shape matches TS interface", async ({ bridge }) => {
    const workspaces = (await bridge.invoke("list_workspaces")) as Array<
      Record<string, unknown>
    >;
    const ws = workspaces.find((w) => w.id === workspaceId)!;

    // interface WorkspaceInfo { id, repoId, name, branch, status, portBase,
    //   autoCommit, createdAt, archivedAt, devcontainerConfig? }
    expect(typeof ws.id).toBe("string");
    expect(typeof ws.repoId).toBe("string");
    expect(typeof ws.name).toBe("string");
    expect(typeof ws.branch).toBe("string");
    expect(typeof ws.status).toBe("string");
    expect(typeof ws.portBase).toBe("number");
    expect(typeof ws.autoCommit).toBe("boolean");
    expect(typeof ws.createdAt).toBe("string");
    expect(ws.archivedAt === null || typeof ws.archivedAt === "string").toBe(
      true,
    );
  });

  // ─── Agent ─────────────────────────────────────────────────────────

  test("AgentInfo shape matches TS interface", async ({ bridge }) => {
    const info = (await bridge.invoke("get_agent_status", {
      workspaceId,
    })) as Record<string, unknown>;

    // interface AgentInfo { workspaceId, sessionId, status, startedAt, pid? }
    expect(typeof info.workspaceId).toBe("string");
    expect(
      info.sessionId === null || typeof info.sessionId === "string",
    ).toBe(true);
    expect(info.status).toBeTruthy(); // "Idle" | "Running" | "Stopping" | { Error: string }
    expect(
      info.startedAt === null || typeof info.startedAt === "string",
    ).toBe(true);
  });

  // ─── Git ───────────────────────────────────────────────────────────

  test("GitLogEntry shape matches TS interface", async ({ bridge }) => {
    const log = (await bridge.invoke("get_git_log", {
      workspaceId,
      maxCount: 1,
    })) as Array<Record<string, unknown>>;

    expect(log.length).toBeGreaterThan(0);
    const entry = log[0];

    // interface GitLogEntry { hash, message, author, timestamp }
    expect(typeof entry.hash).toBe("string");
    expect(typeof entry.message).toBe("string");
    expect(typeof entry.author).toBe("string");
    expect(typeof entry.timestamp).toBe("string");
  });

  test("BranchStatus shape matches TS interface", async ({ bridge }) => {
    const status = (await bridge.invoke("get_branch_status", {
      workspaceId,
    })) as Record<string, unknown>;

    // interface BranchStatus { branch, defaultBranch, ahead, behind, hasUpstream }
    expect(typeof status.branch).toBe("string");
    expect(typeof status.defaultBranch).toBe("string");
    expect(typeof status.ahead).toBe("number");
    expect(typeof status.behind).toBe("number");
    expect(typeof status.hasUpstream).toBe("boolean");
  });

  // ─── Diff ──────────────────────────────────────────────────────────

  test("DiffResult shape matches TS interface", async ({ bridge }) => {
    const diff = (await bridge.invoke("get_diff", {
      workspaceId,
    })) as Record<string, unknown>;

    // interface DiffResult { files, totalAdditions, totalDeletions }
    expect(Array.isArray(diff.files)).toBe(true);
    expect(typeof diff.totalAdditions).toBe("number");
    expect(typeof diff.totalDeletions).toBe("number");
  });

  // ─── Settings ──────────────────────────────────────────────────────

  test("AppSettings shape matches TS interface", async ({ bridge }) => {
    const settings = (await bridge.invoke("get_app_settings")) as Record<
      string,
      unknown
    >;

    // interface AppSettings { agentType, theme, provider, customThemes, experimental, ... }
    expect(typeof settings.agentType).toBe("string");
    expect(typeof settings.theme).toBe("string");
    expect(typeof settings.provider).toBe("object");
    expect(typeof settings.experimental).toBe("object");
  });

  test("RepoSettings shape matches TS interface", async ({ bridge }) => {
    const settings = (await bridge.invoke("get_repo_settings", {
      repoId,
    })) as Record<string, unknown>;

    // interface RepoSettings { setupScript, runScript, archiveScript, runScriptMode, envVars, ... }
    expect(typeof settings.runScriptMode).toBe("string");
    expect(typeof settings.envVars).toBe("object");
    expect(
      settings.setupScript === null || typeof settings.setupScript === "string",
    ).toBe(true);
  });

  // ─── TestRunner ────────────────────────────────────────────────────

  test("TestRunnerConfig shape matches TS interface", async ({ bridge }) => {
    const config = (await bridge.invoke("detect_test_framework", {
      repoId,
    })) as Record<string, unknown>;

    // interface TestRunnerConfig { framework, testCommand, testFileCommand, workingDir, coverageCommand }
    expect(
      config.framework === null || typeof config.framework === "string",
    ).toBe(true);
    expect(
      config.testCommand === null || typeof config.testCommand === "string",
    ).toBe(true);
  });

  // ─── Bookmarks ─────────────────────────────────────────────────────

  test("FileBookmark shape matches TS interface", async ({ bridge }) => {
    const bm = (await bridge.invoke("create_bookmark", {
      request: {
        repoId,
        filePath: "package.json",
        lineNumber: 1,
        note: "contract test",
      },
    })) as Record<string, unknown>;

    // interface FileBookmark { id, repoId, filePath, lineNumber, note, color, createdAt, updatedAt }
    expect(typeof bm.id).toBe("string");
    expect(typeof bm.repoId).toBe("string");
    expect(typeof bm.filePath).toBe("string");
    expect(typeof bm.lineNumber).toBe("number");
    expect(bm.note === null || typeof bm.note === "string").toBe(true);
    expect(bm.color === null || typeof bm.color === "string").toBe(true);
    expect(typeof bm.createdAt).toBe("string");
    expect(typeof bm.updatedAt).toBe("string");

    // Cleanup
    await bridge.invoke("delete_bookmark", { bookmarkId: bm.id });
  });

  // ─── Prompts ───────────────────────────────────────────────────────

  test("Prompt shape matches TS interface", async ({ bridge }) => {
    const prompt = (await bridge.invoke("create_prompt", {
      request: {
        name: "contract-test",
        content: "test content",
        tags: [],
      },
    })) as Record<string, unknown>;

    // interface Prompt { id, name, content, description, category, tags, sortOrder, createdAt, updatedAt }
    expect(typeof prompt.id).toBe("string");
    expect(typeof prompt.name).toBe("string");
    expect(typeof prompt.content).toBe("string");
    expect(prompt.description === null || typeof prompt.description === "string").toBe(true);
    expect(typeof prompt.sortOrder).toBe("number");
    expect(Array.isArray(prompt.tags)).toBe(true);
    expect(typeof prompt.createdAt).toBe("string");
    expect(typeof prompt.updatedAt).toBe("string");

    await bridge.invoke("delete_prompt", { promptId: prompt.id });
  });

  // ─── Snippets ──────────────────────────────────────────────────────

  test("Snippet shape matches TS interface", async ({ bridge }) => {
    const snippet = (await bridge.invoke("create_snippet", {
      request: {
        title: "contract-test",
        content: "test",
        language: "javascript",
        tags: [],
      },
    })) as Record<string, unknown>;

    // interface Snippet { id, title, content, language, description, tags, source, createdAt, updatedAt }
    expect(typeof snippet.id).toBe("string");
    expect(typeof snippet.title).toBe("string");
    expect(typeof snippet.content).toBe("string");
    expect(snippet.language === null || typeof snippet.language === "string").toBe(true);
    expect(Array.isArray(snippet.tags)).toBe(true);
    expect(typeof snippet.createdAt).toBe("string");

    await bridge.invoke("delete_snippet", { snippetId: snippet.id });
  });

  // ─── Todos ─────────────────────────────────────────────────────────

  test("TodoItem shape matches TS interface", async ({ bridge }) => {
    const todo = (await bridge.invoke("add_todo", {
      request: { workspaceId, text: "contract test todo" },
    })) as Record<string, unknown>;

    // interface TodoItem { id, workspaceId, text, completed, sortOrder }
    expect(typeof todo.id).toBe("string");
    expect(typeof todo.workspaceId).toBe("string");
    expect(typeof todo.text).toBe("string");
    expect(typeof todo.completed).toBe("boolean");
    expect(typeof todo.sortOrder).toBe("number");

    await bridge.invoke("delete_todo", { workspaceId, todoId: todo.id });
  });

  // ─── Chat Messages ─────────────────────────────────────────────────

  test("ChatMessage shape matches TS interface on round-trip", async ({
    bridge,
  }) => {
    const msgId = crypto.randomUUID();
    await bridge.invoke("save_chat_message", {
      message: {
        id: msgId,
        workspaceId,
        role: "user",
        content: [{ type: "text", text: "contract test" }],
        timestamp: new Date().toISOString(),
      },
    });

    const messages = (await bridge.invoke("list_chat_messages", {
      workspaceId,
    })) as Array<Record<string, unknown>>;
    const msg = messages.find((m) => m.id === msgId)!;

    // interface PersistedChatMessage { id, workspaceId, role, content, timestamp, displayText?, metadata? }
    expect(typeof msg.id).toBe("string");
    expect(typeof msg.workspaceId).toBe("string");
    expect(typeof msg.role).toBe("string");
    expect(Array.isArray(msg.content)).toBe(true);
    expect(typeof msg.timestamp).toBe("string");

    const content = msg.content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe("text");
    expect(typeof content[0].text).toBe("string");

    await bridge.invoke("clear_chat_messages", { workspaceId });
  });

  // ─── Export ────────────────────────────────────────────────────────

  test("export_workspace returns parseable JSON with workspace data", async ({
    bridge,
  }) => {
    const json = (await bridge.invoke("export_workspace", {
      options: {
        workspaceId,
        includeChat: true,
        includeTodos: true,
        includeRepoSettings: true,
        includeEnvVars: false,
        includeBookmarks: true,
        includeSnippets: true,
      },
    })) as string;

    const parsed = JSON.parse(json);

    // Export should be a valid object with workspace-related data
    expect(typeof parsed).toBe("object");
    // The exact shape depends on the backend implementation
    // Key assertion: it's valid JSON that can be parsed without error
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });
});
