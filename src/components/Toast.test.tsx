import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastContainer } from "./Toast";
import { useToastStore } from "../stores/toastStore";

vi.mock("lucide-react", () => ({
  CheckCircle: (props: any) => <span data-testid="check-circle-icon" {...props} />,
  XCircle: (props: any) => <span data-testid="x-circle-icon" {...props} />,
  Info: (props: any) => <span data-testid="info-icon" {...props} />,
  X: (props: any) => <span data-testid="x-icon" {...props} />,
  MessageCircleQuestion: (props: any) => <span data-testid="icon-question" {...props} />,
  ClipboardCheck: (props: any) => <span data-testid="icon-clipboardcheck" {...props} />,
  Search: (props: any) => <span data-testid="icon-search" {...props} />,
}));

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  vi.clearAllMocks();
});

describe("ToastContainer", () => {
  it("returns null when there are no toasts", () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a success toast with CheckCircle icon", () => {
    useToastStore.setState({
      toasts: [{ id: "1", message: "Saved successfully", type: "success" }],
    });
    render(<ToastContainer />);
    expect(screen.getByText("Saved successfully")).toBeInTheDocument();
    expect(screen.getByTestId("check-circle-icon")).toBeInTheDocument();
  });

  it("renders an error toast with XCircle icon", () => {
    useToastStore.setState({
      toasts: [{ id: "2", message: "Something failed", type: "error" }],
    });
    render(<ToastContainer />);
    expect(screen.getByText("Something failed")).toBeInTheDocument();
    expect(screen.getByTestId("x-circle-icon")).toBeInTheDocument();
  });

  it("renders an info toast with Info icon", () => {
    useToastStore.setState({
      toasts: [{ id: "3", message: "FYI update", type: "info" }],
    });
    render(<ToastContainer />);
    expect(screen.getByText("FYI update")).toBeInTheDocument();
    expect(screen.getByTestId("info-icon")).toBeInTheDocument();
  });

  it("renders multiple toasts", () => {
    useToastStore.setState({
      toasts: [
        { id: "1", message: "First toast", type: "success" },
        { id: "2", message: "Second toast", type: "error" },
        { id: "3", message: "Third toast", type: "info" },
      ],
    });
    render(<ToastContainer />);
    expect(screen.getByText("First toast")).toBeInTheDocument();
    expect(screen.getByText("Second toast")).toBeInTheDocument();
    expect(screen.getByText("Third toast")).toBeInTheDocument();
  });

  it("calls removeToast when the dismiss (X) button is clicked", () => {
    const removeToast = vi.fn();
    useToastStore.setState({
      toasts: [{ id: "42", message: "Dismissable", type: "info" }],
      removeToast,
    });
    render(<ToastContainer />);
    const dismissButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(dismissButton);
    expect(removeToast).toHaveBeenCalledWith("42");
  });

  it("renders an action button when toast has an action", () => {
    useToastStore.setState({
      toasts: [
        {
          id: "5",
          message: "Undo available",
          type: "success",
          action: { label: "Undo", onClick: vi.fn() },
        },
      ],
    });
    render(<ToastContainer />);
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("does not render an action button when toast has no action", () => {
    useToastStore.setState({
      toasts: [{ id: "6", message: "No action toast", type: "info" }],
    });
    render(<ToastContainer />);
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  it("calls action onClick and removeToast when the action button is clicked", () => {
    const onClickSpy = vi.fn();
    const removeToast = vi.fn();
    useToastStore.setState({
      toasts: [
        {
          id: "7",
          message: "Action toast",
          type: "success",
          action: { label: "Retry", onClick: onClickSpy },
        },
      ],
      removeToast,
    });
    render(<ToastContainer />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onClickSpy).toHaveBeenCalledOnce();
    expect(removeToast).toHaveBeenCalledWith("7");
  });

  it("applies correct icon color for each toast type", () => {
    useToastStore.setState({
      toasts: [
        { id: "s", message: "Success", type: "success" },
        { id: "e", message: "Error", type: "error" },
        { id: "i", message: "Info", type: "info" },
      ],
    });
    render(<ToastContainer />);
    const successIcon = screen.getByTestId("check-circle-icon");
    const errorIcon = screen.getByTestId("x-circle-icon");
    const infoIcon = screen.getByTestId("info-icon");
    expect(successIcon).toHaveStyle({ color: "var(--success)" });
    expect(errorIcon).toHaveStyle({ color: "var(--error)" });
    expect(infoIcon).toHaveStyle({ color: "var(--accent)" });
  });
});
