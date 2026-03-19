import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceExportDialog } from "./WorkspaceExportDialog";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

vi.mock("lucide-react", () => ({
  Download: () => <span data-testid="download-icon" />,
  X: () => <span data-testid="x-icon" />,
  AlertTriangle: () => <span data-testid="alert-icon" />,
}));

const mockExportWorkspace = vi.fn();

vi.mock("../../lib/tauri", () => ({
  exportWorkspace: (...args: unknown[]) => mockExportWorkspace(...args),
}));

beforeEach(() => {
  mockExportWorkspace.mockReset().mockResolvedValue('{"formatVersion":1}');
  vi.mocked(save).mockReset().mockResolvedValue(null);
  vi.mocked(writeTextFile).mockReset().mockResolvedValue(undefined);
  useWorkspaceStore.setState({
    workspaces: [
      {
        id: "ws-1",
        repoId: "repo-1",
        name: "my-workspace",
        branch: "main",
        status: "Active",
        portBase: 10000,
        autoCommit: true,
        pinned: false,
        createdAt: "2025-01-01T00:00:00Z",
        archivedAt: null,
      },
    ] as never,
    activeWorkspaceId: "ws-1",
  });
});

describe("WorkspaceExportDialog", () => {
  it("renders the dialog with title and workspace name", () => {
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);
    expect(screen.getByText("Export Workspace")).toBeInTheDocument();
    expect(screen.getByText("my-workspace")).toBeInTheDocument();
  });

  it("has all checkboxes checked by default except env vars", () => {
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // Chat, Todos, RepoSettings, EnvVars, Bookmarks, Snippets = 6 checkboxes
    expect(checkboxes).toHaveLength(6);
    // Chat (0), Todos (1), RepoSettings (2), Bookmarks (4), Snippets (5) are checked
    expect(checkboxes[0]).toBeChecked(); // Chat
    expect(checkboxes[1]).toBeChecked(); // Todos
    expect(checkboxes[2]).toBeChecked(); // Repo Settings
    expect(checkboxes[3]).not.toBeChecked(); // Env Vars (unchecked by default)
    expect(checkboxes[4]).toBeChecked(); // Bookmarks
    expect(checkboxes[5]).toBeChecked(); // Snippets
  });

  it("shows env vars warning", () => {
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);
    expect(
      screen.getByText(/Environment variables may contain secrets/),
    ).toBeInTheDocument();
  });

  it("hides env vars section when repo settings unchecked", () => {
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);
    const repoSettingsCheckbox = screen.getAllByRole("checkbox")[2];
    fireEvent.click(repoSettingsCheckbox);
    expect(
      screen.queryByText(/Environment variables may contain secrets/),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={onClose} />);
    const xButton = screen.getByTestId("x-icon").closest("button")!;
    fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("does nothing when save dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Export"));
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(mockExportWorkspace).not.toHaveBeenCalled();
  });

  it("exports workspace when file path is selected", async () => {
    vi.mocked(save).mockResolvedValue("/tmp/export.json");
    mockExportWorkspace.mockResolvedValue('{"formatVersion":1}');
    const onClose = vi.fn();
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={onClose} />);
    fireEvent.click(screen.getByText("Export"));
    await waitFor(() => {
      expect(mockExportWorkspace).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        includeChat: true,
        includeTodos: true,
        includeRepoSettings: true,
        includeEnvVars: false,
        includeBookmarks: true,
        includeSnippets: true,
      });
    });
    expect(writeTextFile).toHaveBeenCalledWith(
      "/tmp/export.json",
      '{"formatVersion":1}',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error toast when export fails", async () => {
    vi.mocked(save).mockResolvedValue("/tmp/export.json");
    mockExportWorkspace.mockRejectedValue(new Error("export boom"));
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Export"));
    await waitFor(() => {
      expect(mockExportWorkspace).toHaveBeenCalled();
    });
    // Should not crash, dialog should still be open
    expect(screen.getByText("Export Workspace")).toBeInTheDocument();
  });

  it("passes correct options when checkboxes are toggled", async () => {
    vi.mocked(save).mockResolvedValue("/tmp/export.json");
    mockExportWorkspace.mockResolvedValue("{}");
    render(<WorkspaceExportDialog workspaceId="ws-1" onClose={vi.fn()} />);

    // Uncheck chat and todos
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // Uncheck Chat
    fireEvent.click(checkboxes[1]); // Uncheck Todos
    fireEvent.click(checkboxes[3]); // Check Env Vars

    fireEvent.click(screen.getByText("Export"));
    await waitFor(() => {
      expect(mockExportWorkspace).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        includeChat: false,
        includeTodos: false,
        includeRepoSettings: true,
        includeEnvVars: true,
        includeBookmarks: true,
        includeSnippets: true,
      });
    });
  });
});
