import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listPrompts: vi.fn(),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  deletePrompt: vi.fn(),
}));

import { usePromptLibraryStore } from "./promptLibraryStore";
import {
  listPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from "../lib/tauri";
import type { Prompt } from "../lib/tauri";

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "prompt-1",
    name: "test-prompt",
    content: "Review {{file}} for issues",
    description: null,
    category: null,
    tags: [],
    sortOrder: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  usePromptLibraryStore.setState({
    prompts: [],
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe("promptLibraryStore - loadPrompts", () => {
  it("loads prompts and sets loading state", async () => {
    const prompts = [makePrompt()];
    vi.mocked(listPrompts).mockResolvedValue(prompts);

    await usePromptLibraryStore.getState().loadPrompts();

    expect(usePromptLibraryStore.getState().prompts).toEqual(prompts);
    expect(usePromptLibraryStore.getState().loading).toBe(false);
    expect(listPrompts).toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    vi.mocked(listPrompts).mockRejectedValue(new Error("fail"));

    await usePromptLibraryStore.getState().loadPrompts();

    expect(usePromptLibraryStore.getState().error).toBe("Error: fail");
    expect(usePromptLibraryStore.getState().loading).toBe(false);
  });
});

describe("promptLibraryStore - createPrompt", () => {
  it("creates a prompt and adds it to the list", async () => {
    const prompt = makePrompt({ id: "prompt-new" });
    vi.mocked(createPrompt).mockResolvedValue(prompt);

    const result = await usePromptLibraryStore
      .getState()
      .createPrompt({ name: "new-prompt", content: "Hello" });

    expect(result).toEqual(prompt);
    expect(usePromptLibraryStore.getState().prompts).toEqual([prompt]);
    expect(createPrompt).toHaveBeenCalledWith({
      name: "new-prompt",
      content: "Hello",
    });
  });

  it("sets error on failure", async () => {
    vi.mocked(createPrompt).mockRejectedValue(
      new Error("duplicate name"),
    );

    await expect(
      usePromptLibraryStore
        .getState()
        .createPrompt({ name: "dup", content: "x" }),
    ).rejects.toThrow("duplicate name");

    expect(usePromptLibraryStore.getState().error).toBe(
      "Error: duplicate name",
    );
  });
});

describe("promptLibraryStore - updatePrompt", () => {
  it("updates a prompt in the list", async () => {
    const original = makePrompt();
    const updated = makePrompt({ name: "renamed" });
    usePromptLibraryStore.setState({ prompts: [original] });
    vi.mocked(updatePrompt).mockResolvedValue(updated);

    await usePromptLibraryStore
      .getState()
      .updatePrompt("prompt-1", { name: "renamed" });

    expect(usePromptLibraryStore.getState().prompts[0].name).toBe(
      "renamed",
    );
    expect(updatePrompt).toHaveBeenCalledWith("prompt-1", {
      name: "renamed",
    });
  });

  it("sets error on failure", async () => {
    const original = makePrompt();
    usePromptLibraryStore.setState({ prompts: [original] });
    vi.mocked(updatePrompt).mockRejectedValue(new Error("not found"));

    await expect(
      usePromptLibraryStore
        .getState()
        .updatePrompt("prompt-1", { name: "x" }),
    ).rejects.toThrow("not found");

    expect(usePromptLibraryStore.getState().error).toBe(
      "Error: not found",
    );
  });
});

describe("promptLibraryStore - deletePrompt", () => {
  it("removes a prompt from the list", async () => {
    const p1 = makePrompt({ id: "prompt-1" });
    const p2 = makePrompt({ id: "prompt-2", name: "second" });
    usePromptLibraryStore.setState({ prompts: [p1, p2] });
    vi.mocked(deletePrompt).mockResolvedValue(undefined);

    await usePromptLibraryStore.getState().deletePrompt("prompt-1");

    expect(usePromptLibraryStore.getState().prompts).toEqual([p2]);
    expect(deletePrompt).toHaveBeenCalledWith("prompt-1");
  });

  it("sets error on failure", async () => {
    const p1 = makePrompt();
    usePromptLibraryStore.setState({ prompts: [p1] });
    vi.mocked(deletePrompt).mockRejectedValue(new Error("db error"));

    await expect(
      usePromptLibraryStore.getState().deletePrompt("prompt-1"),
    ).rejects.toThrow("db error");

    expect(usePromptLibraryStore.getState().error).toBe(
      "Error: db error",
    );
    expect(usePromptLibraryStore.getState().prompts).toEqual([p1]);
  });
});
