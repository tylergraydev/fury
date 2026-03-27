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
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Bot: () => <span data-testid="icon-bot" />,
  Brain: () => <span data-testid="icon-brain" />,
  FilePlus2: () => <span data-testid="icon-fileplus2" />,
  FileSearch: () => <span data-testid="icon-filesearch" />,
  FileText: () => <span data-testid="icon-filetext" />,
  FolderSearch: () => <span data-testid="icon-foldersearch" />,
  GitCompare: () => <span data-testid="icon-gitcompare" />,
  Globe: () => <span data-testid="icon-globe" />,
  ListChecks: () => <span data-testid="icon-listchecks" />,
  ListPlus: () => <span data-testid="icon-listplus" />,
  NotebookPen: () => <span data-testid="icon-notebookpen" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,

}));

vi.mock("./VariableSubstitutionDialog", () => ({
  VariableSubstitutionDialog: ({
    onClose,
    onInsert,
    prompt,
  }: {
    onClose: () => void;
    onInsert: (resolved: string) => void;
    prompt: { name: string };
  }) => (
    <div data-testid="variable-substitution-dialog">
      <span data-testid="vsub-prompt-name">{prompt.name}</span>
      <button data-testid="vsub-cancel" onClick={onClose}>
        Cancel
      </button>
      <button
        data-testid="vsub-insert"
        onClick={() => onInsert("resolved content")}
      >
        Insert
      </button>
    </div>
  ),
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

/** Helper: render the dialog and wait for loadPrompts to complete */
async function renderAndWait(
  props: Partial<React.ComponentProps<typeof PromptLibraryDialog>> = {},
) {
  const defaultProps = {
    onClose: vi.fn(),
    onInsert: vi.fn(),
  };
  const merged = { ...defaultProps, ...props };
  const result = render(<PromptLibraryDialog {...merged} />);
  // Wait for loadPrompts effect to settle
  await waitFor(() => {
    expect(mockListPrompts).toHaveBeenCalled();
  });
  return { ...result, ...merged };
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
    await renderAndWait();
    expect(screen.getByText("Prompt Library")).toBeInTheDocument();
  });

  it("shows empty state when no prompts exist", async () => {
    await renderAndWait();
    expect(
      screen.getByText("No prompts saved yet. Create one to get started."),
    ).toBeInTheDocument();
  });

  it("renders prompts loaded from backend", async () => {
    mockListPrompts.mockResolvedValue([makePrompt()]);
    await renderAndWait();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.getByText("Reviews code for issues")).toBeInTheDocument();
  });

  it("filters prompts by search query on name", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", name: "code-review" }),
      makePrompt({ id: "p2", name: "write-tests", description: "Writes tests" }),
    ]);
    await renderAndWait();
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "write" } });
    expect(screen.getByText("write-tests")).toBeInTheDocument();
    expect(screen.queryByText("code-review")).not.toBeInTheDocument();
  });

  it("filters prompts by search query on description", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", name: "alpha", description: "Special description" }),
      makePrompt({ id: "p2", name: "beta", description: "Other text" }),
    ]);
    await renderAndWait();
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "special" } });
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("filters prompts by search query on content", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", name: "alpha", content: "unique content here" }),
      makePrompt({ id: "p2", name: "beta", content: "other stuff" }),
    ]);
    await renderAndWait();
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "unique" } });
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("filters prompts by search query on tags", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", name: "alpha", tags: ["security"] }),
      makePrompt({ id: "p2", name: "beta", tags: ["performance"] }),
    ]);
    await renderAndWait();
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "security" } });
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("filters prompts by search query with null description", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", name: "alpha", description: null }),
    ]);
    await renderAndWait();
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
  });

  it("shows 'No prompts match' when search yields no results but prompts exist", async () => {
    mockListPrompts.mockResolvedValue([makePrompt()]);
    await renderAndWait();
    const searchInput = screen.getByPlaceholderText("Search prompts...");
    fireEvent.change(searchInput, { target: { value: "zzzznotfound" } });
    expect(screen.getByText("No prompts match your search.")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    usePromptLibraryStore.setState({ loading: true });
    render(
      <PromptLibraryDialog onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", async () => {
    const { onClose } = await renderAndWait();
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", async () => {
    const { onClose } = await renderAndWait();
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking the overlay backdrop", async () => {
    const { onClose } = await renderAndWait();
    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside the dialog (not backdrop)", async () => {
    const { onClose } = await renderAndWait();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens create form when New Prompt is clicked", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByText("New Prompt"));
    expect(screen.getByPlaceholderText("e.g. code-review")).toBeInTheDocument();
    expect(screen.getByText("Create Prompt")).toBeInTheDocument();
  });

  it("shows 'New Prompt' header in create mode", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByText("New Prompt"));
    // The header should not say "Prompt Library" or "Edit Prompt"
    expect(screen.queryByText("Prompt Library")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit Prompt")).not.toBeInTheDocument();
  });

  it("inserts prompt without variables directly", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Simple prompt with no variables" }),
    ]);
    const { onInsert, onClose } = await renderAndWait();
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith(
      "Simple prompt with no variables",
      "code-review",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("auto-fills file variable and inserts", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Review {{file}}" }),
    ]);
    const { onInsert } = await renderAndWait({
      currentFilePath: "src/main.ts",
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith("Review src/main.ts", "code-review");
  });

  it("auto-fills selection variable", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Refactor {{selection}}" }),
    ]);
    const { onInsert } = await renderAndWait({
      currentSelection: "const x = 1;",
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith("Refactor const x = 1;", "code-review");
  });

  it("auto-fills branch variable", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "On branch {{branch}}" }),
    ]);
    const { onInsert } = await renderAndWait({
      currentBranch: "main",
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith("On branch main", "code-review");
  });

  it("auto-fills workspace variable", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Workspace: {{workspace}}" }),
    ]);
    const { onInsert } = await renderAndWait({
      currentWorkspace: "my-project",
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith("Workspace: my-project", "code-review");
  });

  it("auto-fills all variables when all context provided", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({
        content: "{{file}} {{selection}} {{branch}} {{workspace}}",
      }),
    ]);
    const { onInsert } = await renderAndWait({
      currentFilePath: "f.ts",
      currentSelection: "sel",
      currentBranch: "dev",
      currentWorkspace: "ws",
    });
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith("f.ts sel dev ws", "code-review");
  });

  it("does not replace auto-fill variables when context is not provided", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "{{file}} {{selection}} {{branch}} {{workspace}}" }),
    ]);
    const { onInsert } = await renderAndWait();
    fireEvent.click(screen.getByText("code-review"));
    expect(onInsert).toHaveBeenCalledWith(
      "{{file}} {{selection}} {{branch}} {{workspace}}",
      "code-review",
    );
  });

  it("opens VariableSubstitutionDialog for prompts with custom variables", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Fix {{custom_var}} in {{file}}" }),
    ]);
    await renderAndWait({ currentFilePath: "test.ts" });
    fireEvent.click(screen.getByText("code-review"));
    expect(screen.getByTestId("variable-substitution-dialog")).toBeInTheDocument();
  });

  it("VariableSubstitutionDialog onClose resets pendingInsert", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Fix {{custom_var}}" }),
    ]);
    await renderAndWait();
    fireEvent.click(screen.getByText("code-review"));
    expect(screen.getByTestId("variable-substitution-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vsub-cancel"));
    expect(screen.queryByTestId("variable-substitution-dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Prompt Library")).toBeInTheDocument();
  });

  it("VariableSubstitutionDialog onInsert calls onInsert and onClose", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Fix {{custom_var}}" }),
    ]);
    const { onInsert, onClose } = await renderAndWait();
    fireEvent.click(screen.getByText("code-review"));
    fireEvent.click(screen.getByTestId("vsub-insert"));
    expect(onInsert).toHaveBeenCalledWith("resolved content", "code-review");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows category filter pills", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", category: "Code Review" }),
      makePrompt({ id: "p2", category: "Testing", name: "write-tests" }),
    ]);
    await renderAndWait();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getAllByText("Code Review").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Testing").length).toBeGreaterThanOrEqual(1);
  });

  it("does not show category pills when no categories exist", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", category: null }),
    ]);
    await renderAndWait();
    expect(screen.queryByText("All")).not.toBeInTheDocument();
  });

  it("filters prompts by selected category", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", category: "Code Review", name: "review-prompt" }),
      makePrompt({ id: "p2", category: "Testing", name: "test-prompt" }),
    ]);
    await renderAndWait();
    const testingButtons = screen.getAllByText("Testing");
    const filterButton = testingButtons.find((el) => el.tagName === "BUTTON")!;
    fireEvent.click(filterButton);
    expect(screen.getByText("test-prompt")).toBeInTheDocument();
    expect(screen.queryByText("review-prompt")).not.toBeInTheDocument();
  });

  it("deselects category when clicking same category again", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", category: "Code Review", name: "review-prompt" }),
      makePrompt({ id: "p2", category: "Testing", name: "test-prompt" }),
    ]);
    await renderAndWait();
    const testingButtons = screen.getAllByText("Testing");
    const filterButton = testingButtons.find((el) => el.tagName === "BUTTON")!;
    fireEvent.click(filterButton);
    expect(screen.queryByText("review-prompt")).not.toBeInTheDocument();
    fireEvent.click(filterButton);
    expect(screen.getByText("review-prompt")).toBeInTheDocument();
    expect(screen.getByText("test-prompt")).toBeInTheDocument();
  });

  it("clicking All resets category filter", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ id: "p1", category: "Code Review", name: "review-prompt" }),
      makePrompt({ id: "p2", category: "Testing", name: "test-prompt" }),
    ]);
    await renderAndWait();
    const testingButtons = screen.getAllByText("Testing");
    const filterButton = testingButtons.find((el) => el.tagName === "BUTTON")!;
    fireEvent.click(filterButton);
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText("review-prompt")).toBeInTheDocument();
    expect(screen.getByText("test-prompt")).toBeInTheDocument();
  });

  it("renders prompt without description", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ description: null }),
    ]);
    await renderAndWait();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.queryByText("Reviews code for issues")).not.toBeInTheDocument();
  });

  it("renders prompt without category badge", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ category: null }),
    ]);
    await renderAndWait();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.queryByText("Code Review")).not.toBeInTheDocument();
  });

  it("renders prompt tags", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ tags: ["security", "review"] }),
    ]);
    await renderAndWait();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();
  });

  it("renders prompt without tags", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ tags: [] }),
    ]);
    await renderAndWait();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.queryByTestId("tag-icon")).not.toBeInTheDocument();
  });

  it("handles keyboard Enter on prompt item", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Simple content" }),
    ]);
    const { onInsert } = await renderAndWait();
    const promptItem = screen.getByRole("button", { name: /code-review/i });
    fireEvent.keyDown(promptItem, { key: "Enter" });
    expect(onInsert).toHaveBeenCalledWith("Simple content", "code-review");
  });

  it("handles keyboard Space on prompt item", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Simple content" }),
    ]);
    const { onInsert } = await renderAndWait();
    const promptItem = screen.getByRole("button", { name: /code-review/i });
    fireEvent.keyDown(promptItem, { key: " " });
    expect(onInsert).toHaveBeenCalledWith("Simple content", "code-review");
  });

  it("does not trigger insert on other keys", async () => {
    mockListPrompts.mockResolvedValue([
      makePrompt({ content: "Simple content" }),
    ]);
    const { onInsert } = await renderAndWait();
    const promptItem = screen.getByRole("button", { name: /code-review/i });
    fireEvent.keyDown(promptItem, { key: "Tab" });
    expect(onInsert).not.toHaveBeenCalled();
  });

  describe("edit prompt flow", () => {
    it("opens edit form with populated fields when Edit button clicked", async () => {
      mockListPrompts.mockResolvedValue([
        makePrompt({
          name: "my-prompt",
          content: "my content",
          description: "my desc",
          category: "My Cat",
          tags: ["tag1", "tag2"],
        }),
      ]);
      await renderAndWait();
      const editButton = screen.getByTitle("Edit");
      fireEvent.click(editButton);
      expect(screen.getByText("Edit Prompt")).toBeInTheDocument();
      expect(screen.getByDisplayValue("my-prompt")).toBeInTheDocument();
      expect(screen.getByDisplayValue("my content")).toBeInTheDocument();
      expect(screen.getByDisplayValue("my desc")).toBeInTheDocument();
      expect(screen.getByDisplayValue("My Cat")).toBeInTheDocument();
      expect(screen.getByDisplayValue("tag1, tag2")).toBeInTheDocument();
      expect(screen.getByText("Update Prompt")).toBeInTheDocument();
    });

    it("edit button stopsPropagation (does not trigger insert)", async () => {
      mockListPrompts.mockResolvedValue([makePrompt()]);
      const { onInsert } = await renderAndWait();
      const editButton = screen.getByTitle("Edit");
      fireEvent.click(editButton);
      expect(onInsert).not.toHaveBeenCalled();
    });

    it("populates editor with empty description/category as empty strings", async () => {
      mockListPrompts.mockResolvedValue([
        makePrompt({ description: null, category: null }),
      ]);
      await renderAndWait();
      const editButton = screen.getByTitle("Edit");
      fireEvent.click(editButton);
      const descInput = screen.getByPlaceholderText("Optional description");
      const catInput = screen.getByPlaceholderText("e.g. Code Review");
      expect(descInput).toHaveValue("");
      expect(catInput).toHaveValue("");
    });
  });

  describe("delete prompt", () => {
    it("deletes prompt when Delete button clicked", async () => {
      mockListPrompts.mockResolvedValue([makePrompt()]);
      mockDeletePrompt.mockResolvedValue(undefined);
      await renderAndWait();
      const deleteButton = screen.getByTitle("Delete");
      fireEvent.click(deleteButton);
      await waitFor(() => {
        expect(mockDeletePrompt).toHaveBeenCalledWith("prompt-1");
      });
    });

    it("delete button stopsPropagation (does not trigger insert)", async () => {
      mockListPrompts.mockResolvedValue([makePrompt()]);
      mockDeletePrompt.mockResolvedValue(undefined);
      const { onInsert } = await renderAndWait();
      const deleteButton = screen.getByTitle("Delete");
      fireEvent.click(deleteButton);
      expect(onInsert).not.toHaveBeenCalled();
    });

    it("handles delete error silently", async () => {
      mockListPrompts.mockResolvedValue([makePrompt()]);
      mockDeletePrompt.mockRejectedValue(new Error("Delete failed"));
      await renderAndWait();
      const deleteButton = screen.getByTitle("Delete");
      fireEvent.click(deleteButton);
      await waitFor(() => {
        expect(mockDeletePrompt).toHaveBeenCalled();
      });
    });
  });

  describe("create prompt flow", () => {
    it("save button is disabled when name is empty", async () => {
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));
      const contentInput = screen.getByPlaceholderText(
        "Review {{file}} for security vulnerabilities and suggest fixes.",
      );
      fireEvent.change(contentInput, { target: { value: "some content" } });
      const saveButton = screen.getByText("Create Prompt").closest("button")!;
      expect(saveButton).toBeDisabled();
    });

    it("save button is disabled when content is empty", async () => {
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));
      const nameInput = screen.getByPlaceholderText("e.g. code-review");
      fireEvent.change(nameInput, { target: { value: "my prompt" } });
      const saveButton = screen.getByText("Create Prompt").closest("button")!;
      expect(saveButton).toBeDisabled();
    });

    it("shows validation error for empty name when handleSave is triggered", async () => {
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));
      const contentInput = screen.getByPlaceholderText(
        "Review {{file}} for security vulnerabilities and suggest fixes.",
      );
      // Only fill content, leave name empty
      fireEvent.change(contentInput, { target: { value: "content" } });
      // The save button is disabled since name is empty.
      // To reach the defensive validation inside handleSave, extract
      // the onClick handler from React's internal props on the button.
      const saveButton = screen.getByText("Create Prompt").closest("button")!;
      const reactPropsKey = Object.keys(saveButton).find(
        (key) => key.startsWith("__reactProps$"),
      )!;
      const props = (saveButton as unknown as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>;
      const onClick = props.onClick as () => void;
      onClick();
      await waitFor(() => {
        expect(screen.getByText("Prompt name is required")).toBeInTheDocument();
      });
    });

    it("shows validation error for empty content when handleSave is triggered", async () => {
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));
      const nameInput = screen.getByPlaceholderText("e.g. code-review");
      const contentInput = screen.getByPlaceholderText(
        "Review {{file}} for security vulnerabilities and suggest fixes.",
      );
      // Fill both to enable button
      fireEvent.change(nameInput, { target: { value: "valid-name" } });
      fireEvent.change(contentInput, { target: { value: "temp" } });
      const saveButton = screen.getByText("Create Prompt").closest("button")!;
      // Clear content
      fireEvent.change(contentInput, { target: { value: "" } });
      // Get onClick from React props
      const reactPropsKey = Object.keys(saveButton).find(
        (key) => key.startsWith("__reactProps$"),
      );
      if (reactPropsKey) {
        const props = (saveButton as unknown as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>;
        const onClick = props.onClick as () => void;
        onClick();
        await waitFor(() => {
          expect(
            screen.getByText("Prompt content is required"),
          ).toBeInTheDocument();
        });
      }
    });

    it("saves new prompt successfully", async () => {
      mockCreatePrompt.mockResolvedValue(
        makePrompt({ id: "new-1", name: "new-prompt" }),
      );
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));

      fireEvent.change(screen.getByPlaceholderText("e.g. code-review"), {
        target: { value: "new-prompt" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          "Review {{file}} for security vulnerabilities and suggest fixes.",
        ),
        { target: { value: "content here" } },
      );
      fireEvent.change(screen.getByPlaceholderText("Optional description"), {
        target: { value: "desc" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. Code Review"), {
        target: { value: "Cat" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("review, security (comma-separated)"),
        { target: { value: "tag1, tag2" } },
      );

      fireEvent.click(screen.getByText("Create Prompt"));

      await waitFor(() => {
        expect(mockCreatePrompt).toHaveBeenCalledWith({
          name: "new-prompt",
          content: "content here",
          description: "desc",
          category: "Cat",
          tags: ["tag1", "tag2"],
        });
      });
      await waitFor(() => {
        expect(screen.getByText("Prompt Library")).toBeInTheDocument();
      });
    });

    it("saves new prompt without optional fields", async () => {
      mockCreatePrompt.mockResolvedValue(
        makePrompt({ id: "new-1", name: "minimal" }),
      );
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));

      fireEvent.change(screen.getByPlaceholderText("e.g. code-review"), {
        target: { value: "minimal" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          "Review {{file}} for security vulnerabilities and suggest fixes.",
        ),
        { target: { value: "just content" } },
      );

      fireEvent.click(screen.getByText("Create Prompt"));

      await waitFor(() => {
        expect(mockCreatePrompt).toHaveBeenCalledWith({
          name: "minimal",
          content: "just content",
          description: undefined,
          category: undefined,
          tags: undefined,
        });
      });
    });

    it("shows error when save fails", async () => {
      mockCreatePrompt.mockRejectedValue(new Error("Network error"));
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));

      fireEvent.change(screen.getByPlaceholderText("e.g. code-review"), {
        target: { value: "test" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          "Review {{file}} for security vulnerabilities and suggest fixes.",
        ),
        { target: { value: "content" } },
      );

      fireEvent.click(screen.getByText("Create Prompt"));

      await waitFor(() => {
        expect(screen.getByText("Error: Network error")).toBeInTheDocument();
      });
      expect(screen.getByText("Create Prompt")).toBeInTheDocument();
    });

    it("cancel button returns to library view", async () => {
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));
      expect(screen.getByText("Create Prompt")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Cancel"));
      expect(screen.getByText("Prompt Library")).toBeInTheDocument();
    });
  });

  describe("update prompt flow", () => {
    it("saves updated prompt successfully", async () => {
      mockListPrompts.mockResolvedValue([makePrompt()]);
      mockUpdatePrompt.mockResolvedValue(makePrompt({ name: "updated-name" }));
      await renderAndWait();

      fireEvent.click(screen.getByTitle("Edit"));

      const nameInput = screen.getByDisplayValue("code-review");
      fireEvent.change(nameInput, { target: { value: "updated-name" } });

      fireEvent.click(screen.getByText("Update Prompt"));

      await waitFor(() => {
        expect(mockUpdatePrompt).toHaveBeenCalledWith("prompt-1", {
          name: "updated-name",
          content: "Review {{file}} for issues",
          description: "Reviews code for issues",
          category: "Code Review",
          tags: ["review"],
        });
      });
      await waitFor(() => {
        expect(screen.getByText("Prompt Library")).toBeInTheDocument();
      });
    });

    it("saves updated prompt with empty optional fields as undefined", async () => {
      mockListPrompts.mockResolvedValue([
        makePrompt({ description: null, category: null, tags: [] }),
      ]);
      mockUpdatePrompt.mockResolvedValue(
        makePrompt({ description: null, category: null, tags: [] }),
      );
      await renderAndWait();

      fireEvent.click(screen.getByTitle("Edit"));

      // Description and category fields should be empty
      // Just click Update without filling them
      fireEvent.click(screen.getByText("Update Prompt"));

      await waitFor(() => {
        expect(mockUpdatePrompt).toHaveBeenCalledWith("prompt-1", {
          name: "code-review",
          content: "Review {{file}} for issues",
          description: undefined,
          category: undefined,
          tags: [],
        });
      });
    });

    it("shows error when update fails", async () => {
      mockListPrompts.mockResolvedValue([makePrompt()]);
      mockUpdatePrompt.mockRejectedValue(new Error("Update failed"));
      await renderAndWait();

      fireEvent.click(screen.getByTitle("Edit"));
      fireEvent.click(screen.getByText("Update Prompt"));

      await waitFor(() => {
        expect(screen.getByText("Error: Update failed")).toBeInTheDocument();
      });
    });
  });

  describe("editor form interactions", () => {
    it("updates all form fields", async () => {
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));

      const nameInput = screen.getByPlaceholderText("e.g. code-review");
      fireEvent.change(nameInput, { target: { value: "my-name" } });
      expect(nameInput).toHaveValue("my-name");

      const contentInput = screen.getByPlaceholderText(
        "Review {{file}} for security vulnerabilities and suggest fixes.",
      );
      fireEvent.change(contentInput, { target: { value: "new content" } });
      expect(contentInput).toHaveValue("new content");

      const descInput = screen.getByPlaceholderText("Optional description");
      fireEvent.change(descInput, { target: { value: "new desc" } });
      expect(descInput).toHaveValue("new desc");

      const catInput = screen.getByPlaceholderText("e.g. Code Review");
      fireEvent.change(catInput, { target: { value: "My Category" } });
      expect(catInput).toHaveValue("My Category");

      const tagsInput = screen.getByPlaceholderText(
        "review, security (comma-separated)",
      );
      fireEvent.change(tagsInput, { target: { value: "a, b" } });
      expect(tagsInput).toHaveValue("a, b");
    });

    it("renders category datalist options from existing categories", async () => {
      mockListPrompts.mockResolvedValue([
        makePrompt({ id: "p1", category: "Alpha" }),
        makePrompt({ id: "p2", category: "Beta" }),
      ]);
      await renderAndWait();
      fireEvent.click(screen.getByText("New Prompt"));
      const datalist = document.getElementById("prompt-categories")!;
      expect(datalist).toBeInTheDocument();
      const options = datalist.querySelectorAll("option");
      const values = Array.from(options).map((o) => o.getAttribute("value"));
      expect(values).toContain("Alpha");
      expect(values).toContain("Beta");
    });
  });

  it("calls loadPrompts on mount", async () => {
    await renderAndWait();
    expect(mockListPrompts).toHaveBeenCalled();
  });

  it("has correct aria attributes on dialog", async () => {
    await renderAndWait();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Prompt library");
  });
});
