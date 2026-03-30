import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Todos & Checkpoints (Real Backend)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<Record<string, unknown>>;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing ? (existing.id as string) : ((await bridge.invoke("add_repository", { path: FURY_PATH })) as Record<string, unknown>).id as string;

    const suffix = Date.now();
    const ws = (await bridge.invoke("create_workspace", {
      request: { repoId, workspaceName: `todo-test-${suffix}`, branchName: `todo-test-${suffix}` },
    }, { slow: true })) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge.invoke("delete_workspace", { workspaceId }, { slow: true }).catch(() => {});
    }
  });

  test("add_todo creates a todo item", async ({ bridge }) => {
    const todo = (await bridge.invoke("add_todo", {
      request: { workspaceId, text: "Write integration tests" },
    })) as Record<string, unknown>;

    expect(todo.id).toBeTruthy();
    expect(todo.text).toBe("Write integration tests");
    expect(todo.completed).toBe(false);
  });

  test("list_todos returns created todos", async ({ bridge }) => {
    const todos = (await bridge.invoke("list_todos", { workspaceId })) as Array<Record<string, unknown>>;
    expect(todos.length).toBeGreaterThanOrEqual(1);
    expect(todos.some((t) => t.text === "Write integration tests")).toBe(true);
  });

  test("toggle_todo changes completed state", async ({ bridge }) => {
    const todos = (await bridge.invoke("list_todos", { workspaceId })) as Array<Record<string, unknown>>;
    const todo = todos[0];

    await bridge.invoke("toggle_todo", {
      workspaceId,
      todoId: todo.id,
    });

    const updated = (await bridge.invoke("list_todos", { workspaceId })) as Array<Record<string, unknown>>;
    const toggled = updated.find((t) => t.id === todo.id);
    expect(toggled!.completed).toBe(true);
  });

  test("delete_todo removes the item", async ({ bridge }) => {
    const todos = (await bridge.invoke("list_todos", { workspaceId })) as Array<Record<string, unknown>>;
    const todoId = todos[0].id;

    await bridge.invoke("delete_todo", { workspaceId, todoId });

    const remaining = (await bridge.invoke("list_todos", { workspaceId })) as Array<Record<string, unknown>>;
    expect(remaining.find((t) => t.id === todoId)).toBeUndefined();
  });

  test("list_checkpoints returns an array", async ({ bridge }) => {
    const checkpoints = (await bridge.invoke("list_checkpoints", { workspaceId })) as Array<unknown>;
    expect(Array.isArray(checkpoints)).toBe(true);
  });
});
