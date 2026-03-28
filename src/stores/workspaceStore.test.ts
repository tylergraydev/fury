import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependent stores
vi.mock("./chatStore", () => ({
  useChatStore: { getState: () => ({ unsubscribe: vi.fn() }) },
}));
vi.mock("./agentStore", () => ({
  useAgentStore: { getState: () => ({ unsubscribe: vi.fn() }) },
}));
vi.mock("./prStore", () => ({
  usePrStore: { getState: () => ({ unsubscribe: vi.fn() }) },
}));
vi.mock("./uiStore", () => ({
  useUIStore: { getState: () => ({ closeChatTabsForContext: vi.fn() }) },
}));
vi.mock("../lib/activityLogListeners", () => ({
  cleanupWorkspaceTracking: vi.fn(),
}));
vi.mock("../lib/notificationListeners", () => ({
  cleanupWorkspaceTracking: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  listArchivedWorkspaces: vi.fn(),
  restoreWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  setWorkspacePinned: vi.fn(),
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
  setWorkspacePinned,
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

  it("clears activeWorkspaceId and activeRepoId when archiving the active workspace", async () => {
    const ws = makeWs({ id: "ws-1", repoId: "repo-1" });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
    });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().activeRepoId).toBeNull();
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

  it("clears activeRepoId when archiving active workspace even if activeRepoId was set", async () => {
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
    // activeRepoId is cleared to prevent stale references
    expect(useWorkspaceStore.getState().activeRepoId).toBeNull();
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

  it("clears activeWorkspaceId and activeRepoId when deleting the active workspace", async () => {
    const ws = makeWs({ id: "ws-1", repoId: "repo-1" });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
    });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().activeRepoId).toBeNull();
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

  it("clears activeRepoId when deleting active workspace even if activeRepoId was set", async () => {
    const ws = makeWs({ id: "ws-1", repoId: undefined as any });
    useWorkspaceStore.setState({
      workspaces: [ws],
      activeWorkspaceId: "ws-1",
      activeRepoId: "existing-repo",
    });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-1");

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    // activeRepoId is cleared to prevent stale references
    expect(useWorkspaceStore.getState().activeRepoId).toBeNull();
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

describe("workspaceStore - pinWs", () => {
  it("pins a workspace and updates the list", async () => {
    const ws = makeWs({ id: "ws-1", pinned: false });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(setWorkspacePinned).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().pinWs("ws-1", true);

    expect(setWorkspacePinned).toHaveBeenCalledWith("ws-1", true);
    expect(useWorkspaceStore.getState().workspaces[0].pinned).toBe(true);
  });

  it("leaves other workspaces unchanged", async () => {
    const ws1 = makeWs({ id: "ws-1", pinned: false });
    const ws2 = makeWs({ id: "ws-2", pinned: false });
    useWorkspaceStore.setState({ workspaces: [ws1, ws2] });
    vi.mocked(setWorkspacePinned).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().pinWs("ws-1", true);

    expect(useWorkspaceStore.getState().workspaces[0].pinned).toBe(true);
    expect(useWorkspaceStore.getState().workspaces[1].pinned).toBe(false);
  });

  it("sets error and throws on failure", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [ws] });
    vi.mocked(setWorkspacePinned).mockRejectedValue(new Error("pin fail"));

    await expect(
      useWorkspaceStore.getState().pinWs("ws-1", true),
    ).rejects.toThrow("pin fail");

    expect(useWorkspaceStore.getState().error).toBe("Error: pin fail");
  });
});

// ─── Mutation-killing tests ──────────────────────────────────────────────

describe("workspaceStore - loadWorkspaces sets loading state", () => {
  it("sets loading to true then false", async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    const promise = useWorkspaceStore.getState().loadWorkspaces();
    expect(useWorkspaceStore.getState().loading).toBe(true);

    await promise;
    expect(useWorkspaceStore.getState().loading).toBe(false);
  });

  it("clears error on load", async () => {
    useWorkspaceStore.setState({ error: "previous error" });
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    await useWorkspaceStore.getState().loadWorkspaces();
    expect(useWorkspaceStore.getState().error).toBeNull();
  });
});

describe("workspaceStore - archiveWs removes from active list", () => {
  it("removes archived workspace from workspaces array", async () => {
    const ws1 = makeWs({ id: "ws-1", name: "keep" });
    const ws2 = makeWs({ id: "ws-2", name: "archive-me" });
    useWorkspaceStore.setState({ workspaces: [ws1, ws2] });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-2");

    const remaining = useWorkspaceStore.getState().workspaces;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("ws-1");
    // Archived workspace should NOT be in active list
    expect(remaining.find((w) => w.id === "ws-2")).toBeUndefined();
  });

  it("adds to archivedWorkspaces when archived item found", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [ws], archivedWorkspaces: [] });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    const archived = useWorkspaceStore.getState().archivedWorkspaces;
    expect(archived.some((w) => w.id === "ws-1")).toBe(true);
  });
});

