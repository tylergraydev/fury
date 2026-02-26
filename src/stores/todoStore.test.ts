import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  addTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  listTodos: vi.fn(),
  toggleTodo: vi.fn(),
  reorderTodos: vi.fn(),
}));

import { useTodoStore } from "./todoStore";
import {
  addTodo,
  updateTodo,
  deleteTodo,
  listTodos,
  toggleTodo,
  reorderTodos,
} from "../lib/tauri";

const makeTodo = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  workspaceId: "ws-1",
  text: "Test todo",
  completed: false,
  sortOrder: 0,
  ...overrides,
});

beforeEach(() => {
  useTodoStore.setState(
    { todos: {}, loading: {}, error: {} },
  );
  vi.clearAllMocks();
});

describe("todoStore - loadTodos", () => {
  it("loads todos and clears loading", async () => {
    const items = [makeTodo()];
    vi.mocked(listTodos).mockResolvedValue(items as any);

    await useTodoStore.getState().loadTodos("ws-1");

    expect(useTodoStore.getState().todos["ws-1"]).toEqual(items);
    expect(useTodoStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets loading to true during load", async () => {
    let resolve: any;
    vi.mocked(listTodos).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const promise = useTodoStore.getState().loadTodos("ws-1");
    expect(useTodoStore.getState().loading["ws-1"]).toBe(true);

    resolve([]);
    await promise;
    expect(useTodoStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(listTodos).mockRejectedValue(new Error("fail"));

    await useTodoStore.getState().loadTodos("ws-1");

    expect(useTodoStore.getState().error["ws-1"]).toBe("Error: fail");
    expect(useTodoStore.getState().loading["ws-1"]).toBe(false);
  });
});

describe("todoStore - loadTodos inflight dedup", () => {
  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(listTodos).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useTodoStore.getState().loadTodos("ws-1");
    const p2 = useTodoStore.getState().loadTodos("ws-1");
    resolve!([]);
    await Promise.all([p1, p2]);
    expect(listTodos).toHaveBeenCalledTimes(1);
  });

  it("suppresses error when cached data exists", async () => {
    vi.mocked(listTodos).mockResolvedValue([makeTodo()] as any);
    await useTodoStore.getState().loadTodos("ws-1");

    vi.mocked(listTodos).mockRejectedValue(new Error("net"));
    await useTodoStore.getState().loadTodos("ws-1");
    expect(useTodoStore.getState().error["ws-1"]).toBeNull();
  });
});

describe("todoStore - addTodo", () => {
  it("adds a todo to the list", async () => {
    const item = makeTodo({ id: "new" });
    vi.mocked(addTodo).mockResolvedValue(item as any);

    const result = await useTodoStore.getState().addTodo("ws-1", "Test todo");

    expect(result).toEqual(item);
    expect(useTodoStore.getState().todos["ws-1"]).toContainEqual(item);
    expect(addTodo).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      text: "Test todo",
    });
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(addTodo).mockRejectedValue(new Error("add fail"));

    await expect(
      useTodoStore.getState().addTodo("ws-1", "test"),
    ).rejects.toThrow("add fail");

    expect(useTodoStore.getState().error["ws-1"]).toBe("Error: add fail");
  });
});

