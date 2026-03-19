import { describe, it, expect, beforeEach, vi } from "vitest";
import { useActivityLogStore, type ActivityEntry } from "./activityLogStore";
import { useWorkspaceStore } from "./workspaceStore";

vi.mock("../lib/tauri", () => ({
  getGitLog: vi.fn(),
}));

import { getGitLog } from "../lib/tauri";

type AddInput = Omit<ActivityEntry, "id" | "timestamp">;

function addSample(overrides?: Partial<AddInput>) {
  useActivityLogStore.getState().addEntry({
    type: "agent-completed",
    workspaceId: "ws-1",
    workspaceName: "my-workspace",
    title: "Agent completed",
    message: "Task finished",
    ...overrides,
  });
}

describe("activityLogStore", () => {
  beforeEach(() => {
    useActivityLogStore.setState({
      entries: [],
      commitEntries: {},
      activeFilters: new Set(),
    });
  });

  describe("addEntry", () => {
    it("adds an entry with generated id and timestamp", () => {
      addSample();
      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("Agent completed");
      expect(entries[0].id).toBeTruthy();
      expect(entries[0].timestamp).toBeGreaterThan(0);
    });

    it("prepends new entries (newest first)", () => {
      addSample({ title: "First" });
      addSample({ title: "Second" });
      const entries = useActivityLogStore.getState().entries;
      expect(entries[0].title).toBe("Second");
      expect(entries[1].title).toBe("First");
    });

    it("caps at 500 entries", () => {
      for (let i = 0; i < 510; i++) {
        addSample({ title: `e-${i}` });
      }
      expect(useActivityLogStore.getState().entries).toHaveLength(500);
      expect(useActivityLogStore.getState().entries[0].title).toBe("e-509");
    });

    it("preserves metadata field", () => {
      addSample({ metadata: { exitCode: 1 } });
      expect(useActivityLogStore.getState().entries[0].metadata).toEqual({ exitCode: 1 });
    });
  });

  describe("clearEntries", () => {
    it("removes all entries and commit entries", () => {
      addSample();
      addSample();
      useActivityLogStore.setState({
        commitEntries: { "ws-1": [{ id: "c1" } as ActivityEntry] },
      });
      useActivityLogStore.getState().clearEntries();
      expect(useActivityLogStore.getState().entries).toHaveLength(0);
      expect(useActivityLogStore.getState().commitEntries).toEqual({});
    });
  });

  describe("toggleFilter", () => {
    it("adds a filter type when not present", () => {
      useActivityLogStore.getState().toggleFilter("commit");
      expect(useActivityLogStore.getState().activeFilters.has("commit")).toBe(true);
    });

    it("removes a filter type when already present", () => {
      useActivityLogStore.getState().toggleFilter("commit");
      useActivityLogStore.getState().toggleFilter("commit");
      expect(useActivityLogStore.getState().activeFilters.has("commit")).toBe(false);
    });
  });

  describe("clearFilters", () => {
    it("clears all active filters", () => {
      useActivityLogStore.getState().toggleFilter("commit");
      useActivityLogStore.getState().toggleFilter("agent-started");
      useActivityLogStore.getState().clearFilters();
      expect(useActivityLogStore.getState().activeFilters.size).toBe(0);
    });
  });

  describe("loadCommits", () => {
    it("loads git log entries into commitEntries", async () => {
      vi.mocked(getGitLog).mockResolvedValue([
        { hash: "abc1234", fullHash: "abc1234full", message: "Fix bug", author: "tyler", timestamp: "2025-01-01T00:00:00Z" },
        { hash: "def5678", fullHash: "def5678full", message: "Add feature", author: "tyler", timestamp: "2025-01-02T00:00:00Z" },
      ]);

      await useActivityLogStore.getState().loadCommits("ws-1");
      const commits = useActivityLogStore.getState().commitEntries["ws-1"];
      expect(commits).toHaveLength(2);
      expect(commits[0].type).toBe("commit");
      expect(commits[0].title).toBe("Fix bug");
      expect(commits[0].id).toBe("commit-ws-1-abc1234");
    });

    it("handles errors gracefully", async () => {
      vi.mocked(getGitLog).mockRejectedValue(new Error("git error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await useActivityLogStore.getState().loadCommits("ws-1");
      expect(useActivityLogStore.getState().commitEntries["ws-1"]).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe("getFilteredEntries", () => {
    it("returns entries for a specific workspace", () => {
      addSample({ workspaceId: "ws-1", title: "ws1" });
      addSample({ workspaceId: "ws-2", title: "ws2" });
      const filtered = useActivityLogStore.getState().getFilteredEntries("ws-1");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe("ws1");
    });

    it("merges live entries with commit entries", () => {
      addSample({ workspaceId: "ws-1", title: "live" });
      useActivityLogStore.setState({
        commitEntries: {
          "ws-1": [{
            id: "commit-ws-1-abc",
            type: "commit",
            timestamp: Date.now() - 1000,
            workspaceId: "ws-1",
            workspaceName: "my-workspace",
            title: "commit entry",
            message: "a commit",
          }],
        },
      });
      const filtered = useActivityLogStore.getState().getFilteredEntries("ws-1");
      expect(filtered).toHaveLength(2);
    });

    it("deduplicates entries by id", () => {
      const entry: ActivityEntry = {
        id: "dup-1",
        type: "commit",
        timestamp: Date.now(),
        workspaceId: "ws-1",
        workspaceName: "test",
        title: "dup",
        message: "dup",
      };
      useActivityLogStore.setState({
        entries: [entry],
        commitEntries: { "ws-1": [entry] },
      });
      const filtered = useActivityLogStore.getState().getFilteredEntries("ws-1");
      expect(filtered).toHaveLength(1);
    });

    it("applies type filters when set", () => {
      addSample({ type: "commit", workspaceId: "ws-1" });
      addSample({ type: "agent-completed", workspaceId: "ws-1" });
      useActivityLogStore.getState().toggleFilter("commit");
      const filtered = useActivityLogStore.getState().getFilteredEntries("ws-1");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe("commit");
    });

    it("returns all types when no filters are active", () => {
      addSample({ type: "commit", workspaceId: "ws-1" });
      addSample({ type: "agent-completed", workspaceId: "ws-1" });
      const filtered = useActivityLogStore.getState().getFilteredEntries("ws-1");
      expect(filtered).toHaveLength(2);
    });

    it("falls back to activeWorkspaceId when no workspaceId provided", () => {
      useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" } as any);
      addSample({ workspaceId: "ws-1", title: "hit" });
      addSample({ workspaceId: "ws-2", title: "miss" });
      const filtered = useActivityLogStore.getState().getFilteredEntries();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe("hit");
    });

    it("returns all entries when no workspaceId and no activeWorkspaceId", () => {
      useWorkspaceStore.setState({ activeWorkspaceId: null } as any);
      addSample({ workspaceId: "ws-1", title: "a" });
      addSample({ workspaceId: "ws-2", title: "b" });
      const filtered = useActivityLogStore.getState().getFilteredEntries();
      expect(filtered).toHaveLength(2);
    });

    it("sorts by timestamp descending", () => {
      useActivityLogStore.setState({
        entries: [
          { id: "1", type: "commit", timestamp: 1000, workspaceId: "ws-1", workspaceName: "t", title: "old", message: "" },
          { id: "2", type: "commit", timestamp: 3000, workspaceId: "ws-1", workspaceName: "t", title: "new", message: "" },
          { id: "3", type: "commit", timestamp: 2000, workspaceId: "ws-1", workspaceName: "t", title: "mid", message: "" },
        ],
      });
      const filtered = useActivityLogStore.getState().getFilteredEntries("ws-1");
      expect(filtered.map((e) => e.title)).toEqual(["new", "mid", "old"]);
    });
  });
});
