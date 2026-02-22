import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  listArchivedWorkspaces: vi.fn(),
  restoreWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
}));

import { useWorkspaceStore } from "./workspaceStore";
import {
  listWorkspaces,
  createWorkspace,
  archiveWorkspace,
  deleteWorkspace,
  listArchivedWorkspaces,
  restoreWorkspace,
  renameWorkspace,
} from "../lib/tauri";
import type { WorkspaceInfo } from "../lib/tauri";

function makeWs(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: "ws-1",
    name: "test-ws",
    repoId: "repo-1",
    branch: "main",
    path: "/path/to/ws",
    ...overrides,
  } as WorkspaceInfo;
}

beforeEach(() => {
  useWorkspaceStore.setState(
    {
      workspaces: [],
      archivedWorkspaces: [],
      activeWorkspaceId: null,
      activeRepoId: null,
      loading: false,
      error: null,
    },
  );
  vi.clearAllMocks();
});

describe("workspaceStore - loadWorkspaces", () => {
  it("loads workspaces and sets loading state", async () => {
    const wsList = [makeWs()];
    vi.mocked(listWorkspaces).mockResolvedValue(wsList);

    await useWorkspaceStore.getState().loadWorkspaces();

    expect(useWorkspaceStore.getState().workspaces).toEqual(wsList);
    expect(useWorkspaceStore.getState().loading).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(listWorkspaces).mockRejectedValue(new Error("fail"));

    await useWorkspaceStore.getState().loadWorkspaces();

    expect(useWorkspaceStore.getState().error).toBe("Error: fail");
    expect(useWorkspaceStore.getState().loading).toBe(false);
  });
});

describe("workspaceStore - createWs", () => {
  it("creates a workspace and adds it to the list", async () => {
    const ws = makeWs({ id: "ws-new" });
    vi.mocked(createWorkspace).mockResolvedValue(ws);

    const result = await useWorkspaceStore.getState().createWs({
      repoId: "repo-1",
      name: "new-ws",
      branch: "main",
    } as any);

    expect(result).toEqual(ws);
    expect(useWorkspaceStore.getState().workspaces).toContainEqual(ws);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-new");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(createWorkspace).mockRejectedValue(new Error("create fail"));

    await expect(
      useWorkspaceStore.getState().createWs({
        repoId: "repo-1",
        name: "new-ws",
        branch: "main",
      } as any),
    ).rejects.toThrow("create fail");

    expect(useWorkspaceStore.getState().error).toBe("Error: create fail");
  });
});

describe("workspaceStore - archiveWs", () => {
  it("moves workspace from active to archived list", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useWorkspaceStore.getState().archivedWorkspaces).toContainEqual(ws);
  });

  it("clears activeWorkspaceId when archiving the active workspace", async () => {
    const ws = makeWs({ id: "ws-1", repoId: "repo-1" });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
    });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().activeRepoId).toBe("repo-1");
  });

  it("preserves activeWorkspaceId when archiving a non-active workspace", async () => {
    const ws1 = makeWs({ id: "ws-1" });
    const ws2 = makeWs({ id: "ws-2" });
    useWorkspaceStore.setState({
      workspaces: [ws1, ws2],
      activeWorkspaceId: "ws-2",
    });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-2");
  });

  it("sets error and throws on failure", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(archiveWorkspace).mockRejectedValue(new Error("archive fail"));

    await expect(
      useWorkspaceStore.getState().archiveWs("ws-1"),
    ).rejects.toThrow("archive fail");

    expect(useWorkspaceStore.getState().error).toBe("Error: archive fail");
  });

  it("handles archiving workspace that is not found in list", async () => {
    useWorkspaceStore.setState({ workspaces: [] });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-missing");

    expect(useWorkspaceStore.getState().archivedWorkspaces).toEqual([]);
  });

  it("sets activeRepoId from workspace repoId when archiving active workspace without repoId", async () => {
    // Create a workspace without repoId
    const ws = makeWs({ id: "ws-1", repoId: undefined as any });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
      activeRepoId: "existing-repo",
    });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    // Falls back to existing activeRepoId since workspace.repoId is undefined
    expect(useWorkspaceStore.getState().activeRepoId).toBe("existing-repo");
  });
});

