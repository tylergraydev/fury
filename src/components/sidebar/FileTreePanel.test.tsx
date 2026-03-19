import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileTreePanel } from "./FileTreePanel";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { listWorkspaceFiles, listRepoFiles } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listWorkspaceFiles: vi.fn().mockResolvedValue([]),
  listRepoFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../icons/FileIcons", () => ({
  getFileIcon: () => () => <span data-testid="file-icon" />,
  FolderIcon: () => <span data-testid="folder-icon" />,
  FolderOpenIcon: () => <span data-testid="folder-open-icon" />,
}));

beforeEach(() => {
  useFileTreeStore.setState({
    files: {},
    expandedDirs: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

describe("FileTreePanel", () => {
  it("shows loading state when loading and no files", () => {
    useFileTreeStore.setState({
      loading: { "ws-1": true },
      files: {},
    });
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    expect(screen.getByText("Loading files...")).toBeInTheDocument();
  });

  it("shows error state", async () => {
    vi.mocked(listWorkspaceFiles).mockRejectedValueOnce(new Error("Failed to load"));
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    expect(await screen.findByText(/Failed to load/)).toBeInTheDocument();
  });

  it("renders file names from flat paths", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["main.ts", "app.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    expect(await screen.findByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  it("renders directory structure from nested paths", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts", "src/app.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    expect(await screen.findByText("src")).toBeInTheDocument();
  });

  it("calls onFileClick when a file is clicked", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    const onFileClick = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileClick={onFileClick}
      />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.click(file);
    expect(onFileClick).toHaveBeenCalledWith("readme.md");
  });

  it("toggles directory expansion on click", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    expect(screen.queryByText("main.ts")).not.toBeInTheDocument();
    fireEvent.click(srcDir);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
  });

  it("calls loadRepoFiles for repo context on mount", async () => {
    render(
      <FileTreePanel context={{ id: "repo-1", type: "repo" }} />,
    );
    await vi.waitFor(() => {
      expect(listRepoFiles).toHaveBeenCalledWith("repo-1");
    });
  });

  it("calls onFileDoubleClick when a file is double-clicked", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    const onFileDoubleClick = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileDoubleClick={onFileDoubleClick}
      />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.doubleClick(file);
    expect(onFileDoubleClick).toHaveBeenCalledWith("readme.md");
  });

  it("does not call onFileDoubleClick for directories", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    const onFileDoubleClick = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileDoubleClick={onFileDoubleClick}
      />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.doubleClick(srcDir);
    expect(onFileDoubleClick).not.toHaveBeenCalled();
  });

  it("sorts directories before files", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue([
      "file.ts",
      "src/app.ts",
      "lib/utils.ts",
    ]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("file.ts");
    // Directories (lib, src) should appear before file.ts
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map(b => b.textContent);
    const libIdx = labels.findIndex(l => l?.includes("lib"));
    const srcIdx = labels.findIndex(l => l?.includes("src"));
    const fileIdx = labels.findIndex(l => l?.includes("file.ts"));
    expect(libIdx).toBeLessThan(fileIdx);
    expect(srcIdx).toBeLessThan(fileIdx);
  });

  it("does not show loading when files exist even if loading is true", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("main.ts");
    // Even if loading is set true now, since files exist, should not show Loading message
    useFileTreeStore.setState({ loading: { "ws-1": true } });
    expect(screen.queryByText("Loading files...")).not.toBeInTheDocument();
  });

  it("shows folder-open icon when directory is expanded", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    // Collapsed: folder icon
    expect(screen.getByTestId("folder-icon")).toBeInTheDocument();
    // Expand
    fireEvent.click(srcDir);
    expect(screen.getByTestId("folder-open-icon")).toBeInTheDocument();
  });

  it("sorts files alphabetically when both are the same type", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue([
      "zebra.ts",
      "apple.ts",
      "mango.ts",
    ]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("zebra.ts");
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map(b => b.textContent);
    const appleIdx = labels.findIndex(l => l?.includes("apple.ts"));
    const mangoIdx = labels.findIndex(l => l?.includes("mango.ts"));
    const zebraIdx = labels.findIndex(l => l?.includes("zebra.ts"));
    expect(appleIdx).toBeLessThan(mangoIdx);
    expect(mangoIdx).toBeLessThan(zebraIdx);
  });

  it("clicking a file without onFileClick does not throw", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    // Should not throw when no callback
    expect(() => fireEvent.click(file)).not.toThrow();
  });

  it("opens context menu on right-click when onRunTestFile is provided", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
  });

  it("does not open context menu on right-click when onRunTestFile is not provided", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("does not open context menu when right-clicking a directory", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.contextMenu(srcDir);
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("calls onRunTestFile and closes context menu when Run Tests is clicked", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    const runButton = screen.getByText("Run Tests");
    fireEvent.click(runButton);
    expect(onRunTestFile).toHaveBeenCalledWith("test.spec.ts");
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("closes context menu when clicking outside", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    // Click outside the context menu
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("closes context menu when Escape key is pressed", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("does not close context menu when clicking inside it", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    const runButton = screen.getByText("Run Tests");
    // mouseDown inside the menu should not close it
    fireEvent.mouseDown(runButton);
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
  });

  it("skips loading when files are already cached", async () => {
    // Pre-populate the store with files for the context
    const loadFilesSpy = vi.spyOn(useFileTreeStore.getState(), "loadFiles");
    const loadRepoFilesSpy = vi.spyOn(useFileTreeStore.getState(), "loadRepoFiles");
    useFileTreeStore.setState({
      files: { "ws-2": ["cached.ts"] },
    });
    render(
      <FileTreePanel context={{ id: "ws-2", type: "workspace" }} />,
    );
    expect(screen.getByText("cached.ts")).toBeInTheDocument();
    // Wait for double-rAF to complete by creating our own double-rAF
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    // Neither loadFiles nor loadRepoFiles should be called because files are cached
    expect(loadFilesSpy).not.toHaveBeenCalled();
    expect(loadRepoFilesSpy).not.toHaveBeenCalled();
    loadFilesSpy.mockRestore();
    loadRepoFilesSpy.mockRestore();
  });

  it("double-clicking a file without onFileDoubleClick does not throw", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    expect(() => fireEvent.doubleClick(file)).not.toThrow();
  });

  it("does not close context menu on non-Escape key press", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
  });

  it("cleans up event listeners when context menu unmounts", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const onRunTestFile = vi.fn();
    const removeMouseSpy = vi.spyOn(document, "removeEventListener");
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={onRunTestFile}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    // Close the menu to trigger cleanup
    fireEvent.keyDown(document, { key: "Escape" });
    expect(removeMouseSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    expect(removeMouseSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeMouseSpy.mockRestore();
  });

  it("cancels animation frames on unmount", async () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    vi.mocked(listWorkspaceFiles).mockResolvedValue([]);
    const { unmount } = render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
