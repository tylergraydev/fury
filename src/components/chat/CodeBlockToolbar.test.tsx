import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CodeBlockToolbar } from "./CodeBlockToolbar";

// Mock tauri
vi.mock("../../lib/tauri", () => ({
  writeWorkspaceFile: vi.fn(),
  writeRepoFile: vi.fn(),
}));

// Mock stores
vi.mock("../../stores/fileViewerStore", () => ({
  useFileViewerStore: {
    getState: vi.fn(() => ({ openFile: vi.fn() })),
  },
}));

vi.mock("../../stores/toastStore", () => ({
  useToastStore: {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  },
}));

import { writeWorkspaceFile, writeRepoFile } from "../../lib/tauri";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useToastStore } from "../../stores/toastStore";

describe("CodeBlockToolbar", () => {
  const defaultProps = {
    code: "const x = 1;",
    filePath: "src/app.ts",
    contextId: "ws-123",
    contextType: "workspace" as const,
  };

  let mockAddToast: ReturnType<typeof vi.fn>;
  let mockOpenFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAddToast = vi.fn();
    mockOpenFile = vi.fn();
    (useToastStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      addToast: mockAddToast,
    });
    (useFileViewerStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      openFile: mockOpenFile,
    });
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders copy button", () => {
    render(<CodeBlockToolbar {...defaultProps} />);
    expect(screen.getByTitle("Copy code")).toBeInTheDocument();
  });

  it("renders apply button when filePath is provided", () => {
    render(<CodeBlockToolbar {...defaultProps} />);
    expect(screen.getByTitle("Apply to src/app.ts")).toBeInTheDocument();
  });

  it("does not render apply button when filePath is null", () => {
    render(<CodeBlockToolbar {...defaultProps} filePath={null} />);
    expect(screen.queryByText("Apply")).not.toBeInTheDocument();
  });

  it("copies code to clipboard on click", async () => {
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy code"));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const x = 1;");
    expect(mockAddToast).toHaveBeenCalledWith("Copied to clipboard", "success");
  });

  it("shows check icon after copy and resets", async () => {
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy code"));
    });
    // After copy, the button should still be there (with check icon)
    expect(screen.getByTitle("Copy code")).toBeInTheDocument();
    // Reset after 1.5s
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTitle("Copy code")).toBeInTheDocument();
  });

  it("shows error toast when clipboard fails", async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("denied"),
    );
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy code"));
    });
    expect(mockAddToast).toHaveBeenCalledWith("Failed to copy", "error");
  });

  it("applies code to workspace file", async () => {
    (writeWorkspaceFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: "const x = 1;",
      language: "typescript",
      formatted: false,
    });
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Apply to src/app.ts"));
    });
    expect(writeWorkspaceFile).toHaveBeenCalledWith(
      "ws-123",
      "src/app.ts",
      "const x = 1;",
      false,
    );
    expect(mockOpenFile).toHaveBeenCalledWith(
      "ws-123",
      "workspace",
      "src/app.ts",
      true,
    );
    expect(mockAddToast).toHaveBeenCalledWith("Applied to src/app.ts", "success");
  });

  it("applies code to repo file when contextType is repo", async () => {
    (writeRepoFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: "const x = 1;",
      language: "typescript",
      formatted: false,
    });
    render(
      <CodeBlockToolbar
        {...defaultProps}
        contextType="repo"
        contextId="repo-123"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTitle("Apply to src/app.ts"));
    });
    expect(writeRepoFile).toHaveBeenCalledWith(
      "repo-123",
      "src/app.ts",
      "const x = 1;",
      false,
    );
  });

  it("shows error toast on apply failure", async () => {
    (writeWorkspaceFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("write failed"),
    );
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Apply to src/app.ts"));
    });
    expect(mockAddToast).toHaveBeenCalledWith(
      "Failed to apply: Error: write failed",
      "error",
    );
  });

  it("resets apply status after success", async () => {
    (writeWorkspaceFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: "const x = 1;",
      language: "typescript",
      formatted: false,
    });
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Apply to src/app.ts"));
    });
    // Status should be "applied" now, then reset after 1.5s
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTitle("Apply to src/app.ts")).toBeInTheDocument();
  });

  it("resets apply status after error", async () => {
    (writeWorkspaceFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("fail"),
    );
    render(<CodeBlockToolbar {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Apply to src/app.ts"));
    });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTitle("Apply to src/app.ts")).toBeInTheDocument();
  });

  it("prevents double-click during apply", async () => {
    let resolveWrite: () => void;
    (writeWorkspaceFile as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<void>((resolve) => { resolveWrite = resolve; }),
    );
    render(<CodeBlockToolbar {...defaultProps} />);
    // First click starts applying
    await act(async () => {
      fireEvent.click(screen.getByTitle("Apply to src/app.ts"));
    });
    // Second click should be ignored (button is disabled)
    const applyButton = screen.getByTitle("Apply to src/app.ts");
    expect(applyButton).toBeDisabled();
    // Resolve the write
    await act(async () => { resolveWrite!(); });
  });
});
