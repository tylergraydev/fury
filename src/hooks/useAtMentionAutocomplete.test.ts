import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAtMentionAutocomplete } from "./useAtMentionAutocomplete";
import { useFileTreeStore } from "../stores/fileTreeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useTodoStore } from "../stores/todoStore";
import type React from "react";

vi.mock("../lib/tauri/diff", () => ({
  getDiff: vi.fn().mockResolvedValue({
    files: [{ path: "src/app.ts", status: "modified", additions: 5, deletions: 2 }],
    totalAdditions: 5,
    totalDeletions: 2,
  }),
  getRepoDiff: vi.fn().mockResolvedValue({
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  }),
}));

vi.mock("../lib/tauri/repository", () => ({
  listRepoDirectories: vi.fn().mockResolvedValue(["src", "tests", "docs"]),
  getGitLog: vi.fn().mockResolvedValue([
    { hash: "abc1234", fullHash: "abc1234567890", message: "Initial commit", author: "Test", timestamp: "2024-01-01" },
  ]),
  listRepositories: vi.fn().mockResolvedValue([]),
  listBranches: vi.fn().mockResolvedValue([]),
  listRepoFiles: vi.fn().mockResolvedValue([]),
}));

const mockTextareaRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>;

beforeEach(() => {
  useFileTreeStore.setState({
    files: { "ws-1": ["src/main.ts", "src/utils/helper.ts", "README.md"] },
    expandedDirs: {},
    loading: {},
    error: {},
  });
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", repoId: "repo-1", name: "test", branch: "feature-x", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "", archivedAt: null },
    ],
  });
  useRepositoryStore.setState({
    repositories: [
      { id: "repo-1", name: "test-repo", path: "/tmp/test", defaultBranch: "main", provider: "git_hub", remoteUrl: null },
    ],
  });
  useTodoStore.setState({
    todos: {
      "ws-1": [
        { id: "t1", workspaceId: "ws-1", text: "Fix bug", completed: false, sortOrder: 0 },
      ],
    },
  });
});

function renderAtMention(overrides?: { contextId?: string; contextType?: "workspace" | "repo"; workspaceId?: string | undefined }) {
  let currentText = "";
  const getText = () => currentText;
  const setText = (v: string) => { currentText = v; };

  const wsId = "workspaceId" in (overrides ?? {}) ? overrides!.workspaceId : "ws-1";

  const result = renderHook(() =>
    useAtMentionAutocomplete(
      overrides?.contextId ?? "ws-1",
      overrides?.contextType ?? "workspace",
      wsId,
      getText,
      setText,
      mockTextareaRef,
    ),
  );

  return { ...result, getText: () => currentText, setTextDirect: (v: string) => { currentText = v; } };
}

