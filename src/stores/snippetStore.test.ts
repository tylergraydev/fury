import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listSnippets: vi.fn(),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
}));

import { useSnippetStore } from "./snippetStore";
import {
  listSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
} from "../lib/tauri";
import type { Snippet } from "../lib/tauri";

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: "snippet-1",
    title: "fetch helper",
    content: "async function fetchJSON(url: string) { ... }",
    language: "typescript",
    description: null,
    tags: [],
    source: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  useSnippetStore.setState({
    snippets: [],
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe("snippetStore - loadSnippets", () => {
  it("loads snippets and sets loading state", async () => {
    const snippets = [makeSnippet()];
    vi.mocked(listSnippets).mockResolvedValue(snippets);

    await useSnippetStore.getState().loadSnippets();

    expect(useSnippetStore.getState().snippets).toEqual(snippets);
    expect(useSnippetStore.getState().loading).toBe(false);
    expect(listSnippets).toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    vi.mocked(listSnippets).mockRejectedValue(new Error("fail"));

    await useSnippetStore.getState().loadSnippets();

    expect(useSnippetStore.getState().error).toBe("Error: fail");
    expect(useSnippetStore.getState().loading).toBe(false);
  });
});

describe("snippetStore - createSnippet", () => {
  it("creates a snippet and adds it to the list", async () => {
    const snippet = makeSnippet({ id: "snippet-new" });
    vi.mocked(createSnippet).mockResolvedValue(snippet);

    const result = await useSnippetStore
      .getState()
      .createSnippet({ title: "new snippet", content: "code here" });

    expect(result).toEqual(snippet);
    expect(useSnippetStore.getState().snippets).toEqual([snippet]);
    expect(createSnippet).toHaveBeenCalledWith({
      title: "new snippet",
      content: "code here",
    });
  });

  it("sets error on failure", async () => {
    vi.mocked(createSnippet).mockRejectedValue(new Error("db error"));

    await expect(
      useSnippetStore
        .getState()
        .createSnippet({ title: "x", content: "y" }),
    ).rejects.toThrow("db error");

    expect(useSnippetStore.getState().error).toBe("Error: db error");
  });
});

describe("snippetStore - updateSnippet", () => {
  it("updates a snippet in the list", async () => {
    const original = makeSnippet();
    const updated = makeSnippet({ title: "renamed" });
    useSnippetStore.setState({ snippets: [original] });
    vi.mocked(updateSnippet).mockResolvedValue(updated);

    await useSnippetStore
      .getState()
      .updateSnippet("snippet-1", { title: "renamed" });

    expect(useSnippetStore.getState().snippets[0].title).toBe("renamed");
    expect(updateSnippet).toHaveBeenCalledWith("snippet-1", {
      title: "renamed",
    });
  });

  it("sets error on failure", async () => {
    const original = makeSnippet();
    useSnippetStore.setState({ snippets: [original] });
    vi.mocked(updateSnippet).mockRejectedValue(new Error("not found"));

    await expect(
      useSnippetStore
        .getState()
        .updateSnippet("snippet-1", { title: "x" }),
    ).rejects.toThrow("not found");

    expect(useSnippetStore.getState().error).toBe("Error: not found");
  });
});

describe("snippetStore - deleteSnippet", () => {
  it("removes a snippet from the list", async () => {
    const s1 = makeSnippet({ id: "snippet-1" });
    const s2 = makeSnippet({ id: "snippet-2", title: "second" });
    useSnippetStore.setState({ snippets: [s1, s2] });
    vi.mocked(deleteSnippet).mockResolvedValue(undefined);

    await useSnippetStore.getState().deleteSnippet("snippet-1");

    expect(useSnippetStore.getState().snippets).toEqual([s2]);
    expect(deleteSnippet).toHaveBeenCalledWith("snippet-1");
  });

  it("sets error on failure", async () => {
    const s1 = makeSnippet();
    useSnippetStore.setState({ snippets: [s1] });
    vi.mocked(deleteSnippet).mockRejectedValue(new Error("db error"));

    await expect(
      useSnippetStore.getState().deleteSnippet("snippet-1"),
    ).rejects.toThrow("db error");

    expect(useSnippetStore.getState().error).toBe("Error: db error");
    expect(useSnippetStore.getState().snippets).toEqual([s1]);
  });
});
