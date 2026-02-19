import { useEffect, useState, useRef, useCallback } from "react";
import { useTodoStore } from "../../stores/todoStore";
import type { TodoItem } from "../../lib/tauri";

interface NotesPanelProps {
  workspaceId: string;
}

export function NotesPanel({ workspaceId }: NotesPanelProps) {
  const { loadTodos, addTodo } = useTodoStore();
  const todos = useTodoStore((s) => s.getTodos(workspaceId));
  const summary = useTodoStore((s) => s.getSummary(workspaceId));
  const loading = useTodoStore((s) => s.loading[workspaceId] ?? false);

  useEffect(() => {
    loadTodos(workspaceId);
  }, [workspaceId, loadTodos]);

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Todos
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {summary.total > 0
              ? `${summary.completed} of ${summary.total} completed`
              : "No todos yet"}
          </span>
        </div>
        {summary.total > 0 && (
          <div
            className="mt-1.5 h-1 rounded-full"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div
              className="h-1 rounded-full transition-all"
              style={{
                width: `${(summary.completed / summary.total) * 100}%`,
                backgroundColor: summary.allCompleted
                  ? "var(--success)"
                  : "var(--accent)",
              }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-lg space-y-3">
          {/* Merge blocking warning */}
          {summary.total > 0 && !summary.allCompleted && (
            <div
              className="rounded p-2 text-xs"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--warning) 15%, transparent)",
                color: "var(--warning)",
              }}
            >
              Uncompleted todos will block PR merge
            </div>
          )}

          {/* Add todo input */}
          <AddTodoInput
            onAdd={async (text) => {
              await addTodo(workspaceId, text);
            }}
          />

          {/* Todo list */}
          {loading && todos.length === 0 ? (
            <div
              className="py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Loading...
            </div>
          ) : todos.length === 0 ? (
            <div
              className="py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              No todos yet. Add one above to get started.
            </div>
          ) : (
            <TodoList workspaceId={workspaceId} todos={todos} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Add Todo Input ---

function AddTodoInput({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      await onAdd(text.trim());
      setText("");
      inputRef.current?.focus();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        placeholder="Add a todo..."
        className="flex-1 rounded px-3 py-1.5 text-sm outline-none"
        style={{
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      />
      <button
        onClick={handleAdd}
        disabled={!text.trim() || adding}
        className="rounded px-3 py-1.5 text-xs transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: "var(--accent)",
          color: "var(--bg-primary)",
        }}
      >
        Add
      </button>
    </div>
  );
}

// --- Todo List with drag reorder ---

function TodoList({
  workspaceId,
  todos,
}: {
  workspaceId: string;
  todos: TodoItem[];
}) {
  const { toggleTodo, deleteTodo, updateTodo, reorderTodos } = useTodoStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const ids = todos.map((t) => t.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(index, 0, moved);
    reorderTodos(workspaceId, ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      className="space-y-1 rounded p-2"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {todos.map((todo, index) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          isDragging={dragIndex === index}
          isDragOver={dragOverIndex === index}
          onToggle={() => toggleTodo(workspaceId, todo.id)}
          onDelete={() => deleteTodo(workspaceId, todo.id)}
          onEdit={(text) =>
            updateTodo({ id: todo.id, workspaceId, text })
          }
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={() => handleDrop(index)}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}

// --- Single Todo Row ---

function TodoRow({
  todo,
  isDragging,
  isDragOver,
  onToggle,
  onDelete,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  todo: TodoItem;
  isDragging: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = useCallback(() => {
    setEditText(todo.text);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [todo.text]);

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== todo.text) {
      onEdit(editText.trim());
    }
    setEditing(false);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
      style={{
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isDragOver ? "var(--bg-hover)" : "transparent",
        borderTop: isDragOver ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      {/* Drag handle */}
      <span
        className="cursor-grab opacity-0 group-hover:opacity-50"
        style={{ color: "var(--text-muted)", fontSize: "10px" }}
      >
        ⠿
      </span>

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded"
        style={{ accentColor: "var(--accent)" }}
      />

      {/* Text */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 rounded bg-transparent px-1 outline-none"
          style={{
            color: "var(--text-primary)",
            border: "1px solid var(--accent)",
          }}
        />
      ) : (
        <span
          onDoubleClick={handleStartEdit}
          className="flex-1 cursor-default select-none"
          style={{
            color: todo.completed
              ? "var(--text-muted)"
              : "var(--text-primary)",
            textDecoration: todo.completed ? "line-through" : "none",
          }}
        >
          {todo.text}
        </span>
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="rounded px-1 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "var(--error)" }}
        title="Delete todo"
      >
        &times;
      </button>
    </div>
  );
}
