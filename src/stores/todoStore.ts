import { create } from "zustand";
import {
  type TodoItem,
  type UpdateTodoRequest,
  addTodo as addTodoCmd,
  updateTodo as updateTodoCmd,
  deleteTodo as deleteTodoCmd,
  listTodos as listTodosCmd,
  toggleTodo as toggleTodoCmd,
  reorderTodos as reorderTodosCmd,
} from "../lib/tauri";

interface TodoStore {
  todos: Record<string, TodoItem[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  loadTodos: (workspaceId: string) => Promise<void>;
  addTodo: (workspaceId: string, text: string) => Promise<TodoItem>;
  updateTodo: (request: UpdateTodoRequest) => Promise<void>;
  deleteTodo: (workspaceId: string, todoId: string) => Promise<void>;
  toggleTodo: (workspaceId: string, todoId: string) => Promise<void>;
  reorderTodos: (workspaceId: string, todoIds: string[]) => Promise<void>;

  getTodos: (workspaceId: string) => TodoItem[];
  getSummary: (workspaceId: string) => {
    total: number;
    completed: number;
    allCompleted: boolean;
  };
  getTodosAsText: (workspaceId: string) => string;
}

export const useTodoStore = create<TodoStore>((set, get) => ({
  todos: {},
  loading: {},
  error: {},

  loadTodos: async (workspaceId: string) => {
    set((s) => ({
      loading: { ...s.loading, [workspaceId]: true },
      error: { ...s.error, [workspaceId]: null },
    }));
    try {
      const items = await listTodosCmd(workspaceId);
      set((s) => ({
        todos: { ...s.todos, [workspaceId]: items },
        loading: { ...s.loading, [workspaceId]: false },
      }));
    } catch (e) {
      set((s) => ({
        loading: { ...s.loading, [workspaceId]: false },
        error: { ...s.error, [workspaceId]: String(e) },
      }));
    }
  },

  addTodo: async (workspaceId: string, text: string) => {
    try {
      const item = await addTodoCmd({ workspaceId, text });
      set((s) => ({
        todos: {
          ...s.todos,
          [workspaceId]: [...(s.todos[workspaceId] ?? []), item],
        },
      }));
      return item;
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [workspaceId]: String(e) },
      }));
      throw e;
    }
  },

  updateTodo: async (request: UpdateTodoRequest) => {
    try {
      await updateTodoCmd(request);
      set((s) => ({
        todos: {
          ...s.todos,
          [request.workspaceId]: (s.todos[request.workspaceId] ?? []).map((t) =>
            t.id === request.id
              ? {
                  ...t,
                  ...(request.text !== undefined ? { text: request.text } : {}),
                  ...(request.completed !== undefined
                    ? { completed: request.completed }
                    : {}),
                }
              : t,
          ),
        },
      }));
    } catch (e) {
      set((s) => ({
        error: { ...s.error, [request.workspaceId]: String(e) },
      }));
      throw e;
    }
  },

  deleteTodo: async (workspaceId: string, todoId: string) => {
    // Optimistic removal
    const prev = get().todos[workspaceId] ?? [];
    set((s) => ({
      todos: {
        ...s.todos,
        [workspaceId]: prev.filter((t) => t.id !== todoId),
      },
    }));
    try {
      await deleteTodoCmd(todoId);
    } catch (e) {
      // Revert on error
      set((s) => ({
        todos: { ...s.todos, [workspaceId]: prev },
        error: { ...s.error, [workspaceId]: String(e) },
      }));
    }
  },

  toggleTodo: async (workspaceId: string, todoId: string) => {
    // Optimistic toggle
    const prev = get().todos[workspaceId] ?? [];
    set((s) => ({
      todos: {
        ...s.todos,
        [workspaceId]: prev.map((t) =>
          t.id === todoId ? { ...t, completed: !t.completed } : t,
        ),
      },
    }));
    try {
      await toggleTodoCmd(todoId);
    } catch (e) {
      // Revert on error
      set((s) => ({
        todos: { ...s.todos, [workspaceId]: prev },
        error: { ...s.error, [workspaceId]: String(e) },
      }));
    }
  },

  reorderTodos: async (workspaceId: string, todoIds: string[]) => {
    // Optimistic reorder
    const prev = get().todos[workspaceId] ?? [];
    const reordered = todoIds
      .map((id) => prev.find((t) => t.id === id))
      .filter((t): t is TodoItem => t != null)
      .map((t, i) => ({ ...t, sortOrder: i }));
    set((s) => ({
      todos: { ...s.todos, [workspaceId]: reordered },
    }));
    try {
      await reorderTodosCmd({ workspaceId, todoIds });
    } catch (e) {
      // Revert on error
      set((s) => ({
        todos: { ...s.todos, [workspaceId]: prev },
        error: { ...s.error, [workspaceId]: String(e) },
      }));
    }
  },

  getTodos: (workspaceId: string) => {
    return get().todos[workspaceId] ?? [];
  },

  getSummary: (workspaceId: string) => {
    const todos = get().todos[workspaceId] ?? [];
    const total = todos.length;
    const completed = todos.filter((t) => t.completed).length;
    return {
      total,
      completed,
      allCompleted: total > 0 && completed === total,
    };
  },

  getTodosAsText: (workspaceId: string) => {
    const todos = get().todos[workspaceId] ?? [];
    if (todos.length === 0) return "No todos defined for this workspace.";
    return (
      "Current Todo List:\n" +
      todos
        .map(
          (t, i) => `${i + 1}. [${t.completed ? "x" : " "}] ${t.text}`,
        )
        .join("\n")
    );
  },
}));
