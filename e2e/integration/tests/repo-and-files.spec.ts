import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Repository & File Operations (Real Backend)", () => {
  let repoId: string;
  let weAddedRepo = false;

  test.beforeAll(async ({ bridge }) => {
    // Check if repo already exists (user may have it open in the app)
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
      weAddedRepo = true;
    }
  });

  test.afterAll(async ({ bridge }) => {
    // Only remove if we added it (don't remove user's existing repo)
    if (weAddedRepo && repoId) {
      await bridge
        .invoke("remove_repository", { repoId })
        .catch(() => {});
    }
  });

  test("repo has valid id and correct name", async () => {
    expect(repoId).toBeTruthy();
    expect(typeof repoId).toBe("string");
  });

  test("list_repositories includes the fury repo", async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<
      Record<string, unknown>
    >;

    expect(Array.isArray(repos)).toBe(true);
    const fury = repos.find((r) => r.id === repoId);
    expect(fury).toBeTruthy();
    expect(fury!.name).toBe("fury");
    expect(fury!.path).toBe(FURY_PATH);
  });

  test("read_repo_file returns real package.json content", async ({
    bridge,
  }) => {
    const result = (await bridge.invoke("read_repo_file", {
      repoId,
      filePath: "package.json",
    })) as Record<string, unknown>;

    expect(result).toBeTruthy();
    const content = result.content as string;
    expect(content).toContain('"name"');
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe("fury");
  });

  test("list_repo_files returns real directory listing", async ({
    bridge,
  }) => {
    const files = (await bridge.invoke("list_repo_files", {
      repoId,
    })) as string[];

    expect(Array.isArray(files)).toBe(true);
    expect(files).toContain("package.json");
    expect(files).toContain("tsconfig.json");
  });
});
