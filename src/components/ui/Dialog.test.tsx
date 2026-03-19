import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog, DialogHeader, DialogFooter, DialogButton } from "./Dialog";

describe("Dialog", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <Dialog open={false} onClose={vi.fn()} aria-label="Test">
        <p>content</p>
      </Dialog>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders children when open", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test">
        <p>hello</p>
      </Dialog>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("has correct ARIA attributes", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Clone repo">
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Clone repo");
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Test">
        <p>body</p>
      </Dialog>,
    );
    // Click the backdrop (parent of the dialog panel)
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when panel itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Test">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Test">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies custom width class", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test" width="w-96">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toContain("w-96");
  });

  it("uses padded variant by default", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test">
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("rounded-xl");
    expect(dialog.className).toContain("p-6");
  });

  it("uses flush variant for full-bleed section layouts", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test" variant="flush">
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("flex-col");
    expect(dialog.className).toContain("rounded-lg");
    expect(dialog.className).not.toContain("p-6");
  });

  it("ignores non-Tab non-Escape keys", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Test">
        <button>A</button>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing on Tab when there are no focusable elements", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Test">
        <p>no focusable elements here</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Tab" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps focus from last to first on Tab", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test">
        <button>First</button>
        <button>Last</button>
      </Dialog>,
    );
    const lastBtn = screen.getByText("Last");
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("First"));
  });

  it("wraps focus from first to last on Shift+Tab", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test">
        <button>First</button>
        <button>Last</button>
      </Dialog>,
    );
    const firstBtn = screen.getByText("First");
    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("Last"));
  });

  it("does not wrap focus on Tab when not on the last element", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test">
        <button>First</button>
        <button>Last</button>
      </Dialog>,
    );
    const firstBtn = screen.getByText("First");
    firstBtn.focus();

    const preventDefaultSpy = vi.fn();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy });
    document.dispatchEvent(event);
    // preventDefault should NOT be called since focus is on first, not last
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("does not wrap focus on Shift+Tab when not on the first element", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Test">
        <button>First</button>
        <button>Last</button>
      </Dialog>,
    );
    const lastBtn = screen.getByText("Last");
    lastBtn.focus();

    const preventDefaultSpy = vi.fn();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy });
    document.dispatchEvent(event);
    // preventDefault should NOT be called since focus is on last, not first
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("cleans up keydown listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Dialog open={true} onClose={onClose} aria-label="Test">
        <p>body</p>
      </Dialog>,
    );
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DialogHeader", () => {
  it("renders title and subtitle", () => {
    render(
      <DialogHeader
        icon={<span>icon</span>}
        title="Clone Repository"
        subtitle="From URL"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Clone Repository")).toBeInTheDocument();
    expect(screen.getByText("From URL")).toBeInTheDocument();
  });

  it("calls onClose when X is clicked", () => {
    const onClose = vi.fn();
    render(
      <DialogHeader
        icon={<span>icon</span>}
        title="Title"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits subtitle when not provided", () => {
    render(
      <DialogHeader
        icon={<span>icon</span>}
        title="Title"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("From URL")).not.toBeInTheDocument();
  });
});

describe("DialogFooter", () => {
  it("renders children", () => {
    render(
      <DialogFooter>
        <button>Cancel</button>
        <button>OK</button>
      </DialogFooter>,
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
  });
});

describe("DialogButton", () => {
  it("renders ghost variant by default", () => {
    render(<DialogButton onClick={vi.fn()}>Cancel</DialogButton>);
    const btn = screen.getByText("Cancel");
    expect(btn.style.color).toBe("var(--text-secondary)");
  });

  it("renders primary variant with accent", () => {
    render(
      <DialogButton variant="primary" onClick={vi.fn()}>
        Save
      </DialogButton>,
    );
    const btn = screen.getByText("Save");
    expect(btn.style.backgroundColor).toBe("var(--accent)");
  });

  it("renders primary variant with custom color", () => {
    render(
      <DialogButton variant="primary" color="#a78bfa" onClick={vi.fn()}>
        Clone
      </DialogButton>,
    );
    const btn = screen.getByText("Clone");
    expect(btn.style.backgroundColor).toBe("rgb(167, 139, 250)");
  });

  it("applies disabled styling", () => {
    render(
      <DialogButton variant="primary" disabled onClick={vi.fn()}>
        Go
      </DialogButton>,
    );
    const btn = screen.getByText("Go");
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("opacity-50");
  });
});