describe("todoStore - updateTodo", () => {
  it("updates a todo's text", async () => {
    useTodoStore.setState({
      todos: { "ws-1": [makeTodo({ id: "t1", text: "old" })] as any },
    });
    vi.mocked(updateTodo).mockResolvedValue(undefined);

    await useTodoStore.getState().updateTodo({
      id: "t1",
      workspaceId: "ws-1",
      text: "new",
    });

    expect(useTodoStore.getState().todos["ws-1"][0].text).toBe("new");
  });

  it("handles update for workspace with no todos (empty fallback)", async () => {
    vi.mocked(updateTodo).mockResolvedValue(undefined);

    await useTodoStore.getState().updateTodo({
      id: "t1",
      workspaceId: "ws-unknown",
      text: "new",
    });

    // Should have empty array since no matching todo was found
    expect(useTodoStore.getState().todos["ws-unknown"]).toEqual([]);
  });

  it("leaves non-matching todos unchanged", async () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          makeTodo({ id: "t1", text: "one" }),
          makeTodo({ id: "t2", text: "two" }),
        ] as any,
      },
    });
    vi.mocked(updateTodo).mockResolvedValue(undefined);

    await useTodoStore.getState().updateTodo({
      id: "t1",
      workspaceId: "ws-1",
      text: "updated",
    });

    expect(useTodoStore.getState().todos["ws-1"][0].text).toBe("updated");
    expect(useTodoStore.getState().todos["ws-1"][1].text).toBe("two");
  });

  it("updates a todo's completed status", async () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [makeTodo({ id: "t1", completed: false })] as any,
      },
    });
    vi.mocked(updateTodo).mockResolvedValue(undefined);

    await useTodoStore.getState().updateTodo({
      id: "t1",
      workspaceId: "ws-1",
      completed: true,
    });

    expect(useTodoStore.getState().todos["ws-1"][0].completed).toBe(true);
  });

  it("sets error and throws on failure", async () => {
    useTodoStore.setState({
      todos: { "ws-1": [makeTodo()] as any },
    });
    vi.mocked(updateTodo).mockRejectedValue(new Error("update fail"));

    await expect(
      useTodoStore.getState().updateTodo({
        id: "t1",
        workspaceId: "ws-1",
        text: "new",
      }),
    ).rejects.toThrow("update fail");

    expect(useTodoStore.getState().error["ws-1"]).toBe("Error: update fail");
  });
});

describe("todoStore - deleteTodo (optimistic)", () => {
  it("handles deletion from unknown workspace (empty prev)", async () => {
    vi.mocked(deleteTodo).mockResolvedValue(undefined);
    await useTodoStore.getState().deleteTodo("ws-unknown", "t1");
    expect(useTodoStore.getState().todos["ws-unknown"]).toEqual([]);
  });

  it("removes todo optimistically", async () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [makeTodo({ id: "t1" }), makeTodo({ id: "t2" })] as any,
      },
    });
    vi.mocked(deleteTodo).mockResolvedValue(undefined);

    await useTodoStore.getState().deleteTodo("ws-1", "t1");

    expect(useTodoStore.getState().todos["ws-1"]).toHaveLength(1);
    expect(useTodoStore.getState().todos["ws-1"][0].id).toBe("t2");
  });

  it("reverts on error", async () => {
    const todos = [makeTodo({ id: "t1" }), makeTodo({ id: "t2" })];
    useTodoStore.setState({ todos: { "ws-1": todos as any } });
    vi.mocked(deleteTodo).mockRejectedValue(new Error("del fail"));

    await useTodoStore.getState().deleteTodo("ws-1", "t1");

    expect(useTodoStore.getState().todos["ws-1"]).toHaveLength(2);
    expect(useTodoStore.getState().error["ws-1"]).toBe("Error: del fail");
  });
});

describe("todoStore - toggleTodo (optimistic)", () => {
  it("handles toggle from unknown workspace (empty prev)", async () => {
    vi.mocked(toggleTodo).mockResolvedValue(true);
    await useTodoStore.getState().toggleTodo("ws-unknown", "t1");
    expect(useTodoStore.getState().todos["ws-unknown"]).toEqual([]);
  });

  it("leaves non-matching todos unchanged during toggle", async () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          makeTodo({ id: "t1", completed: false }),
          makeTodo({ id: "t2", completed: true }),
        ] as any,
      },
    });
    vi.mocked(toggleTodo).mockResolvedValue(true);
    await useTodoStore.getState().toggleTodo("ws-1", "t1");
    expect(useTodoStore.getState().todos["ws-1"][0].completed).toBe(true);
    expect(useTodoStore.getState().todos["ws-1"][1].completed).toBe(true); // unchanged
  });

  it("toggles completed optimistically", async () => {
    useTodoStore.setState({
      todos: { "ws-1": [makeTodo({ id: "t1", completed: false })] as any },
    });
    vi.mocked(toggleTodo).mockResolvedValue(true);

    await useTodoStore.getState().toggleTodo("ws-1", "t1");

    expect(useTodoStore.getState().todos["ws-1"][0].completed).toBe(true);
  });

  it("reverts on error", async () => {
    useTodoStore.setState({
      todos: { "ws-1": [makeTodo({ id: "t1", completed: false })] as any },
    });
    vi.mocked(toggleTodo).mockRejectedValue(new Error("toggle fail"));

    await useTodoStore.getState().toggleTodo("ws-1", "t1");

    expect(useTodoStore.getState().todos["ws-1"][0].completed).toBe(false);
    expect(useTodoStore.getState().error["ws-1"]).toBe("Error: toggle fail");
  });
});

