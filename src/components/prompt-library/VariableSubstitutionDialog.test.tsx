import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariableSubstitutionDialog } from "./VariableSubstitutionDialog";
import type { Prompt } from "../../lib/tauri";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  Zap: () => <span data-testid="zap-icon" />,
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
});
