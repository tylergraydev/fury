import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThinkingSpinner } from "./ThinkingSpinner";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ThinkingSpinner", () => {
  it("renders spinner dots", () => {
    render(<ThinkingSpinner />);
    expect(screen.getByTestId("thinking-spinner")).toBeInTheDocument();
    const dots = screen.getByTestId("thinking-spinner").querySelectorAll(".spinner-dot");
    expect(dots.length).toBe(9);
  });

  it("shows elapsed time in seconds", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    render(<ThinkingSpinner startedAt={now - 5000} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("5.1s")).toBeInTheDocument();
  });

  it("formats elapsed time with minutes when >= 60s", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    render(<ThinkingSpinner startedAt={now - 125000} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("2m 5s")).toBeInTheDocument();
  });

  it("cleans up interval on unmount", () => {
    const { unmount } = render(<ThinkingSpinner />);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("uses fallback when no startedAt provided", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    render(<ThinkingSpinner />);

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.getByText("3.1s")).toBeInTheDocument();
  });
});
