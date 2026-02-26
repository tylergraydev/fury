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
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0) // startRef
      .mockReturnValue(5000); // subsequent calls

    render(<ThinkingSpinner />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("5.0s")).toBeInTheDocument();
  });

  it("formats elapsed time with minutes when >= 60s", () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(125000); // 2m 5s

    render(<ThinkingSpinner />);

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
});