describe("workspaceStore - deleteWs", () => {
  it("removes workspace from the list", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
  });

  it("clears activeWorkspaceId when deleting the active workspace", async () => {
    const ws = makeWs({ id: "ws-1", repoId: "repo-1" });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
    });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().activeRepoId).toBe("repo-1");
  });

  it("preserves activeWorkspaceId when deleting non-active workspace", async () => {
    const ws1 = makeWs({ id: "ws-1" });
    const ws2 = makeWs({ id: "ws-2" });
    useWorkspaceStore.setState({
      workspaces: [ws1, ws2],
      activeWorkspaceId: "ws-2",
      activeRepoId: "repo-existing",
    });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-2");
    expect(useWorkspaceStore.getState().activeRepoId).toBe("repo-existing");
  });

  it("sets error on failure without throwing", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(deleteWorkspace).mockRejectedValue(new Error("delete fail"));

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().error).toBe("Error: delete fail");
  });

  it("uses fallback activeRepoId when deleting active workspace without repoId", async () => {
    const ws = makeWs({ id: "ws-1", repoId: undefined as any });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
      activeRepoId: "existing-repo",
    });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().activeRepoId).toBe("existing-repo");
  });
});

describe("workspaceStore - setActive / setActiveRepo", () => {
  it("setActive sets activeWorkspaceId and clears activeRepoId", () => {
    useWorkspaceStore.setState({ activeRepoId: "repo-1" });
    useWorkspaceStore.getState().setActive("ws-1");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-1");
    expect(useWorkspaceStore.getState().activeRepoId).toBeNull();
  });

  it("setActiveRepo sets activeRepoId and clears activeWorkspaceId", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useWorkspaceStore.getState().setActiveRepo("repo-1");
    expect(useWorkspaceStore.getState().activeRepoId).toBe("repo-1");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });
});

describe("workspaceStore - loadArchivedWorkspaces", () => {
  it("loads archived workspaces", async () => {
    const archived = [makeWs({ id: "ws-archived" })];
    vi.mocked(listArchivedWorkspaces).mockResolvedValue(archived);

    await useWorkspaceStore.getState().loadArchivedWorkspaces();

    expect(useWorkspaceStore.getState().archivedWorkspaces).toEqual(archived);
  });

  it("sets error on failure", async () => {
    vi.mocked(listArchivedWorkspaces).mockRejectedValue(new Error("load fail"));

    await useWorkspaceStore.getState().loadArchivedWorkspaces();

    expect(useWorkspaceStore.getState().error).toBe("Error: load fail");
  });
});

describe("workspaceStore - restoreWs", () => {
  it("moves workspace from archived to active list", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ archivedWorkspaces: [ws] });
    vi.mocked(restoreWorkspace).mockResolvedValue(ws);

    await useWorkspaceStore.getState().restoreWs("ws-1");

    expect(useWorkspaceStore.getState().workspaces).toContainEqual(ws);
    expect(useWorkspaceStore.getState().archivedWorkspaces).toHaveLength(0);
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(restoreWorkspace).mockRejectedValue(new Error("restore fail"));

    await expect(
      useWorkspaceStore.getState().restoreWs("ws-1"),
    ).rejects.toThrow("restore fail");

    expect(useWorkspaceStore.getState().error).toBe("Error: restore fail");
  });
});

describe("workspaceStore - renameWs", () => {
  it("renames a workspace in the list", async () => {
    const ws = makeWs({ id: "ws-1", name: "old-name" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(renameWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().renameWs("ws-1", "new-name");

    const updated = useWorkspaceStore.getState().workspaces[0];
    expect(updated.name).toBe("new-name");
    expect(renameWorkspace).toHaveBeenCalledWith("ws-1", "new-name");
  });

  it("leaves non-matching workspaces unchanged", async () => {
    const ws1 = makeWs({ id: "ws-1", name: "one" });
    const ws2 = makeWs({ id: "ws-2", name: "two" });
    useWorkspaceStore.setState({ workspaces: [ws1, ws2] });
    vi.mocked(renameWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().renameWs("ws-1", "renamed");

    expect(useWorkspaceStore.getState().workspaces[0].name).toBe("renamed");
    expect(useWorkspaceStore.getState().workspaces[1].name).toBe("two");
  });

  it("sets error and throws on failure", async () => {
    const ws = makeWs({ id: "ws-1", name: "old" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(renameWorkspace).mockRejectedValue(new Error("rename fail"));

    await expect(
      useWorkspaceStore.getState().renameWs("ws-1", "new"),
    ).rejects.toThrow("rename fail");

    expect(useWorkspaceStore.getState().error).toBe("Error: rename fail");
  });
});
