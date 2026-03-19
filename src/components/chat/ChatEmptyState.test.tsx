import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatEmptyState } from "./ChatEmptyState";

describe("ChatEmptyState", () => {
  const defaultProps = {
    workspaceName: "My Project",
    onAction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workspace name", () => {
    render(<ChatEmptyState {...defaultProps} />);
    expect(screen.getByText("My Project")).toBeInTheDocument();
  });

  it("renders the subtitle text", () => {
    render(<ChatEmptyState {...defaultProps} />);
    expect(
      screen.getByText("What would you like to work on?")
    ).toBeInTheDocument();
  });

  it("renders the hint text", () => {
    render(<ChatEmptyState {...defaultProps} />);
    expect(
      screen.getByText("or type a message below to get started")
    ).toBeInTheDocument();
  });

  it("renders all six primary action cards", () => {
    render(<ChatEmptyState {...defaultProps} />);
    expect(screen.getByText("Add Feature")).toBeInTheDocument();
    expect(screen.getByText("Fix Bug")).toBeInTheDocument();
    expect(screen.getByText("Refactor Code")).toBeInTheDocument();
    expect(screen.getByText("Create Pull Request")).toBeInTheDocument();
    expect(screen.getByText("Write Tests")).toBeInTheDocument();
    expect(screen.getByText("Document Code")).toBeInTheDocument();
  });

  it("renders primary action descriptions", () => {
    render(<ChatEmptyState {...defaultProps} />);
    expect(
      screen.getByText("Implement a new feature with AI assistance")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Debug and fix issues in your code")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Improve code structure and quality")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Generate PR with description and changes")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Generate unit and integration tests")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Add comments and documentation")
    ).toBeInTheDocument();
  });

  it("renders both secondary action pills", () => {
    render(<ChatEmptyState {...defaultProps} />);
    expect(screen.getByText("Merge from Main")).toBeInTheDocument();
    expect(screen.getByText("Run Command")).toBeInTheDocument();
  });

  it.each([
    ["Add Feature", "I want to add a new feature. "],
    ["Fix Bug", "I need help fixing a bug. "],
    ["Refactor Code", "I want to refactor "],
    ["Create Pull Request", "/commit-push-pr "],
    ["Write Tests", "Write tests for "],
    ["Document Code", "Add documentation to "],
  ])(
    "calls onAction with correct prompt when clicking primary action '%s'",
    (title, expectedPrompt) => {
      const onAction = vi.fn();
      render(<ChatEmptyState workspaceName="Test" onAction={onAction} />);
      fireEvent.click(screen.getByText(title));
      expect(onAction).toHaveBeenCalledWith(expectedPrompt);
    }
  );

  it.each([
    [
      "Merge from Main",
      "Merge the latest changes from the main branch and resolve any conflicts.",
    ],
    ["Run Command", "Run "],
  ])(
    "calls onAction with correct prompt when clicking secondary action '%s'",
    (title, expectedPrompt) => {
      const onAction = vi.fn();
      render(<ChatEmptyState workspaceName="Test" onAction={onAction} />);
      fireEvent.click(screen.getByText(title));
      expect(onAction).toHaveBeenCalledWith(expectedPrompt);
    }
  );

  describe("QuickActionCard hover behavior", () => {
    it("changes styles on mouse enter", () => {
      render(<ChatEmptyState {...defaultProps} />);
      const button = screen.getByText("Add Feature").closest("button")!;
      fireEvent.mouseEnter(button);
      expect(button.style.backgroundColor).not.toBe("var(--bg-surface)");
      expect(button.style.borderColor).not.toBe("var(--border)");
    });

    it("resets styles on mouse leave", () => {
      render(<ChatEmptyState {...defaultProps} />);
      const button = screen.getByText("Add Feature").closest("button")!;
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);
      expect(button.style.backgroundColor).toBe("var(--bg-surface)");
      expect(button.style.borderColor).toBe("var(--border)");
    });
  });

  describe("SecondaryActionPill hover behavior", () => {
    it("changes styles on mouse enter", () => {
      render(<ChatEmptyState {...defaultProps} />);
      const button = screen.getByText("Merge from Main").closest("button")!;
      fireEvent.mouseEnter(button);
      expect(button.style.backgroundColor).not.toBe("var(--bg-surface)");
      expect(button.style.borderColor).not.toBe("var(--border)");
      expect(button.style.color).toBe("var(--text-primary)");
    });

    it("resets styles on mouse leave", () => {
      render(<ChatEmptyState {...defaultProps} />);
      const button = screen.getByText("Merge from Main").closest("button")!;
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);
      expect(button.style.backgroundColor).toBe("var(--bg-surface)");
      expect(button.style.borderColor).toBe("var(--border)");
      expect(button.style.color).toBe("var(--text-secondary)");
    });
  });
});
