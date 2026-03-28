import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ResearchingIndicator } from "./ResearchingIndicator";

vi.mock("lucide-react", () => ({
  Search: () => <span data-testid="icon-search" />,
}));

describe("ResearchingIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders base text and tool count", () => {
    render(<ResearchingIndicator toolCallCount={3} />);
    expect(screen.getByText(/Researching codebase/)).toBeInTheDocument();
    expect(screen.getByText("3 operations")).toBeInTheDocument();
  });

  it("uses singular 'operation' when count is 1", () => {
    render(<ResearchingIndicator toolCallCount={1} />);
    expect(screen.getByText("1 operation")).toBeInTheDocument();
  });

  it("uses plural 'operations' when count is not 1", () => {
    render(<ResearchingIndicator toolCallCount={0} />);
    expect(screen.getByText("0 operations")).toBeInTheDocument();

    const { unmount } = render(<ResearchingIndicator toolCallCount={5} />);
    expect(screen.getByText("5 operations")).toBeInTheDocument();
    unmount();
  });

  it("does not show elapsed time when startedAt is not provided", () => {
    render(<ResearchingIndicator toolCallCount={1} />);
    expect(screen.queryByText(/\ds\)/)).not.toBeInTheDocument();
  });

  it("shows elapsed time in seconds format", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    render(<ResearchingIndicator toolCallCount={1} startedAt={now} />);

    // Initial tick sets elapsed to 0, which doesn't render (elapsed > 0 check)
    expect(screen.queryByText(/\(\d+s\)/)).not.toBeInTheDocument();

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("(5s)")).toBeInTheDocument();
  });

  it("shows elapsed time in minutes:seconds format", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    render(
      <ResearchingIndicator toolCallCount={2} startedAt={now - 90_000} />,
    );

    // Initial tick: elapsed = 90s → "1m 30s"
    expect(screen.getByText("(1m 30s)")).toBeInTheDocument();
  });

  it("updates elapsed time every second", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    render(
      <ResearchingIndicator toolCallCount={1} startedAt={now - 3000} />,
    );
    expect(screen.getByText("(3s)")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("(5s)")).toBeInTheDocument();
  });

  it("cleans up interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const now = Date.now();
    vi.setSystemTime(now);

    const { unmount } = render(
      <ResearchingIndicator toolCallCount={1} startedAt={now} />,
    );

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("renders search icon", () => {
    render(<ResearchingIndicator toolCallCount={1} />);
    expect(screen.getByTestId("icon-search")).toBeInTheDocument();
  });
});
