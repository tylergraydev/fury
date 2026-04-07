import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuestionCard } from "./QuestionCard";

vi.mock("lucide-react", () => ({
  MessageCircleQuestion: () => <span data-testid="icon-question" />,
  ArrowUp: () => <span data-testid="icon-arrow-up" />,
  X: () => <span data-testid="icon-x" />,
}));

describe("QuestionCard", () => {
  const mockOnAnswer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders question text and header", () => {
    render(
      <QuestionCard question="Which approach?" onAnswer={mockOnAnswer} />,
    );
    expect(screen.getByText("Question from agent")).toBeInTheDocument();
    expect(screen.getByText("Which approach?")).toBeInTheDocument();
  });

  it("renders option pills when options are provided", () => {
    render(
      <QuestionCard
        question="Pick one"
        options={["Option A", "Option B"]}
        onAnswer={mockOnAnswer}
      />,
    );
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("does not render option pills when options is empty", () => {
    render(
      <QuestionCard question="Pick one" options={[]} onAnswer={mockOnAnswer} />,
    );
    // No pills rendered, only the textarea and submit button
    expect(screen.queryByRole("button", { name: "Option A" })).not.toBeInTheDocument();
  });

  it("does not render option pills when options is undefined", () => {
    render(<QuestionCard question="Free text" onAnswer={mockOnAnswer} />);
    expect(
      screen.getByPlaceholderText("Type a custom answer..."),
    ).toBeInTheDocument();
  });

  it("clicking an option pill calls onAnswer with the option text", () => {
    render(
      <QuestionCard
        question="Pick"
        options={["Yes", "No"]}
        onAnswer={mockOnAnswer}
      />,
    );
    fireEvent.click(screen.getByText("Yes"));
    expect(mockOnAnswer).toHaveBeenCalledWith("Yes");
  });

  it("submits custom text via send button", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    fireEvent.change(textarea, { target: { value: "custom answer" } });

    // Click the send button (parent of ArrowUp icon)
    const buttons = screen.getAllByRole("button");
    const sendBtn = buttons[buttons.length - 1]; // Last button is submit
    fireEvent.click(sendBtn);

    expect(mockOnAnswer).toHaveBeenCalledWith("custom answer");
  });

  it("clears textarea after submitting", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText(
      "Type a custom answer...",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "answer" } });
    expect(textarea.value).toBe("answer");

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);

    expect(textarea.value).toBe("");
  });

  it("does not submit when text is empty or whitespace", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    fireEvent.change(textarea, { target: { value: "   " } });

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);

    expect(mockOnAnswer).not.toHaveBeenCalled();
  });

  it("submits on Enter key press", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    fireEvent.change(textarea, { target: { value: "enter answer" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(mockOnAnswer).toHaveBeenCalledWith("enter answer");
  });

  it("does not submit on Shift+Enter (allows newline)", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    fireEvent.change(textarea, { target: { value: "multiline" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(mockOnAnswer).not.toHaveBeenCalled();
  });

  it("send button is disabled when textarea is empty", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const buttons = screen.getAllByRole("button");
    const sendBtn = buttons[buttons.length - 1];
    expect(sendBtn).toBeDisabled();
  });

  it("send button is enabled when textarea has text", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    fireEvent.change(textarea, { target: { value: "text" } });

    const buttons = screen.getAllByRole("button");
    const sendBtn = buttons[buttons.length - 1];
    expect(sendBtn).not.toBeDisabled();
  });

  it("auto-focuses textarea on mount", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    expect(document.activeElement).toBe(textarea);
  });

  it("renders number badges next to each option", () => {
    render(
      <QuestionCard
        question="Pick"
        options={["First", "Second", "Third"]}
        onAnswer={mockOnAnswer}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("number key picks the matching option when input is empty", () => {
    render(
      <QuestionCard
        question="Pick"
        options={["First", "Second", "Third"]}
        onAnswer={mockOnAnswer}
      />,
    );
    const textarea = screen.getByPlaceholderText(/Type a custom answer/);
    fireEvent.keyDown(textarea, { key: "2" });
    expect(mockOnAnswer).toHaveBeenCalledWith("Second");
  });

  it("number key does not pick option when input has text", () => {
    render(
      <QuestionCard
        question="Pick"
        options={["First", "Second"]}
        onAnswer={mockOnAnswer}
      />,
    );
    const textarea = screen.getByPlaceholderText(/Type a custom answer/);
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "1" });
    expect(mockOnAnswer).not.toHaveBeenCalled();
  });

  it("number key out of range does nothing", () => {
    render(
      <QuestionCard
        question="Pick"
        options={["First", "Second"]}
        onAnswer={mockOnAnswer}
      />,
    );
    const textarea = screen.getByPlaceholderText(/Type a custom answer/);
    fireEvent.keyDown(textarea, { key: "5" });
    expect(mockOnAnswer).not.toHaveBeenCalled();
  });

  it("placeholder hints at number shortcut when options exist", () => {
    render(
      <QuestionCard
        question="Pick"
        options={["A", "B", "C"]}
        onAnswer={mockOnAnswer}
      />,
    );
    expect(
      screen.getByPlaceholderText("Type a custom answer (or press 1-3)..."),
    ).toBeInTheDocument();
  });

  it("renders cancel button when onCancel is provided", () => {
    const onCancel = vi.fn();
    render(
      <QuestionCard question="Q" onAnswer={mockOnAnswer} onCancel={onCancel} />,
    );
    expect(
      screen.getByRole("button", { name: "Cancel question" }),
    ).toBeInTheDocument();
  });

  it("does not render cancel button when onCancel is not provided", () => {
    render(<QuestionCard question="Q" onAnswer={mockOnAnswer} />);
    expect(
      screen.queryByRole("button", { name: "Cancel question" }),
    ).not.toBeInTheDocument();
  });

  it("clicking cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <QuestionCard question="Q" onAnswer={mockOnAnswer} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel question" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("Escape key calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <QuestionCard question="Q" onAnswer={mockOnAnswer} onCancel={onCancel} />,
    );
    const textarea = screen.getByPlaceholderText("Type a custom answer...");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
