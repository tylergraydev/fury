import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TerminalPanel } from "./TerminalPanel";

vi.mock("./TerminalView", () => ({
  TerminalView: ({ terminalId }: any) => (
    <div data-testid="terminal-view">{terminalId}</div>
  ),
}));

vi.mock("../../lib/tauri", () => ({
  createTerminal: vi.fn().mockResolvedValue("term-123"),
  createRepoTerminal: vi.fn().mockResolvedValue("term-456"),
  closeTerminal: vi.fn().mockResolvedValue(undefined),
}));

import { createTerminal, createRepoTerminal, closeTerminal } from "../../lib/tauri";

describe("TerminalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Starting terminal...' initially", () => {
    render(<TerminalPanel context={{ type: "workspace", id: "ws-1" }} />);
    expect(screen.getByText("Starting terminal...")).toBeInTheDocument();
  });

  it("renders TerminalView after terminal is created (workspace context)", async () => {
    render(<TerminalPanel context={{ type: "workspace", id: "ws-1" }} />);
    await waitFor(() => {
      expect(screen.getByTestId("terminal-view")).toBeInTheDocument();
    });
    expect(screen.getByText("term-123")).toBeInTheDocument();
  });

  it("calls createTerminal for workspace context", async () => {
    render(<TerminalPanel context={{ type: "workspace", id: "ws-1" }} />);
    await waitFor(() => {
      expect(createTerminal).toHaveBeenCalledWith("ws-1", 80, 24);
    });
  });

  it("calls createRepoTerminal for repo context", async () => {
    render(<TerminalPanel context={{ type: "repo", id: "repo-1" }} />);
    await waitFor(() => {
      expect(createRepoTerminal).toHaveBeenCalledWith("repo-1", 80, 24);
    });
  });

  it("shows error message when terminal creation fails", async () => {
    (createTerminal as any).mockRejectedValueOnce(new Error("spawn failed"));
    render(<TerminalPanel context={{ type: "workspace", id: "ws-1" }} />);
    await waitFor(() => {
      expect(screen.getByText(/spawn failed/)).toBeInTheDocument();
    });
  });

  it("calls closeTerminal on unmount", async () => {
    const { unmount } = render(
      <TerminalPanel context={{ type: "workspace", id: "ws-1" }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId("terminal-view")).toBeInTheDocument();
    });
    unmount();
    expect(closeTerminal).toHaveBeenCalledWith("term-123");
  });

  it("closes previous terminal when context changes", async () => {
    const { rerender } = render(
      <TerminalPanel context={{ type: "workspace", id: "ws-1" }} />
    );
    // Wait for first terminal to be created and rendered
    await waitFor(() => {
      expect(screen.getByTestId("terminal-view")).toBeInTheDocument();
    });
    expect(screen.getByText("term-123")).toBeInTheDocument();

    // Clear mocks to track new calls
    vi.mocked(closeTerminal).mockClear();
    (createTerminal as any).mockResolvedValueOnce("term-789");

    // Change context - this should trigger the cleanup code that closes the previous terminal
    rerender(
      <TerminalPanel context={{ type: "workspace", id: "ws-2" }} />
    );

    // The previous terminal (term-123) should be closed via the effect's prevIdRef check
    await waitFor(() => {
      expect(closeTerminal).toHaveBeenCalledWith("term-123");
    });
    // And new terminal should be created
    await waitFor(() => {
      expect(screen.getByText("term-789")).toBeInTheDocument();
    });
  });

  it("closes terminal if component unmounts before creation resolves", async () => {
    // Use a deferred promise to control when createTerminal resolves
    let resolveCreate!: (value: string) => void;
    (createTerminal as any).mockImplementationOnce(() =>
      new Promise<string>((res) => { resolveCreate = res; })
    );
    const { unmount } = render(
      <TerminalPanel context={{ type: "workspace", id: "ws-1" }} />
    );
    // Unmount before the terminal is created
    unmount();
    // Now resolve the creation
    resolveCreate("term-orphan");
    // The orphaned terminal should be closed
    await waitFor(() => {
      expect(closeTerminal).toHaveBeenCalledWith("term-orphan");
    });
  });

  it("renders TerminalView for repo context", async () => {
    render(<TerminalPanel context={{ type: "repo", id: "repo-1" }} />);
    await waitFor(() => {
      expect(screen.getByTestId("terminal-view")).toBeInTheDocument();
    });
    expect(screen.getByText("term-456")).toBeInTheDocument();
  });

  it("ignores error when component unmounts before creation rejects", async () => {
    // Test the catch handler when active === false (line 40-43: error after unmount)
    let rejectCreate!: (err: Error) => void;
    (createTerminal as any).mockImplementationOnce(() =>
      new Promise<string>((_res, rej) => { rejectCreate = rej; })
    );
    const { unmount } = render(
      <TerminalPanel context={{ type: "workspace", id: "ws-1" }} />
    );
    // Unmount before the terminal creation rejects
    unmount();
    // Now reject the creation - should not cause error since active === false
    rejectCreate(new Error("late error"));
    // Wait a tick to let the promise rejection settle
    await new Promise((r) => setTimeout(r, 10));
    // No error should be set since active was false
    expect(screen.queryByText(/late error/)).not.toBeInTheDocument();
  });

  it("handles closeTerminal rejection when unmount races with resolve (else branch catch)", async () => {
    // Test the .catch(() => {}) on line 31: closeTerminal(id).catch(() => {})
    // in the else branch (component unmounted before promise resolves)
    let resolveCreate!: (value: string) => void;
    (createTerminal as any).mockImplementationOnce(() =>
      new Promise<string>((res) => { resolveCreate = res; })
    );
    vi.mocked(closeTerminal).mockRejectedValueOnce(new Error("close failed in else"));

    const { unmount } = render(
      <TerminalPanel context={{ type: "workspace", id: "ws-1" }} />
    );
    // Unmount before the terminal is created (active = false)
    unmount();
    // Now resolve the creation - enters else branch, calls closeTerminal which rejects
    resolveCreate("term-orphan");
    // The .catch(() => {}) swallows the error
    await new Promise((r) => setTimeout(r, 10));
    expect(closeTerminal).toHaveBeenCalledWith("term-orphan");
  });

  it("handles closeTerminal rejection in cleanup gracefully", async () => {
    // Make closeTerminal reject to cover the .catch(() => {}) on cleanup (line 49)
    const { unmount } = render(
      <TerminalPanel context={{ type: "workspace", id: "ws-1" }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId("terminal-view")).toBeInTheDocument();
    });
    vi.mocked(closeTerminal).mockRejectedValueOnce(new Error("close failed"));
    // This should not throw even though closeTerminal rejects
    unmount();
    // The .catch(() => {}) swallows the error
    await new Promise((r) => setTimeout(r, 10));
  });
});