describe("workspaceStore - deleteWs removes from active list", () => {
  it("removes deleted workspace from workspaces array", async () => {
    const ws1 = makeWs({ id: "ws-1" });
    const ws2 = makeWs({ id: "ws-2" });
    useWorkspaceStore.setState({ workspaces: [ws1, ws2] });
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().deleteWs("ws-2");

    const remaining = useWorkspaceStore.getState().workspaces;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("ws-1");
  });
});

describe("workspaceStore - restoreWs moves workspace from archived to active list", () => {
  it("moves workspace from archived to active", async () => {
    const ws = makeWs({ id: "ws-1" });
    useWorkspaceStore.setState({ workspaces: [], archivedWorkspaces: [ws] });
    vi.mocked(restoreWorkspace).mockResolvedValue(ws);

    await useWorkspaceStore.getState().restoreWs("ws-1");

    expect(useWorkspaceStore.getState().workspaces.find((w) => w.id === "ws-1")).toBeTruthy();
    expect(useWorkspaceStore.getState().archivedWorkspaces.find((w) => w.id === "ws-1")).toBeUndefined();
  });
});

describe("workspaceStore - initial state", () => {
  it("starts with empty workspaces array", () => {
    useWorkspaceStore.setState({ workspaces: [] });
    expect(useWorkspaceStore.getState().workspaces).toEqual([]);
    expect(Array.isArray(useWorkspaceStore.getState().workspaces)).toBe(true);
  });

  it("starts with empty archivedWorkspaces array", () => {
    useWorkspaceStore.setState({ archivedWorkspaces: [] });
    expect(useWorkspaceStore.getState().archivedWorkspaces).toEqual([]);
    expect(Array.isArray(useWorkspaceStore.getState().archivedWorkspaces)).toBe(true);
  });

  it("starts with loading false", () => {
    expect(useWorkspaceStore.getState().loading).toBe(false);
  });

  it("starts with error null", () => {
    expect(useWorkspaceStore.getState().error).toBeNull();
  });
});

describe("workspaceStore - setActive changes activeWorkspaceId", () => {
  it("sets activeWorkspaceId", () => {
    useWorkspaceStore.getState().setActive("ws-42");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-42");
  });

  it("clears activeWorkspaceId with null", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useWorkspaceStore.getState().setActive(null);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });
});

describe("workspaceStore - archiveWs clears activeWorkspaceId when archiving active", () => {
  it("clears activeWorkspaceId when archiving the active workspace", async () => {
    const ws = makeWs({ id: "ws-active" });
    useWorkspaceStore.setState({ workspaces: [ws], activeWorkspaceId: "ws-active" });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-active");

    expect(useWorkspaceStore.getState().activeWorkspaceId).not.toBe("ws-active");
  });
});

describe("workspaceStore - loadWorkspaces error handling", () => {
  it("sets error message on failure", async () => {
    vi.mocked(listWorkspaces).mockRejectedValue(new Error("DB locked"));

    await useWorkspaceStore.getState().loadWorkspaces();

    expect(useWorkspaceStore.getState().error).toBe("Error: DB locked");
    expect(useWorkspaceStore.getState().loading).toBe(false);
  });

  it("clears error on success after previous failure", async () => {
    useWorkspaceStore.setState({ error: "previous" });
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    await useWorkspaceStore.getState().loadWorkspaces();
    expect(useWorkspaceStore.getState().error).toBeNull();
  });
});

