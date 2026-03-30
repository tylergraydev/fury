import { test, expect } from "../helpers/bridge";

const FURY_PATH = "/Users/tyler/Code/fury";

test.describe("Library CRUD (Real Backend)", () => {
  let repoId: string;

  test.beforeAll(async ({ bridge }) => {
    const repos = (await bridge.invoke("list_repositories")) as Array<Record<string, unknown>>;
    const existing = repos.find((r) => r.path === FURY_PATH);
    repoId = existing ? (existing.id as string) : ((await bridge.invoke("add_repository", { path: FURY_PATH })) as Record<string, unknown>).id as string;
  });

  test.describe("Bookmarks", () => {
    let bookmarkId: string;

    test.afterAll(async ({ bridge }) => {
      if (bookmarkId) {
        await bridge.invoke("delete_bookmark", { bookmarkId }).catch(() => {});
      }
    });

    test("create_bookmark returns bookmark with correct fields", async ({ bridge }) => {
      const bm = (await bridge.invoke("create_bookmark", {
        request: {
          repoId,
          filePath: "package.json",
          lineNumber: 1,
          note: "Integration test bookmark",
          color: "blue",
        },
      })) as Record<string, unknown>;

      expect(bm.id).toBeTruthy();
      expect(bm.filePath).toBe("package.json");
      expect(bm.lineNumber).toBe(1);
      expect(bm.note).toBe("Integration test bookmark");
      bookmarkId = bm.id as string;
    });

    test("list_bookmarks includes the created bookmark", async ({ bridge }) => {
      const bookmarks = (await bridge.invoke("list_bookmarks", { repoId })) as Array<Record<string, unknown>>;
      const found = bookmarks.find((b) => b.id === bookmarkId);
      expect(found).toBeTruthy();
    });

    test("delete_bookmark removes it", async ({ bridge }) => {
      await bridge.invoke("delete_bookmark", { bookmarkId });
      const bookmarks = (await bridge.invoke("list_bookmarks", { repoId })) as Array<Record<string, unknown>>;
      const found = bookmarks.find((b) => b.id === bookmarkId);
      expect(found).toBeUndefined();
      bookmarkId = "";
    });
  });

  test.describe("Prompts", () => {
    let promptId: string;

    test.afterAll(async ({ bridge }) => {
      if (promptId) {
        await bridge.invoke("delete_prompt", { promptId }).catch(() => {});
      }
    });

    test("create and list prompt", async ({ bridge }) => {
      const prompt = (await bridge.invoke("create_prompt", {
        request: {
          name: "Integration Test Prompt",
          content: "Review {{file}} for bugs",
          description: "Test prompt",
          category: "Testing",
          tags: ["test"],
        },
      })) as Record<string, unknown>;

      expect(prompt.id).toBeTruthy();
      expect(prompt.name).toBe("Integration Test Prompt");
      promptId = prompt.id as string;

      const prompts = (await bridge.invoke("list_prompts")) as Array<Record<string, unknown>>;
      expect(prompts.find((p) => p.id === promptId)).toBeTruthy();
    });

    test("delete_prompt removes it", async ({ bridge }) => {
      await bridge.invoke("delete_prompt", { promptId });
      const prompts = (await bridge.invoke("list_prompts")) as Array<Record<string, unknown>>;
      expect(prompts.find((p) => p.id === promptId)).toBeUndefined();
      promptId = "";
    });
  });

  test.describe("Snippets", () => {
    let snippetId: string;

    test.afterAll(async ({ bridge }) => {
      if (snippetId) {
        await bridge.invoke("delete_snippet", { snippetId }).catch(() => {});
      }
    });

    test("create and list snippet", async ({ bridge }) => {
      const snippet = (await bridge.invoke("create_snippet", {
        request: {
          title: "Integration Test Snippet",
          content: "console.log('test');",
          language: "javascript",
          description: "Test snippet",
          tags: ["test"],
        },
      })) as Record<string, unknown>;

      expect(snippet.id).toBeTruthy();
      expect(snippet.title).toBe("Integration Test Snippet");
      snippetId = snippet.id as string;

      const snippets = (await bridge.invoke("list_snippets")) as Array<Record<string, unknown>>;
      expect(snippets.find((s) => s.id === snippetId)).toBeTruthy();
    });

    test("delete_snippet removes it", async ({ bridge }) => {
      await bridge.invoke("delete_snippet", { snippetId });
      const snippets = (await bridge.invoke("list_snippets")) as Array<Record<string, unknown>>;
      expect(snippets.find((s) => s.id === snippetId)).toBeUndefined();
      snippetId = "";
    });
  });
});
