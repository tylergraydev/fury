import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Git Operations (Real Backend)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    // Find or add repo
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

    // Create a workspace for git operations that need one
    const ws = (await bridge.invoke("create_workspace", {
      request: {
        repoId,
        workspaceName: "git-smoke-" + Date.now(),
        branchName: "git-smoke-" + Date.now(),
      },
    }, { slow: true })) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge
        .invoke("delete_workspace", { workspaceId })
        .catch(() => {});
    }
  });

  test("list_branches returns real branches including main", async ({
    bridge,
  }) => {
    const branches = (await bridge.invoke("list_branches", {
      repoId,
    })) as string[];

    expect(Array.isArray(branches)).toBe(true);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches).toContain("main");
  });

  test("get_git_log returns real commits with required fields", async ({
    bridge,
  }) => {
    const log = (await bridge.invoke("get_git_log", {
      workspaceId,
      maxCount: 5,
    })) as Array<Record<string, unknown>>;

    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBeGreaterThan(0);

    const commit = log[0];
    expect(commit.hash).toBeTruthy();
    expect(typeof commit.hash).toBe("string");
    expect(commit.message).toBeTruthy();
    expect(commit.author).toBeTruthy();
  });

  test("get_branch_status returns branch info", async ({ bridge }) => {
    const status = (await bridge.invoke("get_branch_status", {
      workspaceId,
    })) as Record<string, unknown>;

    expect(status).toBeTruthy();
    expect(status.branch).toBeTruthy();
    expect(typeof status.ahead).toBe("number");
    expect(typeof status.behind).toBe("number");
  });
});