describe("todoStore - reorderTodos (optimistic)", () => {
  it("handles reorder from unknown workspace (empty prev)", async () => {
    vi.mocked(reorderTodos).mockResolvedValue(undefined);
    await useTodoStore.getState().reorderTodos("ws-unknown", ["t1", "t2"]);
    expect(useTodoStore.getState().todos["ws-unknown"]).toEqual([]);
  });

  it("reorders todos optimistically", async () => {
    const t1 = makeTodo({ id: "t1", sortOrder: 0 });
    const t2 = makeTodo({ id: "t2", sortOrder: 1 });
    useTodoStore.setState({ todos: { "ws-1": [t1, t2] as any } });
    vi.mocked(reorderTodos).mockResolvedValue(undefined);

    await useTodoStore.getState().reorderTodos("ws-1", ["t2", "t1"]);

    const reordered = useTodoStore.getState().todos["ws-1"];
    expect(reordered[0].id).toBe("t2");
    expect(reordered[0].sortOrder).toBe(0);
    expect(reordered[1].id).toBe("t1");
    expect(reordered[1].sortOrder).toBe(1);
  });

  it("reverts on error", async () => {
    const t1 = makeTodo({ id: "t1", sortOrder: 0 });
    const t2 = makeTodo({ id: "t2", sortOrder: 1 });
    useTodoStore.setState({ todos: { "ws-1": [t1, t2] as any } });
    vi.mocked(reorderTodos).mockRejectedValue(new Error("reorder fail"));

    await useTodoStore.getState().reorderTodos("ws-1", ["t2", "t1"]);

    const reverted = useTodoStore.getState().todos["ws-1"];
    expect(reverted[0].id).toBe("t1");
    expect(reverted[1].id).toBe("t2");
    expect(useTodoStore.getState().error["ws-1"]).toBe("Error: reorder fail");
  });
});

describe("todoStore - getTodos", () => {
  it("returns todos for known workspace", () => {
    const todos = [makeTodo()];
    useTodoStore.setState({ todos: { "ws-1": todos as any } });
    expect(useTodoStore.getState().getTodos("ws-1")).toEqual(todos);
  });

  it("returns empty array for unknown workspace", () => {
    expect(useTodoStore.getState().getTodos("unknown")).toEqual([]);
  });
});

describe("todoStore - getSummary", () => {
  it("returns correct summary with mixed todos", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          makeTodo({ id: "t1", completed: true }),
          makeTodo({ id: "t2", completed: false }),
          makeTodo({ id: "t3", completed: true }),
        ] as any,
      },
    });

    const summary = useTodoStore.getState().getSummary("ws-1");
    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(2);
    expect(summary.allCompleted).toBe(false);
  });

  it("returns allCompleted true when all done", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [makeTodo({ completed: true })] as any,
      },
    });

    expect(useTodoStore.getState().getSummary("ws-1").allCompleted).toBe(true);
  });

  it("returns allCompleted false for empty list", () => {
    useTodoStore.setState({ todos: { "ws-1": [] } });

    expect(useTodoStore.getState().getSummary("ws-1").allCompleted).toBe(false);
  });

  it("returns zero summary for unknown workspace", () => {
    const summary = useTodoStore.getState().getSummary("unknown");
    expect(summary.total).toBe(0);
    expect(summary.completed).toBe(0);
  });
});

describe("todoStore - getTodosAsText", () => {
  it("formats todos as checklist text", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          makeTodo({ text: "First", completed: false }),
          makeTodo({ text: "Second", completed: true }),
        ] as any,
      },
    });

    const text = useTodoStore.getState().getTodosAsText("ws-1");
    expect(text).toContain("Current Todo List:");
    expect(text).toContain("1. [ ] First");
    expect(text).toContain("2. [x] Second");
  });

  it("returns placeholder for empty list", () => {
    useTodoStore.setState({ todos: { "ws-1": [] } });

    expect(useTodoStore.getState().getTodosAsText("ws-1")).toBe(
      "No todos defined for this workspace.",
    );
  });

  it("returns placeholder for unknown workspace", () => {
    expect(useTodoStore.getState().getTodosAsText("unknown")).toBe(
      "No todos defined for this workspace.",
    );
  });
});
