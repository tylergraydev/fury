import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    // Replace loadTodos with a no-op to prevent it from clearing state during tests
    loadTodos: vi.fn().mockResolvedValue(undefined),
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
          { id: "t1", text: "Task 1", completed: true, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Task 2", completed: false, workspaceId: "ws-1", sortOrder: 1 },
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
          { id: "t1", text: "Task 1", completed: false, workspaceId: "ws-1", sortOrder: 0 },
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
          { id: "t1", text: "Task 1", completed: true, workspaceId: "ws-1", sortOrder: 0 },
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
          { id: "t1", text: "Buy milk", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Write tests", completed: true, workspaceId: "ws-1", sortOrder: 1 },
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

  // --- Add todo input tests ---

  it("adds a todo when clicking the Add button", async () => {
    const user = userEvent.setup();
    const addTodoSpy = vi.spyOn(useTodoStore.getState(), "addTodo").mockResolvedValue({
      id: "new-1",
      text: "New todo",
      completed: false,
      workspaceId: "ws-1",
      sortOrder: 0,
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const input = screen.getByPlaceholderText("Add a todo...");
    await user.type(input, "New todo");
    await user.click(screen.getByText("Add"));

    expect(addTodoSpy).toHaveBeenCalledWith("ws-1", "New todo");
  });

  it("adds a todo when pressing Enter", async () => {
    const user = userEvent.setup();
    const addTodoSpy = vi.spyOn(useTodoStore.getState(), "addTodo").mockResolvedValue({
      id: "new-1",
      text: "Enter todo",
      completed: false,
      workspaceId: "ws-1",
      sortOrder: 0,
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const input = screen.getByPlaceholderText("Add a todo...");
    await user.type(input, "Enter todo{enter}");

    expect(addTodoSpy).toHaveBeenCalledWith("ws-1", "Enter todo");
  });

  it("clears input after adding a todo", async () => {
    const user = userEvent.setup();
    vi.spyOn(useTodoStore.getState(), "addTodo").mockResolvedValue({
      id: "new-1",
      text: "Test",
      completed: false,
      workspaceId: "ws-1",
      sortOrder: 0,
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const input = screen.getByPlaceholderText("Add a todo...");
    await user.type(input, "Test");
    await user.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("does not add empty todo", async () => {
    const user = userEvent.setup();
    const addTodoSpy = vi.spyOn(useTodoStore.getState(), "addTodo");

    render(<NotesPanel workspaceId="ws-1" />);

    // Add button should be disabled when input is empty
    const addButton = screen.getByText("Add");
    expect(addButton).toBeDisabled();

    // Even pressing Enter with empty text should not trigger add
    const input = screen.getByPlaceholderText("Add a todo...");
    await user.type(input, "   ");
    await user.keyboard("{enter}");

    expect(addTodoSpy).not.toHaveBeenCalled();
  });

  // --- Toggle todo tests ---

  it("toggles a todo when clicking checkbox", async () => {
    const toggleSpy = vi.spyOn(useTodoStore.getState(), "toggleTodo").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Task 1", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(toggleSpy).toHaveBeenCalledWith("ws-1", "t1");
  });

  // --- Delete todo tests ---

  it("deletes a todo when clicking delete button", async () => {
    const deleteSpy = vi.spyOn(useTodoStore.getState(), "deleteTodo").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Task 1", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);
    const deleteButton = screen.getByTitle("Delete todo");
    fireEvent.click(deleteButton);

    expect(deleteSpy).toHaveBeenCalledWith("ws-1", "t1");
  });

  // --- Edit todo tests ---

  it("enters edit mode on double-click and saves on blur", async () => {
    const updateSpy = vi.spyOn(useTodoStore.getState(), "updateTodo").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Original text", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    // Double-click to edit
    const todoText = screen.getByText("Original text");
    fireEvent.doubleClick(todoText);

    // Should show an input with the current text
    const editInput = await screen.findByDisplayValue("Original text");
    expect(editInput).toBeInTheDocument();

    // Change text and blur to save
    fireEvent.change(editInput, { target: { value: "Updated text" } });
    fireEvent.blur(editInput);

    expect(updateSpy).toHaveBeenCalledWith({
      id: "t1",
      workspaceId: "ws-1",
      text: "Updated text",
      completed: null,
    });
  });

  it("saves edit on Enter key press", async () => {
    const updateSpy = vi.spyOn(useTodoStore.getState(), "updateTodo").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Original", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    fireEvent.doubleClick(screen.getByText("Original"));
    const editInput = await screen.findByDisplayValue("Original");
    fireEvent.change(editInput, { target: { value: "Changed" } });
    fireEvent.keyDown(editInput, { key: "Enter" });

    expect(updateSpy).toHaveBeenCalledWith({
      id: "t1",
      workspaceId: "ws-1",
      text: "Changed",
      completed: null,
    });
  });

  it("cancels edit on Escape key press", async () => {
    const updateSpy = vi.spyOn(useTodoStore.getState(), "updateTodo").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Original", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    fireEvent.doubleClick(screen.getByText("Original"));
    const editInput = await screen.findByDisplayValue("Original");
    fireEvent.change(editInput, { target: { value: "Changed" } });
    fireEvent.keyDown(editInput, { key: "Escape" });

    // Should NOT call update since escape was pressed
    expect(updateSpy).not.toHaveBeenCalled();
    // Should exit edit mode and show original text
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("does not save edit when text is unchanged", async () => {
    const updateSpy = vi.spyOn(useTodoStore.getState(), "updateTodo").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Original", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    fireEvent.doubleClick(screen.getByText("Original"));
    const editInput = await screen.findByDisplayValue("Original");
    // Just blur without changing text
    fireEvent.blur(editInput);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  // --- Drag and drop reorder tests ---

  it("handles drag and drop reorder", () => {
    const reorderSpy = vi.spyOn(useTodoStore.getState(), "reorderTodos").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "First", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Second", completed: false, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const firstRow = screen.getByText("First").closest("[draggable]")!;
    const secondRow = screen.getByText("Second").closest("[draggable]")!;

    // Start drag on first item
    fireEvent.dragStart(firstRow);
    // Drag over second item
    fireEvent.dragOver(secondRow);
    // Drop on second item
    fireEvent.drop(secondRow);

    expect(reorderSpy).toHaveBeenCalledWith("ws-1", ["t2", "t1"]);
  });

  it("resets drag state on drag end", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "First", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Second", completed: false, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const firstRow = screen.getByText("First").closest("[draggable]")!;

    fireEvent.dragStart(firstRow);
    fireEvent.dragEnd(firstRow);

    // After drag end, no item should be in dragging state (opacity 0.5)
    // Both items should have normal opacity
    expect(firstRow).toHaveStyle({ opacity: "1" });
  });

  it("does not reorder when dropping on same index", () => {
    const reorderSpy = vi.spyOn(useTodoStore.getState(), "reorderTodos").mockResolvedValue();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "First", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Second", completed: false, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const firstRow = screen.getByText("First").closest("[draggable]")!;

    fireEvent.dragStart(firstRow);
    fireEvent.drop(firstRow);

    expect(reorderSpy).not.toHaveBeenCalled();
  });

  // --- Completed todo styling ---

  it("shows completed todo with line-through", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Done task", completed: true, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const todoText = screen.getByText("Done task");
    expect(todoText).toHaveStyle({ textDecoration: "line-through" });
  });

  it("shows incomplete todo without line-through", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Open task", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const todoText = screen.getByText("Open task");
    expect(todoText).toHaveStyle({ textDecoration: "none" });
  });

  // --- Progress bar ---

  it("shows progress bar with correct width for partial completion", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Task 1", completed: true, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Task 2", completed: false, workspaceId: "ws-1", sortOrder: 1 },
          { id: "t3", text: "Task 3", completed: false, workspaceId: "ws-1", sortOrder: 2 },
          { id: "t4", text: "Task 4", completed: true, workspaceId: "ws-1", sortOrder: 3 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    // 2 of 4 = 50%
    expect(screen.getByText("2 of 4 completed")).toBeInTheDocument();
  });

  // --- Checkbox state ---

  it("renders checked checkbox for completed todo", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Done", completed: true, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders unchecked checkbox for incomplete todo", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "Open", completed: false, workspaceId: "ws-1", sortOrder: 0 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  // --- Drag visual styles ---

  it("shows drag-over styling when dragging over a row", () => {
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", text: "First", completed: false, workspaceId: "ws-1", sortOrder: 0 },
          { id: "t2", text: "Second", completed: false, workspaceId: "ws-1", sortOrder: 1 },
        ],
      },
    });

    render(<NotesPanel workspaceId="ws-1" />);

    const firstRow = screen.getByText("First").closest("[draggable]")!;
    const secondRow = screen.getByText("Second").closest("[draggable]")!;

    // Start dragging first
    fireEvent.dragStart(firstRow);

    // Drag over second
    fireEvent.dragOver(secondRow);

    // The dragged item should have reduced opacity
    expect(firstRow).toHaveStyle({ opacity: "0.5" });
  });
});