describe("useAtMentionAutocomplete", () => {
  describe("category navigation", () => {
    it("shows categories when no active category and no filter", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));

      expect(result.current.showAtMenu).toBe(true);
      expect(result.current.activeCategory).toBeNull();
      const labels = result.current.menuItems.map((i) => i.label);
      expect(labels).toContain("Files");
      expect(labels).toContain("Folders");
      expect(labels).toContain("Git");
      expect(labels).toContain("Todos");
    });

    it("filters categories by text after @", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@fi"));

      const labels = result.current.menuItems.map((i) => i.label);
      expect(labels).toContain("Files");
      expect(labels).not.toContain("Git");
    });

    it("smart-shortcuts to files when filter contains /", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@src/"));

      expect(result.current.activeCategory).toBeNull();
      const labels = result.current.menuItems.map((i) => i.label);
      expect(labels).toContain("main.ts");
      expect(labels).toContain("helper.ts");
      // These should NOT be categories
      expect(result.current.menuItems[0].isCategory).toBeFalsy();
    });

    it("drills into category on selectItem", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));

      const filesCategory = result.current.menuItems.find((i) => i.label === "Files");
      expect(filesCategory?.isCategory).toBe(true);

      act(() => result.current.selectItem(filesCategory!));

      expect(result.current.activeCategory).toBe("files");
      const labels = result.current.menuItems.map((i) => i.label);
      expect(labels).toContain("main.ts");
    });
  });

  describe("file items", () => {
    it("shows file items when in files category", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));

      const filesCategory = result.current.menuItems.find((i) => i.label === "Files");
      act(() => result.current.selectItem(filesCategory!));

      expect(result.current.menuItems.length).toBe(3);
      expect(result.current.menuItems[0].value).toBe("src/main.ts");
    });

    it("limits file items to 10", () => {
      useFileTreeStore.setState({
        files: { "ws-1": Array.from({ length: 20 }, (_, i) => `file${i}.ts`) },
        expandedDirs: {},
        loading: {},
        error: {},
      });
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));
      const filesCategory = result.current.menuItems.find((i) => i.label === "Files");
      act(() => result.current.selectItem(filesCategory!));

      expect(result.current.menuItems.length).toBe(10);
    });
  });

  describe("git items", () => {
    it("shows git sub-items when drilled into Git category", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));

      const gitCategory = result.current.menuItems.find((i) => i.label === "Git");
      act(() => result.current.selectItem(gitCategory!));

      const labels = result.current.menuItems.map((i) => i.label);
      expect(labels).toContain("Diff vs main");
      expect(labels).toContain("Recent commits");
      expect(labels).toContain("Current branch");
    });
  });

  describe("keyboard navigation", () => {
    it("returns false when menu is hidden", () => {
      const { result } = renderAtMention();
      const handled = result.current.handleAtKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
      expect(handled).toBe(false);
    });

    it("Escape goes back to categories when drilled in", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));

      const filesCategory = result.current.menuItems.find((i) => i.label === "Files");
      act(() => result.current.selectItem(filesCategory!));
      expect(result.current.activeCategory).toBe("files");

      act(() => {
        result.current.handleAtKeyDown({
          key: "Escape",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.activeCategory).toBeNull();
      expect(result.current.showAtMenu).toBe(true);
    });

    it("Escape closes menu when at category level", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@"));

      act(() => {
        result.current.handleAtKeyDown({
          key: "Escape",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(result.current.showAtMenu).toBe(false);
    });
  });

  describe("handleAtInput", () => {
    it("opens menu on valid @ trigger", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("hello @"));

      expect(result.current.showAtMenu).toBe(true);
    });

    it("does not open when @ is preceded by a letter", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("email@"));

      expect(result.current.showAtMenu).toBe(false);
    });

    it("closes menu when no @ present", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("hello"));

      expect(result.current.showAtMenu).toBe(false);
    });

    it("closes menu when bracket mention is completed", () => {
      const { result } = renderAtMention();
      act(() => result.current.handleAtInput("@[Git: Diff vs main]"));

      expect(result.current.showAtMenu).toBe(false);
    });
  });

  describe("resolveAllMentions", () => {
    it("resolves @todos in workspace context", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions("Check @todos please");

      expect(resolved).toContain("Fix bug");
      expect(resolved).not.toContain("@todos");
    });

    it("does not resolve @todos in repo context", async () => {
      const { result } = renderAtMention({ contextId: "repo-1", contextType: "repo", workspaceId: undefined });
      const resolved = await result.current.resolveAllMentions("Check @todos please");

      expect(resolved).toContain("@todos");
    });

    it("resolves @[Git: Diff vs main]", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions("Here is @[Git: Diff vs main]");

      expect(resolved).toContain("<git-diff>");
      expect(resolved).toContain("src/app.ts");
      expect(resolved).not.toContain("@[Git: Diff vs main]");
    });

    it("resolves @[Git: Recent commits]", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions("Show @[Git: Recent commits]");

      expect(resolved).toContain("<git-log>");
      expect(resolved).toContain("abc1234");
      expect(resolved).not.toContain("@[Git: Recent commits]");
    });

    it("resolves @[Git: Current branch]", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions("On @[Git: Current branch]");

      expect(resolved).toContain("Current branch: feature-x");
    });

    it("resolves @[Folder: src]", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions("Look at @[Folder: src]");

      expect(resolved).toContain("[Attached folder: src]");
    });

    it("resolves @[Recent Changes]", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions("Show @[Recent Changes]");

      expect(resolved).toContain("<git-diff>");
    });

    it("resolves multiple mentions concurrently", async () => {
      const { result } = renderAtMention();
      const resolved = await result.current.resolveAllMentions(
        "Branch: @[Git: Current branch], diff: @[Git: Diff vs main]",
      );

      expect(resolved).toContain("Current branch: feature-x");
      expect(resolved).toContain("<git-diff>");
    });

    it("returns message unchanged when no mentions present", async () => {
      const { result } = renderAtMention();
      const msg = "Just a plain message";
      const resolved = await result.current.resolveAllMentions(msg);

      expect(resolved).toBe(msg);
    });
  });
});
