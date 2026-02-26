import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromptLibraryDialog } from "./PromptLibraryDialog";
import { usePromptLibraryStore } from "../../stores/promptLibraryStore";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Pencil: () => <span data-testid="pencil-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  BookOpen: () => <span data-testid="book-icon" />,
  Search: () => <span data-testid="search-icon" />,
  Tag: () => <span data-testid="tag-icon" />,
  Zap: () => <span data-testid="zap-icon" />,
}));

const mockListPrompts = vi.fn();
const mockCreatePrompt = vi.fn();
const mockUpdatePrompt = vi.fn();
const mockDeletePrompt = vi.fn();

vi.mock("../../lib/tauri", () => ({
  listPrompts: (...args: unknown[]) => mockListPrompts(...args),
  createPrompt: (...args: unknown[]) => mockCreatePrompt(...args),
  updatePrompt: (...args: unknown[]) => mockUpdatePrompt(...args),
  deletePrompt: (...args: unknown[]) => mockDeletePrompt(...args),
}));

function makePrompt(overrides: Record<string, unknown> = {}) {
  return {
    id: "prompt-1",
    name: "code-review",
    content: "Review {{file}} for issues",
    description: "Reviews code for issues",
    category: "Code Review",
    tags: ["review"],
    sortOrder: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockListPrompts.mockReset().mockResolvedValue([]);
  mockCreatePrompt.mockReset();
  mockUpdatePrompt.mockReset();
  mockDeletePrompt.mockReset();
  usePromptLibraryStore.setState({
    prompts: [],
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe("PromptLibraryDialog", () => {
  it("renders the dialog with title", async () => {
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    expect(screen.getByText("Prompt Library")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockListPrompts).toHaveBeenCalled();
    });
  });

  it("shows empty state when no prompts exist", async () => {
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    await waitFor(() => {
      expect(
        screen.getByText("No prompts saved yet. Create one to get started."),
      ).toBeInTheDocument();
    });
  });

  it("renders prompts loaded from backend", async () => {
    mockListPrompts.mockResolvedValue([makePrompt()]);
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("code-review")).toBeInTheDocument();
    });
    expect(screen.getByText("Reviews code for issues")).toBeInTheDocument();
  });

  it("filters prompts by search query", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", name: "code-review" }),
      makePrompt({ id: "p2", name: "write-tests", description: "Writes tests" }),
    ]);
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("code-review")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "write" } });
    expect(screen.getByText("write-tests")).toBeInTheDocument();
    expect(screen.queryByText("code-review")).not.toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <PromptLibraryDialog onClose={onClose} onInsert={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <PromptLibraryDialog onClose={onClose} onInsert={vi.fn()} />,
    );
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("opens create form when New Prompt is clicked", async () => {
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    await waitFor(() => {
      expect(mockListPrompts).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Prompt"));
    expect(screen.getByPlaceholderText("e.g. code-review")).toBeInTheDocument();
    expect(screen.getByText("Create Prompt")).toBeInTheDocument();
  });

  it("inserts prompt without variables directly", async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Simple prompt with no variables" }),
    ]);
    render(
      <PromptLibraryDialog onClose={onClose} onInsert={onInsert} />,
    );
    await waitFor(() => {
      expect(screen.getByText("code-review")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith(
      "Simple prompt with no variables",
      "code-review",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("auto-fills file variable and inserts", async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Review {{file}}" }),
    ]);
    render(
      <PromptLibraryDialog
        onClose={onClose}
        onInsert={onInsert}
        currentFilePath="src/main.ts"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("code-review")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith("Review src/main.ts", "code-review");
  });

  it("shows category filter pills", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", category: "Code Review" }),
      makePrompt({ id: "p2", category: "Testing", name: "write-tests" }),
    ]);
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
    });
    // Category names appear as both filter pills and badges on prompt cards
    expect(screen.getAllByText("Code Review").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Testing").length).toBeGreaterThanOrEqual(1);
  });
});
