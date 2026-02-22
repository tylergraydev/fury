import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileTreePanel } from "./FileTreePanel";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { listWorkspaceFiles } from "../../lib/tauri";

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
    // Mock a slow load so loading stays true
    vi.mocked(listWorkspaceFiles).mockReturnValue(new Promise(() => {}));
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
      />,
    );
    // Wait for loading to be set by the store's loadFiles
    waitFor(() => {
      expect(screen.getByText("Loading files...")).toBeInTheDocument();
    });
  });

  it("shows error state", () => {
    vi.mocked(listWorkspaceFiles).mockRejectedValue(new Error("Failed to load"));
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
      />,
    );
    waitFor(() => {
      expect(screen.getByText("Error: Failed to load")).toBeInTheDocument();
    });
  });

  it("renders file names from flat paths", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["main.ts", "app.ts"]);
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
      />,
    );
    expect(await screen.findByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  it("renders directory structure from nested paths", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["src/main.ts", "src/app.ts"]);
    render(
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
      />,
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
      <FileTreePanel
        context={{ id: "ws-1", type: "workspace" }}
      />,
    );
    // Wait for files to load
    const srcDir = await screen.findByText("src");
    // Initially directory is collapsed
    expect(screen.queryByText("main.ts")).not.toBeInTheDocument();

    // Click src to expand
    fireEvent.click(srcDir);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
  });
});
