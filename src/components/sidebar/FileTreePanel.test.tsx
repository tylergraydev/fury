import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileTreePanel } from "./FileTreePanel";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { useUIStore } from "../../stores/uiStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import {
  listWorkspaceFiles,
  listRepoFiles,
  createWorkspaceFile,
  createRepoFile,
  createWorkspaceDirectory,
  createRepoDirectory,
} from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listWorkspaceFiles: vi.fn().mockResolvedValue([]),
  listRepoFiles: vi.fn().mockResolvedValue([]),
  initWorkspaceGit: vi.fn().mockResolvedValue(undefined),
  createWorkspaceFile: vi.fn().mockResolvedValue(undefined),
  createRepoFile: vi.fn().mockResolvedValue(undefined),
  createWorkspaceDirectory: vi.fn().mockResolvedValue(undefined),
  createRepoDirectory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../icons/FileIcons", () => ({
  getFileIcon: () => () => <span data-testid="file-icon" />,
  FolderIcon: () => <span data-testid="folder-icon" />,
  FolderOpenIcon: () => <span data-testid="folder-open-icon" />,
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./BookmarksPanel", () => ({
  BookmarksPanel: ({ context }: { context: { id: string; type: string } }) => (
    <div data-testid="bookmarks-panel">Bookmarks for {context.id}</div>
  ),
}));

