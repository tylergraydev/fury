import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./tauri", () => ({
  detectLspSuggestions: vi.fn(),
}));

import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useToastStore } from "../stores/toastStore";
import { useUIStore } from "../stores/uiStore";
import { detectLspSuggestions } from "./tauri";
import { initLspSuggestionListener, _resetCheckedPaths } from "./lspSuggestionListener";
import type { LspSuggestion } from "./tauri";

beforeEach(() => {
  _resetCheckedPaths();
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    activeRepoId: null,
  });
  useRepositoryStore.setState({
    repositories: [],
  });
  useToastStore.setState({
    toasts: [],
  });
  useUIStore.setState({
    settingsInitialTab: null,
  });
  vi.clearAllMocks();
});

describe("lspSuggestionListener", () => {
  it("returns a cleanup function", () => {
    const cleanup = initLspSuggestionListener();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("detects suggestions when workspace activates", async () => {
    const suggestions: LspSuggestion[] = [
      {
        pluginName: "typescript-lsp",
        language: "TypeScript",
        fileCount: 50,
        binaryName: "typescript-language-server",
        installHint: "npm install -g typescript-language-server",
      },
    ];
    vi.mocked(detectLspSuggestions).mockResolvedValue(suggestions);

    useRepositoryStore.setState({
      repositories: [
        {
          id: "repo-1",
          name: "my-repo",
          path: "/path/to/repo",
          defaultBranch: "main",
          currentBranch: "main",
        },
      ],
    });

    useWorkspaceStore.setState({
      workspaces: [
        {
          id: "ws-1",
          repoId: "repo-1",
          name: "workspace-1",
          branch: "main",
          status: "Active",
          portBase: 3000,
          autoCommit: false,
          pinned: false,
          createdAt: "2025-01-01",
          archivedAt: null,
        },
      ],
    });

    const cleanup = initLspSuggestionListener();

    // Activate workspace
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });

    // Wait for async detection
    await vi.waitFor(() => {
      expect(detectLspSuggestions).toHaveBeenCalledWith("/path/to/repo");
    });

    await vi.waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.length).toBe(1);
      expect(toasts[0].message).toContain("TypeScript");
      expect(toasts[0].type).toBe("info");
      expect(toasts[0].action).toBeDefined();
    });

    cleanup();
  });

  it("does not fire for repos already checked", async () => {
    vi.mocked(detectLspSuggestions).mockResolvedValue([]);

    useRepositoryStore.setState({
      repositories: [
        {
          id: "repo-1",
          name: "my-repo",
          path: "/path/to/repo",
          defaultBranch: "main",
          currentBranch: "main",
        },
      ],
    });

    useWorkspaceStore.setState({
      workspaces: [
        {
          id: "ws-1",
          repoId: "repo-1",
          name: "workspace-1",
          branch: "main",
          status: "Active",
          portBase: 3000,
          autoCommit: false,
          pinned: false,
          createdAt: "2025-01-01",
          archivedAt: null,
        },
        {
          id: "ws-2",
          repoId: "repo-1",
          name: "workspace-2",
          branch: "feature",
          status: "Active",
          portBase: 3010,
          autoCommit: false,
          pinned: false,
          createdAt: "2025-01-01",
          archivedAt: null,
        },
      ],
    });

    const cleanup = initLspSuggestionListener();

    // Activate first workspace
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    await vi.waitFor(() => {
      expect(detectLspSuggestions).toHaveBeenCalledTimes(1);
    });

    // Activate second workspace on same repo — should not re-detect
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-2" });

    // Small delay to ensure no additional call
    await new Promise((r) => setTimeout(r, 50));
    expect(detectLspSuggestions).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("does not show toast when no suggestions", async () => {
    vi.mocked(detectLspSuggestions).mockResolvedValue([]);

    useRepositoryStore.setState({
      repositories: [
        {
          id: "repo-1",
          name: "my-repo",
          path: "/path/to/empty",
          defaultBranch: "main",
          currentBranch: "main",
        },
      ],
    });

    useWorkspaceStore.setState({
      workspaces: [
        {
          id: "ws-1",
          repoId: "repo-1",
          name: "workspace-1",
          branch: "main",
          status: "Active",
          portBase: 3000,
          autoCommit: false,
          pinned: false,
          createdAt: "2025-01-01",
          archivedAt: null,
        },
      ],
    });

    const cleanup = initLspSuggestionListener();
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });

    await vi.waitFor(() => {
      expect(detectLspSuggestions).toHaveBeenCalled();
    });

    // Small delay to confirm no toast
    await new Promise((r) => setTimeout(r, 50));
    expect(useToastStore.getState().toasts.length).toBe(0);

    cleanup();
  });

  it("stops firing after cleanup", () => {
    const cleanup = initLspSuggestionListener();
    cleanup();

    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });

    expect(detectLspSuggestions).not.toHaveBeenCalled();
  });
});
