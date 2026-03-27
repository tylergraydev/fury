import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariableSubstitutionDialog } from "./VariableSubstitutionDialog";
import type { Prompt } from "../../lib/tauri";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  Zap: () => <span data-testid="zap-icon" />,
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ClipboardCheck: () => <span data-testid="icon-clipboardcheck" />,
  Search: () => <span data-testid="icon-search" />,
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
  Pencil: () => <span data-testid="icon-pencil" />,
  Radar: () => <span data-testid="icon-radar" />,
  SquareTerminal: () => <span data-testid="icon-squareterminal" />,
  Wrench: () => <span data-testid="icon-wrench" />,

}));

vi.mock("../../lib/tauri", () => ({}));

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "prompt-1",
    name: "test-prompt",
    content: "Review {{file}} for {{issue_type}} issues",
    description: null,
    category: null,
    tags: [],
    sortOrder: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("VariableSubstitutionDialog", () => {
  it("renders variable inputs for each placeholder", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    expect(screen.getByText("{{file}}")).toBeInTheDocument();
    expect(screen.getByText("{{issue_type}}")).toBeInTheDocument();
  });

  it("auto-fills file variable from context", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={vi.fn()}
        onInsert={vi.fn()}
        currentFilePath="src/main.ts"
      />,
    );
    const fileInput = screen.getByPlaceholderText("Enter value for file");
    expect(fileInput).toHaveValue("src/main.ts");
  });

  it("shows prompt template preview", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Review {{file}} for {{issue_type}} issues"),
    ).toBeInTheDocument();
  });

  it("calls onInsert with resolved content", () => {
    const onInsert = vi.fn();
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={vi.fn()}
        onInsert={onInsert}
        currentFilePath="src/main.ts"
      />,
    );
    const issueInput = screen.getByPlaceholderText(
      "Enter value for issue_type",
    );
    fireEvent.change(issueInput, { target: { value: "security" } });
    fireEvent.click(screen.getByText("Insert Prompt"));
    expect(onInsert).toHaveBeenCalledWith(
      "Review src/main.ts for security issues",
    );
  });

  it("disables insert button when variables are empty", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    const insertBtn = screen.getByText("Insert Prompt").closest("button")!;
    expect(insertBtn).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={onClose}
        onInsert={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows prompt name in header", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt({ name: "my-prompt" })}
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    expect(screen.getByText("my-prompt")).toBeInTheDocument();
  });

  it("auto-fills branch variable from context", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt({ content: "Deploy {{branch}} to staging" })}
        onClose={vi.fn()}
        onInsert={vi.fn()}
        currentBranch="feature/login"
      />,
    );
    const branchInput = screen.getByPlaceholderText("Enter value for branch");
    expect(branchInput).toHaveValue("feature/login");
  });

  it("auto-fills workspace variable from context", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt({ content: "Review {{workspace}} status" })}
        onClose={vi.fn()}
        onInsert={vi.fn()}
        currentWorkspace="my-project"
      />,
    );
    const wsInput = screen.getByPlaceholderText("Enter value for workspace");
    expect(wsInput).toHaveValue("my-project");
  });

  it("auto-fills selection variable from context", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt({ content: "Explain {{selection}}" })}
        onClose={vi.fn()}
        onInsert={vi.fn()}
        currentSelection="const x = 42"
      />,
    );
    const selInput = screen.getByPlaceholderText("Enter value for selection");
    expect(selInput).toHaveValue("const x = 42");
  });

  it("shows auto-filled label for auto-fill variables with defaults", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt({ content: "Check {{file}} on {{branch}}" })}
        onClose={vi.fn()}
        onInsert={vi.fn()}
        currentFilePath="src/index.ts"
        currentBranch="main"
      />,
    );
    const autoFilledLabels = screen.getAllByText("(auto-filled)");
    expect(autoFilledLabels).toHaveLength(2);
  });

  it("does not show auto-filled label for non-auto-fill variables", () => {
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt({ content: "Fix {{custom_var}}" })}
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    expect(screen.queryByText("(auto-filled)")).not.toBeInTheDocument();
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={onClose}
        onInsert={vi.fn()}
      />,
    );
    // Click the overlay backdrop (the outermost div)
    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking X button", () => {
    const onClose = vi.fn();
    render(
      <VariableSubstitutionDialog
        prompt={makePrompt()}
        onClose={onClose}
        onInsert={vi.fn()}
      />,
    );
    // Click the X icon button
    fireEvent.click(screen.getByTestId("x-icon").closest("button")!);
    expect(onClose).toHaveBeenCalled();
  });
});
