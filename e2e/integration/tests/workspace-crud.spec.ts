import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Workspace CRUD (Real Backend)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    // Find or add the fury repo
    const repos = (await bridge.invoke("list_repositories")) as Array<
      Record<string, unknown>
    >;
    const existing = repos.find((r) => r.path === FURY_PATH);
    if (existing) {
      repoId = existing.id as string;
    } else {
      const repo = (await bridge.invoke("add_repository", {
        path: FURY_PATH,
      })) as Record<string, unknown>;
      repoId = repo.id as string;
    }
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge
        .invoke("delete_workspace", { workspaceId })
        .catch(() => {});
    }
  });

  test("create_workspace returns active workspace", async ({ bridge }) => {
    const suffix = Date.now();
    const ws = (await bridge.invoke("create_workspace", {
      request: {
        repoId,
        workspaceName: `ws-crud-${suffix}`,
        branchName: `ws-crud-${suffix}`,
      },
    }, { slow: true })) as Record<string, unknown>;

    expect(ws).toBeTruthy();
    expect(ws.id).toBeTruthy();
    expect(ws.name).toBe(`ws-crud-${suffix}`);
    expect(ws.status).toBe("Active");

    workspaceId = ws.id as string;
  });

  test("list_workspaces includes the new workspace", async ({ bridge }) => {
    const workspaces = (await bridge.invoke(
      "list_workspaces",
    )) as Array<Record<string, unknown>>;

    const found = workspaces.find((w) => w.id === workspaceId);
    expect(found).toBeTruthy();
    expect(found!.name).toContain("ws-crud-");
  });

  test("rename_workspace persists the new name", async ({ bridge }) => {
    await bridge.invoke("rename_workspace", {
      workspaceId,
      name: "renamed-smoke-e2e",
    });

    const workspaces = (await bridge.invoke(
      "list_workspaces",
    )) as Array<Record<string, unknown>>;
    const found = workspaces.find((w) => w.id === workspaceId);
    expect(found!.name).toBe("renamed-smoke-e2e");
  });

  test("archive and delete workspace", async ({ bridge }) => {
    await bridge.invoke("archive_workspace", { workspaceId }, { slow: true });

    const active = (await bridge.invoke(
      "list_workspaces",
    )) as Array<Record<string, unknown>>;
    const inActive = active.find((w) => w.id === workspaceId);
    expect(inActive).toBeUndefined();

    await bridge.invoke("delete_workspace", { workspaceId });
    workspaceId = "";
  });
});
