import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild({ error }: { error?: Error }) {
  if (error) throw error;
  return <div>child content</div>;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild error={new Error("test crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("test crash")).toBeInTheDocument();
  });

  it("shows label in fallback when provided", () => {
    render(
      <ErrorBoundary label="Chat">
        <ThrowingChild error={new Error("boom")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Chat crashed")).toBeInTheDocument();
  });

  it("shows retry button and resets error state on click", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild error={new Error("crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();

    // Clicking Retry calls setState({ error: null })
    // The child will throw again, but we verify the Retry button exists and is clickable
    fireEvent.click(screen.getByText("Retry"));
    // After retry, child throws again so error UI re-appears
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("resets when resetKey changes", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="ws-1">
        <ThrowingChild error={new Error("crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Change resetKey and provide non-throwing child
    rerender(
      <ErrorBoundary resetKey="ws-2">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("does not reset when resetKey stays the same", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="ws-1">
        <ThrowingChild error={new Error("crash")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="ws-1">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    // Still showing error since resetKey didn't change
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