beforeEach(() => {
  useFileTreeStore.setState({
    files: {},
    expandedDirs: {},
    loading: {},
    error: {},
  });
  useRepositoryStore.setState({
    repositories: [{ id: "repo-1", name: "test-repo", path: "/home/user/test-repo", defaultBranch: "main" }],
    loading: false,
    error: null,
  });
  useWorkspaceStore.setState({
    workspaces: [{ id: "ws-1", repoId: "repo-1", name: "test-ws", branch: "main", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "", archivedAt: null }],
  });
  useUIStore.setState({ showBookmarksInFiles: false });
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("FileTreePanel", () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

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
    useFileTreeStore.setState({ loading: { "ws-1": true } });
    expect(screen.queryByText("Loading files...")).not.toBeInTheDocument();
  });

  it("shows folder-open icon when directory is expanded", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    expect(screen.getByTestId("folder-icon")).toBeInTheDocument();
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
    expect(() => fireEvent.click(file)).not.toThrow();
  });

  it("skips loading when files are already cached", async () => {
    const loadFilesSpy = vi.spyOn(useFileTreeStore.getState(), "loadFiles");
    const loadRepoFilesSpy = vi.spyOn(useFileTreeStore.getState(), "loadRepoFiles");
    useFileTreeStore.setState({
      files: { "ws-2": ["cached.ts"] },
    });
    render(
      <FileTreePanel context={{ id: "ws-2", type: "workspace" }} />,
    );
    expect(screen.getByText("cached.ts")).toBeInTheDocument();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { resolve(); });
      });
    });
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

  // -----------------------------------------------------------------------
  // Header toolbar buttons
  // -----------------------------------------------------------------------

  it("renders New File and New Folder buttons in the header", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    expect(screen.getByTitle("New File")).toBeInTheDocument();
    expect(screen.getByTitle("New Folder")).toBeInTheDocument();
  });

  it("clicking header New File button shows inline input at root", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    fireEvent.click(screen.getByTitle("New File"));
    expect(screen.getByTestId("inline-new-input")).toBeInTheDocument();
  });

  it("clicking header New Folder button shows inline input at root", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    fireEvent.click(screen.getByTitle("New Folder"));
    expect(screen.getByTestId("inline-new-input")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Context menu — basic open/close
  // -----------------------------------------------------------------------

  it("opens context menu on right-click with New File and New Folder items", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("New File...")).toBeInTheDocument();
    expect(screen.getByText("New Folder...")).toBeInTheDocument();
  });

  it("context menu shows Copy Relative Path for files", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Copy Relative Path")).toBeInTheDocument();
  });

  it("context menu shows Open File and Open in Editor for files when callbacks provided", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileClick={vi.fn()}
        onFileDoubleClick={vi.fn()}
      />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Open File")).toBeInTheDocument();
    expect(screen.getByText("Open in Editor")).toBeInTheDocument();
  });

  it("context menu does not show Open File for directories", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileClick={vi.fn()}
      />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.contextMenu(srcDir);
    expect(screen.getByText("New File...")).toBeInTheDocument();
    expect(screen.queryByText("Open File")).not.toBeInTheDocument();
  });

  it("context menu shows Copy Path and Reveal in Finder when repo path available", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    expect(screen.getByText("Copy Path")).toBeInTheDocument();
    expect(screen.getByText("Reveal in Finder")).toBeInTheDocument();
  });

  it("hides Copy Path and Reveal in Finder when repo path not available", async () => {
    useRepositoryStore.setState({ repositories: [] });
    useWorkspaceStore.setState({ workspaces: [] });
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    expect(screen.queryByText("Copy Path")).not.toBeInTheDocument();
    expect(screen.queryByText("Reveal in Finder")).not.toBeInTheDocument();
    expect(screen.getByText("Copy Relative Path")).toBeInTheDocument();
  });

  it("does not show Run Tests in context menu", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onRunTestFile={vi.fn()}
      />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("closes context menu when clicking outside", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("New File...")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("New File...")).not.toBeInTheDocument();
  });

  it("closes context menu when Escape key is pressed", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("New File...")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("New File...")).not.toBeInTheDocument();
  });

  it("does not close context menu when clicking inside it", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    const newFileBtn = screen.getByText("New File...");
    fireEvent.mouseDown(newFileBtn);
    expect(screen.getByText("New File...")).toBeInTheDocument();
  });

  it("does not close context menu on non-Escape key press", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("New File...")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByText("New File...")).toBeInTheDocument();
  });

  it("cleans up event listeners when context menu unmounts", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["test.spec.ts"]);
    const removeMouseSpy = vi.spyOn(document, "removeEventListener");
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("test.spec.ts");
    fireEvent.contextMenu(file);
    expect(screen.getByText("New File...")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(removeMouseSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    expect(removeMouseSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeMouseSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Context menu — path actions
  // -----------------------------------------------------------------------

  it("copies relative path to clipboard", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.click(srcDir);
    const file = screen.getByText("main.ts");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("Copy Relative Path"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("src/main.ts");
  });

  it("copies absolute path to clipboard", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.click(srcDir);
    const file = screen.getByText("main.ts");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("Copy Path"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/home/user/test-repo/src/main.ts");
  });

  it("calls shell open for Reveal in Finder on files", async () => {
    const shellMod = await import("@tauri-apps/plugin-shell");
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.click(srcDir);
    const file = screen.getByText("main.ts");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("Reveal in Finder"));
    await vi.waitFor(() => {
      expect(shellMod.open).toHaveBeenCalledWith("/home/user/test-repo/src");
    });
  });

  it("calls onFileClick from Open File context menu item", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    const onFileClick = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileClick={onFileClick}
      />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("Open File"));
    expect(onFileClick).toHaveBeenCalledWith("readme.md");
  });

  it("calls onFileDoubleClick from Open in Editor context menu item", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    const onFileDoubleClick = vi.fn();
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
        onFileDoubleClick={onFileDoubleClick}
      />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("Open in Editor"));
    expect(onFileDoubleClick).toHaveBeenCalledWith("readme.md");
  });

  // -----------------------------------------------------------------------
  // New File / New Folder context menu + inline input
  // -----------------------------------------------------------------------

  it("clicking 'New File...' on a directory renders inline input inside it", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.click(srcDir);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    fireEvent.contextMenu(srcDir);
    fireEvent.click(screen.getByText("New File..."));
    expect(screen.getByTestId("inline-new-input")).toBeInTheDocument();
  });

  it("clicking 'New File...' on a file targets the parent directory", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.click(srcDir);
    const file = screen.getByText("main.ts");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("New File..."));
    expect(screen.getByTestId("inline-new-input")).toBeInTheDocument();
  });

  it("clicking 'New File...' on a root-level file shows inline input at root", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("New File..."));
    expect(screen.getByTestId("inline-new-input")).toBeInTheDocument();
  });

  it("pressing Escape in the inline input clears it without calling any command", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("New File..."));
    const input = screen.getByTestId("inline-new-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("inline-new-input")).not.toBeInTheDocument();
    expect(createWorkspaceFile).not.toHaveBeenCalled();
    expect(createRepoFile).not.toHaveBeenCalled();
  });

  it("pressing Enter calls createWorkspaceFile for workspace context", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    fireEvent.click(srcDir);
    fireEvent.contextMenu(srcDir);
    fireEvent.click(screen.getByText("New File..."));
    const input = screen.getByTestId("inline-new-input");
    fireEvent.change(input, { target: { value: "newfile.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => {
      expect(createWorkspaceFile).toHaveBeenCalledWith("ws-1", "src/newfile.ts");
    });
  });

  it("pressing Enter calls createRepoFile for repo context", async () => {
    vi.mocked(listRepoFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "repo-1", type: "repo" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("New File..."));
    const input = screen.getByTestId("inline-new-input");
    fireEvent.change(input, { target: { value: "newfile.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => {
      expect(createRepoFile).toHaveBeenCalledWith("repo-1", "newfile.ts");
    });
  });

  it("pressing Enter calls createWorkspaceDirectory for 'New Folder...'", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("New Folder..."));
    const input = screen.getByTestId("inline-new-input");
    fireEvent.change(input, { target: { value: "newdir" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => {
      expect(createWorkspaceDirectory).toHaveBeenCalledWith("ws-1", "newdir");
    });
  });

  it("pressing Enter calls createRepoDirectory for repo context 'New Folder...'", async () => {
    vi.mocked(listRepoFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "repo-1", type: "repo" }} />,
    );
    const file = await screen.findByText("readme.md");
    fireEvent.contextMenu(file);
    fireEvent.click(screen.getByText("New Folder..."));
    const input = screen.getByTestId("inline-new-input");
    fireEvent.change(input, { target: { value: "newdir" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => {
      expect(createRepoDirectory).toHaveBeenCalledWith("repo-1", "newdir");
    });
  });

  it("target directory is auto-expanded when 'New File...' is clicked on a directory", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    const srcDir = await screen.findByText("src");
    expect(screen.queryByText("main.ts")).not.toBeInTheDocument();
    fireEvent.contextMenu(srcDir);
    fireEvent.click(screen.getByText("New File..."));
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByTestId("inline-new-input")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Bookmark toggle
  // -----------------------------------------------------------------------

  it("renders bookmark toggle button in header", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    expect(screen.getByTitle("Show Bookmarks")).toBeInTheDocument();
  });

  it("clicking bookmark toggle shows BookmarksPanel", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    fireEvent.click(screen.getByTitle("Show Bookmarks"));
    expect(screen.getByTestId("bookmarks-panel")).toBeInTheDocument();
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
  });

  it("clicking bookmark toggle again shows file tree", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    // Toggle on
    fireEvent.click(screen.getByTitle("Show Bookmarks"));
    expect(screen.getByTestId("bookmarks-panel")).toBeInTheDocument();
    // Toggle off
    fireEvent.click(screen.getByTitle("Show Files"));
    expect(screen.queryByTestId("bookmarks-panel")).not.toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("hides New File and New Folder buttons when bookmarks are active", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["readme.md"]);
    render(
      <FileTreePanel context={{ id: "ws-1", type: "workspace" }} />,
    );
    await screen.findByText("readme.md");
    expect(screen.getByTitle("New File")).toBeInTheDocument();
    expect(screen.getByTitle("New Folder")).toBeInTheDocument();
    // Toggle bookmarks on
    fireEvent.click(screen.getByTitle("Show Bookmarks"));
    expect(screen.queryByTitle("New File")).not.toBeInTheDocument();
    expect(screen.queryByTitle("New Folder")).not.toBeInTheDocument();
  });
});
