import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
});
