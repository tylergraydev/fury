import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SnippetManagerDialog } from "./SnippetManagerDialog";
import { useSnippetStore } from "../../stores/snippetStore";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Pencil: () => <span data-testid="pencil-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  Scissors: () => <span data-testid="scissors-icon" />,
  Search: () => <span data-testid="search-icon" />,
  Tag: () => <span data-testid="tag-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));

const mockListSnippets = vi.fn();
const mockCreateSnippet = vi.fn();
const mockUpdateSnippet = vi.fn();
const mockDeleteSnippet = vi.fn();

vi.mock("../../lib/tauri", () => ({
  listSnippets: (...args: unknown[]) => mockListSnippets(...args),
  createSnippet: (...args: unknown[]) => mockCreateSnippet(...args),
  updateSnippet: (...args: unknown[]) => mockUpdateSnippet(...args),
  deleteSnippet: (...args: unknown[]) => mockDeleteSnippet(...args),
}));

function makeSnippet(overrides: Record<string, unknown> = {}) {
  return {
    id: "snippet-1",
    title: "fetch helper",
    content: "async function fetchJSON(url: string) { ... }",
    language: "typescript",
    description: "Typed fetch wrapper",
    tags: ["http"],
    source: "chat",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockListSnippets.mockReset().mockResolvedValue([]);
  mockCreateSnippet.mockReset();
  mockUpdateSnippet.mockReset();
  mockDeleteSnippet.mockReset();
  useSnippetStore.setState({
    snippets: [],
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("SnippetManagerDialog", () => {
  it("renders the dialog with title", async () => {
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    expect(screen.getByText("Snippet Manager")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
  });

  it("shows empty state when no snippets exist", async () => {
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByText("No snippets saved yet. Create one to get started."),
      ).toBeInTheDocument();
    });
  });

  it("renders snippets loaded from backend", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    expect(screen.getByText("Typed fetch wrapper")).toBeInTheDocument();
  });

  it("filters snippets by search query", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", title: "fetch helper" }),
      makeSnippet({ id: "s2", title: "sort utility", description: "Array sorting" }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search snippets...");
    fireEvent.change(searchInput, { target: { value: "sort" } });
    expect(screen.getByText("sort utility")).toBeInTheDocument();
    expect(screen.queryByText("fetch helper")).not.toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    render(<SnippetManagerDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<SnippetManagerDialog onClose={onClose} />);
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("opens create form when New Snippet is clicked", async () => {
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));
    expect(screen.getByPlaceholderText("e.g. fetch helper")).toBeInTheDocument();
    expect(screen.getByText("Create Snippet")).toBeInTheDocument();
  });

  it("shows tag filter pills", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", tags: ["http"] }),
      makeSnippet({ id: "s2", tags: ["utility"], title: "sort utility" }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
    });
    expect(screen.getAllByText("http").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("utility").length).toBeGreaterThanOrEqual(1);
  });

  it("inserts snippet content when onInsert is provided", async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={onClose} onInsert={onInsert} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("fetch helper"));
    expect(onInsert).toHaveBeenCalledWith(
      "async function fetchJSON(url: string) { ... }",
    );
    expect(onClose).toHaveBeenCalled();
  });

  // --- Additional tests for full coverage ---

  it("shows loading state", () => {
    useSnippetStore.setState({ loading: true });
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows 'No snippets match your search' when filter yields no results", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search snippets...");
    fireEvent.change(searchInput, { target: { value: "zzzznonexistent" } });
    expect(screen.getByText("No snippets match your search.")).toBeInTheDocument();
  });

  it("filters snippets by tag when tag pill is clicked", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", tags: ["http"], title: "fetch helper" }),
      makeSnippet({ id: "s2", tags: ["utility"], title: "sort utility" }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    // Click the "utility" tag pill (in the filter area, not in snippet tags)
    const tagButtons = screen.getAllByText("utility");
    // The first "utility" button in the filter area
    const filterButton = tagButtons[0].closest("button")!;
    fireEvent.click(filterButton);
    expect(screen.getByText("sort utility")).toBeInTheDocument();
    expect(screen.queryByText("fetch helper")).not.toBeInTheDocument();
  });

  it("deselects tag when clicking the same tag again", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", tags: ["http"], title: "fetch helper" }),
      makeSnippet({ id: "s2", tags: ["utility"], title: "sort utility" }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const tagButtons = screen.getAllByText("utility");
    const filterButton = tagButtons[0].closest("button")!;
    // Select tag
    fireEvent.click(filterButton);
    expect(screen.queryByText("fetch helper")).not.toBeInTheDocument();
    // Deselect tag
    fireEvent.click(filterButton);
    expect(screen.getByText("fetch helper")).toBeInTheDocument();
    expect(screen.getByText("sort utility")).toBeInTheDocument();
  });

  it("clicking 'All' tag resets the tag filter", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", tags: ["http"], title: "fetch helper" }),
      makeSnippet({ id: "s2", tags: ["utility"], title: "sort utility" }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
    });
    // Select a tag first
    const tagButtons = screen.getAllByText("utility");
    fireEvent.click(tagButtons[0].closest("button")!);
    expect(screen.queryByText("fetch helper")).not.toBeInTheDocument();
    // Click "All"
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText("fetch helper")).toBeInTheDocument();
  });

  it("filters by content match in search", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", title: "A", content: "uniqueContentXYZ", description: null, language: null, tags: [] }),
      makeSnippet({ id: "s2", title: "B", content: "other stuff", description: null, language: null, tags: [] }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Search snippets..."), {
      target: { value: "uniqueContentXYZ" },
    });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("filters by language match in search", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", title: "A", language: "python", tags: [] }),
      makeSnippet({ id: "s2", title: "B", language: "rust", tags: [] }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Search snippets..."), {
      target: { value: "python" },
    });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("filters by tag match in search", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", title: "A", tags: ["specialtag"], description: null, language: null }),
      makeSnippet({ id: "s2", title: "B", tags: ["other"], description: null, language: null }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Search snippets..."), {
      target: { value: "specialtag" },
    });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("renders snippet without language, description, or tags", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", title: "bare snippet", language: null, description: null, tags: [] }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("bare snippet")).toBeInTheDocument();
    });
    // No language badge, no description, no tag icons
    expect(screen.queryByText("typescript")).not.toBeInTheDocument();
    expect(screen.queryByText("Typed fetch wrapper")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tag-icon")).not.toBeInTheDocument();
  });

  it("calls onClose when clicking overlay background", () => {
    const onClose = vi.fn();
    render(<SnippetManagerDialog onClose={onClose} />);
    // The overlay is the outermost div with the fixed class
    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside dialog (not overlay)", () => {
    const onClose = vi.fn();
    render(<SnippetManagerDialog onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    // onClose called only from Close/X buttons, not from clicking inside dialog
    expect(onClose).not.toHaveBeenCalled();
  });

  it("copies snippet to clipboard when clicking snippet without onInsert", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    // Click the snippet row (no onInsert provided)
    fireEvent.click(screen.getByText("fetch helper"));
    expect(writeTextMock).toHaveBeenCalledWith(
      "async function fetchJSON(url: string) { ... }",
    );
  });

  it("copies snippet via copy button and shows check icon", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    // Click the copy button
    const copyButton = screen.getByTitle("Copy to clipboard");
    await act(async () => {
      fireEvent.click(copyButton);
    });
    expect(writeTextMock).toHaveBeenCalledWith(
      "async function fetchJSON(url: string) { ... }",
    );
    // Check icon should now be visible
    expect(screen.getByTestId("check-icon")).toBeInTheDocument();
    // After 2 seconds, it should revert
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId("check-icon")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("handles clipboard error gracefully", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Clipboard unavailable"));
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const copyButton = screen.getByTitle("Copy to clipboard");
    await act(async () => {
      fireEvent.click(copyButton);
    });
    // Should not crash
    expect(screen.getByText("fetch helper")).toBeInTheDocument();
  });

  it("deletes a snippet when delete button is clicked", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    mockDeleteSnippet.mockResolvedValue(undefined);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const deleteButton = screen.getByTitle("Delete");
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(mockDeleteSnippet).toHaveBeenCalledWith("snippet-1");
  });

  it("handles delete error gracefully", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    mockDeleteSnippet.mockRejectedValue(new Error("delete failed"));
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const deleteButton = screen.getByTitle("Delete");
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    // Should not crash
    expect(screen.getByText("fetch helper")).toBeInTheDocument();
  });

  it("opens edit form when edit button is clicked", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const editButton = screen.getByTitle("Edit");
    fireEvent.click(editButton);
    // Should show edit form
    expect(screen.getByText("Edit Snippet")).toBeInTheDocument();
    expect(screen.getByText("Update Snippet")).toBeInTheDocument();
    // Fields should be pre-filled
    expect(screen.getByDisplayValue("fetch helper")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Typed fetch wrapper")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http")).toBeInTheDocument();
  });

  it("opens edit form for snippet without optional fields", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ language: null, description: null, tags: [] }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const editButton = screen.getByTitle("Edit");
    fireEvent.click(editButton);
    expect(screen.getByText("Edit Snippet")).toBeInTheDocument();
    // Language and description should be empty strings
    const langSelect = screen.getByDisplayValue("Auto-detect") as HTMLSelectElement;
    expect(langSelect.value).toBe("");
  });

  it("creates a new snippet via the form", async () => {
    const createdSnippet = makeSnippet({ id: "new-1", title: "new snippet" });
    mockCreateSnippet.mockResolvedValue(createdSnippet);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    // Fill in the form
    fireEvent.change(screen.getByPlaceholderText("e.g. fetch helper"), {
      target: { value: "new snippet" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste your code snippet here..."), {
      target: { value: "console.log('hello')" },
    });
    fireEvent.change(screen.getByPlaceholderText("http, utility (comma-separated)"), {
      target: { value: "test, demo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Optional description"), {
      target: { value: "A test snippet" },
    });

    // Select language
    const langSelect = screen.getByDisplayValue("Auto-detect");
    fireEvent.change(langSelect, { target: { value: "javascript" } });

    // Save
    await act(async () => {
      fireEvent.click(screen.getByText("Create Snippet"));
    });

    expect(mockCreateSnippet).toHaveBeenCalledWith({
      title: "new snippet",
      content: "console.log('hello')",
      language: "javascript",
      description: "A test snippet",
      tags: ["test", "demo"],
    });
    // Should go back to library view
    expect(screen.getByText("Snippet Manager")).toBeInTheDocument();
  });

  it("creates snippet without optional fields (no language, description, tags)", async () => {
    const createdSnippet = makeSnippet({ id: "new-2", title: "minimal" });
    mockCreateSnippet.mockResolvedValue(createdSnippet);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    fireEvent.change(screen.getByPlaceholderText("e.g. fetch helper"), {
      target: { value: "minimal" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste your code snippet here..."), {
      target: { value: "code here" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Create Snippet"));
    });

    expect(mockCreateSnippet).toHaveBeenCalledWith({
      title: "minimal",
      content: "code here",
      language: undefined,
      description: undefined,
      tags: undefined,
    });
  });

  it("updates an existing snippet via the edit form", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    mockUpdateSnippet.mockResolvedValue(makeSnippet({ title: "updated title" }));
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });

    // Open edit
    fireEvent.click(screen.getByTitle("Edit"));

    // Change title
    const titleInput = screen.getByDisplayValue("fetch helper");
    fireEvent.change(titleInput, { target: { value: "updated title" } });

    // Save
    await act(async () => {
      fireEvent.click(screen.getByText("Update Snippet"));
    });

    expect(mockUpdateSnippet).toHaveBeenCalledWith("snippet-1", {
      title: "updated title",
      content: "async function fetchJSON(url: string) { ... }",
      language: "typescript",
      description: "Typed fetch wrapper",
      tags: ["http"],
    });
    expect(screen.getByText("Snippet Manager")).toBeInTheDocument();
  });

  it("shows error when save fails", async () => {
    mockCreateSnippet.mockRejectedValue(new Error("Save failed"));
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    fireEvent.change(screen.getByPlaceholderText("e.g. fetch helper"), {
      target: { value: "will fail" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste your code snippet here..."), {
      target: { value: "some content" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Create Snippet"));
    });

    expect(screen.getByText("Error: Save failed")).toBeInTheDocument();
    // Should remain in editor view (not go back to library)
    expect(screen.getByText("Create Snippet")).toBeInTheDocument();
  });

  it("cancel button returns to library view and resets editor", async () => {
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    // Fill some fields
    fireEvent.change(screen.getByPlaceholderText("e.g. fetch helper"), {
      target: { value: "test" },
    });

    // Click cancel
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Snippet Manager")).toBeInTheDocument();

    // Re-open create - fields should be empty
    fireEvent.click(screen.getByText("New Snippet"));
    expect(
      (screen.getByPlaceholderText("e.g. fetch helper") as HTMLInputElement).value,
    ).toBe("");
  });

  it("cancel after editing resets editor and clears editingSnippet", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Edit Snippet")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Snippet Manager")).toBeInTheDocument();

    // Open create - should show "New Snippet" not "Edit Snippet"
    fireEvent.click(screen.getByText("New Snippet"));
    expect(screen.getByText("New Snippet", { selector: "h2" })).toBeInTheDocument();
  });

  it("handles keyboard Enter on snippet row with onInsert", async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={onClose} onInsert={onInsert} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const row = screen.getByRole("button", { name: /fetch helper/i });
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onInsert).toHaveBeenCalledWith(
      "async function fetchJSON(url: string) { ... }",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("handles keyboard Space on snippet row without onInsert (copies)", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const row = screen.getByRole("button", { name: /fetch helper/i });
    fireEvent.keyDown(row, { key: " " });
    expect(writeTextMock).toHaveBeenCalledWith(
      "async function fetchJSON(url: string) { ... }",
    );
  });

  it("does not trigger action on other keyboard keys", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    const row = screen.getByRole("button", { name: /fetch helper/i });
    fireEvent.keyDown(row, { key: "Tab" });
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("search matches description field", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ id: "s1", title: "A", description: "unique description here" }),
      makeSnippet({ id: "s2", title: "B", description: "something else" }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Search snippets..."), {
      target: { value: "unique description" },
    });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("does not show tag filter section when no tags exist", () => {
    useSnippetStore.setState({ snippets: [makeSnippet({ tags: [] }) as never] });
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    expect(screen.queryByText("All")).not.toBeInTheDocument();
  });

  it("save button is disabled when title is empty", async () => {
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    // Only fill content, not title
    fireEvent.change(screen.getByPlaceholderText("Paste your code snippet here..."), {
      target: { value: "some code" },
    });

    const saveBtn = screen.getByText("Create Snippet");
    expect(saveBtn).toBeDisabled();
  });

  it("save button is disabled when content is empty", async () => {
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    // Only fill title, not content
    fireEvent.change(screen.getByPlaceholderText("e.g. fetch helper"), {
      target: { value: "some title" },
    });

    const saveBtn = screen.getByText("Create Snippet");
    expect(saveBtn).toBeDisabled();
  });

  it("update snippet with empty optional fields sends undefined", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ language: "typescript", description: "desc" }),
    ]);
    mockUpdateSnippet.mockResolvedValue(makeSnippet());
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit"));

    // Clear language
    const langSelect = screen.getByDisplayValue("typescript") as HTMLSelectElement;
    fireEvent.change(langSelect, { target: { value: "" } });

    // Clear description
    const descInput = screen.getByDisplayValue("desc");
    fireEvent.change(descInput, { target: { value: "" } });

    // Clear tags
    const tagInput = screen.getByDisplayValue("http");
    fireEvent.change(tagInput, { target: { value: "" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Update Snippet"));
    });

    expect(mockUpdateSnippet).toHaveBeenCalledWith("snippet-1", {
      title: "fetch helper",
      content: "async function fetchJSON(url: string) { ... }",
      language: undefined,
      description: undefined,
      tags: [],
    });
  });

  it("shows error when update fails", async () => {
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    mockUpdateSnippet.mockRejectedValue(new Error("Update failed"));
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit"));

    await act(async () => {
      fireEvent.click(screen.getByText("Update Snippet"));
    });

    expect(screen.getByText("Error: Update failed")).toBeInTheDocument();
    // Should stay in editor
    expect(screen.getByText("Update Snippet")).toBeInTheDocument();
  });

  it("shows 'Saving...' text on save button while saving", async () => {
    let resolveCreate: (value: unknown) => void;
    mockCreateSnippet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockListSnippets).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText("New Snippet"));

    fireEvent.change(screen.getByPlaceholderText("e.g. fetch helper"), {
      target: { value: "test" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste your code snippet here..."), {
      target: { value: "code" },
    });

    // Start save but don't resolve yet
    act(() => {
      fireEvent.click(screen.getByText("Create Snippet"));
    });

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    // Resolve the promise
    await act(async () => {
      resolveCreate!(makeSnippet());
    });
  });

  it("renders snippet with tags displayed in the list", async () => {
    mockListSnippets.mockResolvedValue([
      makeSnippet({ tags: ["http", "utility"] }),
    ]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    // Tags should be visible (both in filter pills and in snippet)
    expect(screen.getAllByTestId("tag-icon").length).toBeGreaterThanOrEqual(1);
  });

  it("stopPropagation on edit button prevents row click", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle("Edit"));
    // Should open edit form, not copy
    expect(screen.getByText("Edit Snippet")).toBeInTheDocument();
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("stopPropagation on delete button prevents row click", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    mockListSnippets.mockResolvedValue([makeSnippet()]);
    mockDeleteSnippet.mockResolvedValue(undefined);
    render(<SnippetManagerDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("fetch helper")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Delete"));
    });
    // Should delete, not copy
    expect(mockDeleteSnippet).toHaveBeenCalled();
    expect(writeTextMock).not.toHaveBeenCalled();
  });
});
