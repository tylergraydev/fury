import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotesPanel } from "./NotesPanel";
import { useTodoStore } from "../../stores/todoStore";

vi.mock("../../lib/tauri", () => ({
  listTodos: vi.fn().mockResolvedValue([]),
  addTodo: vi.fn().mockResolvedValue(undefined),
  deleteTodo: vi.fn().mockResolvedValue(undefined),
  toggleTodo: vi.fn().mockResolvedValue(undefined),
  reorderTodos: vi.fn().mockResolvedValue(undefined),
  updateTodo: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useTodoStore.setState({
    todos: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

describe("NotesPanel", () => {
  it("shows 'No todos yet' message when empty", async () => {
    render(<NotesPanel workspaceId="ws-1" />);
    expect(await screen.findByText("No todos yet. Add one above to get started.")).toBeInTheDocument();
  });

  it("shows header with 'Todos' label", () => {
    render(<NotesPanel workspaceId="ws-1" />);
    expect(screen.getByText("Todos")).toBeInTheDocument();
  });

  it("shows 'No todos yet' in summary when empty", async () => {
    render(<NotesPanel workspaceId="ws-1" />);
    expect(await screen.findByText("No todos yet")).toBeInTheDocument();
  });

  it("shows summary with completion count", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Task 1", completed: true, workspaceId: "ws-1" },
          { id: "t2", text: "Task 2", completed: false, workspaceId: "ws-1" },
        ],
      },
    });
    render(<NotesPanel workspaceId="ws-1" />);
    expect(screen.getByText("1 of 2 completed")).toBeInTheDocument();
  });

  it("shows merge blocking warning for incomplete todos", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Task 1", completed: false, workspaceId: "ws-1" },
        ],
      },
    });
    render(<NotesPanel workspaceId="ws-1" />);
    expect(screen.getByText("Uncompleted todos will block PR merge")).toBeInTheDocument();
  });

  it("hides merge warning when all todos are complete", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Task 1", completed: true, workspaceId: "ws-1" },
        ],
      },
    });
    render(<NotesPanel workspaceId="ws-1" />);
    expect(screen.queryByText("Uncompleted todos will block PR merge")).not.toBeInTheDocument();
  });

  it("renders todo items", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Buy milk", completed: false, workspaceId: "ws-1" },
          { id: "t2", text: "Write tests", completed: true, workspaceId: "ws-1" },
        ],
      },
    });
    render(<NotesPanel workspaceId="ws-1" />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useTodoStore.setState({ loading: { "ws-1": true } });
    render(<NotesPanel workspaceId="ws-1" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
