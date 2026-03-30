import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("File Operations (Real Backend)", () => {
  let repoId: string;
  let workspaceId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<Record<string, unknown>>;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing ? (existing.id as string) : ((await bridge.invoke("add_repository", { path: FURY_PATH })) as Record<string, unknown>).id as string;

    const suffix = Date.now();
    const ws = (await bridge.invoke("create_workspace", {
      request: { repoId, workspaceName: `file-test-${suffix}`, branchName: `file-test-${suffix}` },
    }, { slow: true })) as Record<string, unknown>;
    workspaceId = ws.id as string;
  });

  test.afterAll(async ({ bridge }) => {
    if (workspaceId) {
      await bridge.invoke("delete_workspace", { workspaceId }, { slow: true }).catch(() => {});
    }
  });

  test("read_workspace_file returns real file content", async ({ bridge }) => {
    const result = (await bridge.invoke("read_workspace_file", {
      workspaceId,
      filePath: "package.json",
    })) as Record<string, unknown>;

    expect(result).toBeTruthy();
    const content = result.content as string;
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe("fury");
  });

  test("list_workspace_files returns file listing", async ({ bridge }) => {
    const files = (await bridge.invoke("list_workspace_files", {
      workspaceId,
    })) as string[];

    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("package.json");
  });

  test("list_repo_directories returns directory tree", async ({ bridge }) => {
    const dirs = (await bridge.invoke("list_repo_directories", {
      repoId,
    })) as string[];

    expect(Array.isArray(dirs)).toBe(true);
    expect(dirs.some((d) => d.includes("src"))).toBe(true);
  });

  test("get_file_diff returns diff structure", async ({ bridge }) => {
    const diff = (await bridge.invoke("get_file_diff", {
      workspaceId,
      filePath: "package.json",
    })) as Record<string, unknown>;

    expect(diff).toBeTruthy();
    expect(typeof diff.path).toBe("string");
    expect(typeof diff.language).toBe("string");
  });
});
