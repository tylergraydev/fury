import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Workspace Advanced (Real Backend)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<Record<string, unknown>>;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing ? (existing.id as string) : ((await bridge.invoke("add_repository", { path: FURY_PATH })) as Record<string, unknown>).id as string;

    const suffix = Date.now();
    const ws = (await bridge.invoke("create_workspace", {
      request: { repoId, workspaceName: `adv-test-${suffix}`, branchName: `adv-test-${suffix}` },
    }, { slow: true })) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge.invoke("delete_workspace", { workspaceId }, { slow: true }).catch(() => {});
    }
  });

  test("archive then list_archived_workspaces shows it", async ({ bridge }) => {
    await bridge.invoke("archive_workspace", { workspaceId }, { slow: true });

    const archived = (await bridge.invoke("list_archived_workspaces")) as Array<Record<string, unknown>>;
    const found = archived.find((w) => w.id === workspaceId);
    expect(found).toBeTruthy();

    // Restore for further tests
    await bridge.invoke("restore_workspace", { workspaceId }, { slow: true });
  });

  test("restore_workspace brings it back to active", async ({ bridge }) => {
    const active = (await bridge.invoke("list_workspaces")) as Array<Record<string, unknown>>;
    const found = active.find((w) => w.id === workspaceId);
    expect(found).toBeTruthy();
    expect(found!.status).toBe("Active");
  });

  test("export_workspace returns valid JSON", async ({ bridge }) => {
    const json = (await bridge.invoke("export_workspace", {
      options: {
        workspaceId,
        includeChat: true,
        includeTodos: true,
        includeRepoSettings: false,
        includeEnvVars: false,
        includeBookmarks: false,
        includeSnippets: false,
      },
    })) as string;

    expect(json).toBeTruthy();
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed).toBeTruthy();
  });

  test("get_diff returns diff structure for workspace", async ({ bridge }) => {
    const diff = (await bridge.invoke("get_diff", { workspaceId })) as Record<string, unknown>;
    expect(diff).toBeTruthy();
    expect(Array.isArray(diff.files)).toBe(true);
    expect(typeof diff.totalAdditions).toBe("number");
    expect(typeof diff.totalDeletions).toBe("number");
  });
});