describe("workspaceStore - setActive sessionStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores workspace ID in sessionStorage when setting active", () => {
    useWorkspaceStore.getState().setActive("ws-99");
    expect(sessionStorage.getItem("fury:activeWorkspaceId")).toBe("ws-99");
  });

  it("removes workspace ID from sessionStorage when clearing active", () => {
    sessionStorage.setItem("fury:activeWorkspaceId", "ws-old");
    useWorkspaceStore.getState().setActive(null);
    expect(sessionStorage.getItem("fury:activeWorkspaceId")).toBeNull();
  });

  it("removes repo ID from sessionStorage when setting workspace active", () => {
    sessionStorage.setItem("fury:activeRepoId", "repo-old");
    useWorkspaceStore.getState().setActive("ws-99");
    expect(sessionStorage.getItem("fury:activeRepoId")).toBeNull();
  });

  it("clears activeRepoId when setting workspace active", () => {
    useWorkspaceStore.setState({ activeRepoId: "repo-1" });
    useWorkspaceStore.getState().setActive("ws-99");
    expect(useWorkspaceStore.getState().activeRepoId).toBeNull();
  });
});

describe("workspaceStore - setActiveRepo sessionStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores repo ID in sessionStorage when setting active repo", () => {
    useWorkspaceStore.getState().setActiveRepo("repo-42");
    expect(sessionStorage.getItem("fury:activeRepoId")).toBe("repo-42");
  });

  it("removes repo ID from sessionStorage when clearing active repo", () => {
    sessionStorage.setItem("fury:activeRepoId", "repo-old");
    useWorkspaceStore.getState().setActiveRepo(null);
    expect(sessionStorage.getItem("fury:activeRepoId")).toBeNull();
  });

  it("removes workspace ID from sessionStorage when setting repo active", () => {
    sessionStorage.setItem("fury:activeWorkspaceId", "ws-old");
    useWorkspaceStore.getState().setActiveRepo("repo-42");
    expect(sessionStorage.getItem("fury:activeWorkspaceId")).toBeNull();
  });

  it("clears activeWorkspaceId when setting repo active", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    useWorkspaceStore.getState().setActiveRepo("repo-42");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });
});

describe("workspaceStore - createWs clears error", () => {
  it("clears error before creating", async () => {
    useWorkspaceStore.setState({ error: "old error" });
    const ws = makeWs({ id: "ws-new" });
    vi.mocked(createWorkspace).mockResolvedValue(ws);

    await useWorkspaceStore.getState().createWs({} as any);
    expect(useWorkspaceStore.getState().error).toBeNull();
  });
});

describe("workspaceStore - archiveWs selects next workspace", () => {
  it("selects next workspace when archiving active one", async () => {
    const ws1 = makeWs({ id: "ws-1" });
    const ws2 = makeWs({ id: "ws-2" });
    useWorkspaceStore.setState({ workspaces: [ws1, ws2], activeWorkspaceId: "ws-1" });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    // Should select ws-2 as next active
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-2");
  });

  it("finds the archived workspace before removing it", async () => {
    const ws1 = makeWs({ id: "ws-1", name: "found-me" });
    useWorkspaceStore.setState({ workspaces: [ws1], archivedWorkspaces: [] });
    vi.mocked(archiveWorkspace).mockResolvedValue(undefined);

    await useWorkspaceStore.getState().archiveWs("ws-1");

    const archived = useWorkspaceStore.getState().archivedWorkspaces;
    expect(archived).toHaveLength(1);
    expect(archived[0].name).toBe("found-me");
  });
});

describe("workspaceStore - restoreWs removes from archived list", () => {
  it("filters restored workspace from archivedWorkspaces", async () => {
    const ws1 = makeWs({ id: "ws-1" });
    const ws2 = makeWs({ id: "ws-2" });
    useWorkspaceStore.setState({ workspaces: [], archivedWorkspaces: [ws1, ws2] });
    vi.mocked(restoreWorkspace).mockResolvedValue(ws1);

    await useWorkspaceStore.getState().restoreWs("ws-1");

    const archived = useWorkspaceStore.getState().archivedWorkspaces;
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe("ws-2");
  });
});
