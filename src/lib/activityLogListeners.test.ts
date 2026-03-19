import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./tauri", () => ({
  sendMessage: vi.fn(),
  stopAgent: vi.fn(),
  getAgentStatus: vi.fn(),
  getGitLog: vi.fn(),
}));

import { useAgentStore } from "../stores/agentStore";
import { usePrStore } from "../stores/prStore";
import { useScriptStore } from "../stores/scriptStore";
import { useMergeStore } from "../stores/mergeStore";
import { useChatStore } from "../stores/chatStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useActivityLogStore } from "../stores/activityLogStore";
import { initActivityLogListeners } from "./activityLogListeners";

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  usePrStore.setState({ prInfo: {}, reviews: {}, reviewComments: {}, workflowRuns: {}, loading: {}, error: {}, subscriptions: {}, pollIntervals: {}, workflowLoading: {}, reviewsLoading: {} });
  useScriptStore.setState({ output: {}, running: {}, exitCodes: {}, subscriptions: {} });
  useMergeStore.setState({ conflictedFiles: {} });
  useChatStore.setState({ messages: {}, streamingText: {}, planApproval: {}, permissionRequest: {}, subscriptions: {}, sessionStats: {} });
  useActivityLogStore.setState({ entries: [], commitEntries: {}, activeFilters: new Set() });
  useWorkspaceStore.setState({
    workspaces: [{ id: "ws-1", name: "test-workspace", repoId: "repo-1", branch: "main", status: "Active", createdAt: new Date().toISOString(), pinned: false }] as any[],
  });
});

describe("activityLogListeners", () => {
  it("returns a cleanup function", () => {
    const cleanup = initActivityLogListeners();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  describe("agent status changes", () => {
    it("fires agent-started when Idle -> Running", () => {
      const cleanup = initActivityLogListeners();

      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("agent-started");
      expect(entries[0].title).toBe("Agent started");
      cleanup();
    });

    it("fires agent-completed when Running -> Idle", () => {
      const cleanup = initActivityLogListeners();

      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("agent-completed");
      cleanup();
    });

    it("does not fire for Idle -> Idle", () => {
      const cleanup = initActivityLogListeners();

      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });

      expect(useActivityLogStore.getState().entries).toHaveLength(0);
      cleanup();
    });
  });

  describe("chat messages", () => {
    it("fires chat-user for user messages", () => {
      const cleanup = initActivityLogListeners();

      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "user", content: [{ type: "text", text: "hello world" }], timestamp: Date.now() },
          ],
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("chat-user");
      expect(entries[0].title).toBe("Message sent");
      expect(entries[0].message).toBe("hello world");
      cleanup();
    });

    it("fires chat-agent for assistant messages", () => {
      const cleanup = initActivityLogListeners();

      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "assistant", content: [{ type: "text", text: "I can help" }], timestamp: Date.now() },
          ],
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("chat-agent");
      expect(entries[0].title).toBe("Agent responded");
      cleanup();
    });

    it("skips system messages", () => {
      const cleanup = initActivityLogListeners();

      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "system", content: [{ type: "text", text: "system msg" }], timestamp: Date.now() },
          ],
        },
      });

      expect(useActivityLogStore.getState().entries).toHaveLength(0);
      cleanup();
    });

    it("truncates long messages", () => {
      const cleanup = initActivityLogListeners();

      const longText = "x".repeat(200);
      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "user", content: [{ type: "text", text: longText }], timestamp: Date.now() },
          ],
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries[0].message.length).toBeLessThanOrEqual(80);
      expect(entries[0].message).toContain("...");
      cleanup();
    });

    it("shows (tool use) for messages without text content", () => {
      const cleanup = initActivityLogListeners();

      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "assistant", content: [{ type: "toolUse", id: "t1", name: "read", input: {} }], timestamp: Date.now() },
          ],
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries[0].message).toBe("(tool use)");
      cleanup();
    });

    it("only processes new messages", () => {
      const cleanup = initActivityLogListeners();

      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "user", content: [{ type: "text", text: "first" }], timestamp: Date.now() },
          ],
        },
      });

      // Clear entries, add more messages
      useActivityLogStore.setState({ entries: [] });

      useChatStore.setState({
        messages: {
          "ws-1": [
            { id: "m1", role: "user", content: [{ type: "text", text: "first" }], timestamp: Date.now() },
            { id: "m2", role: "assistant", content: [{ type: "text", text: "second" }], timestamp: Date.now() },
          ],
        },
      });

      // Should only have the new message
      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe("second");
      cleanup();
    });
  });

  describe("script runs", () => {
    it("fires script-started when script begins running", () => {
      const cleanup = initActivityLogListeners();

      useScriptStore.setState({
        running: { "ws-1:run": true },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("script-started");
      expect(entries[0].title).toBe("Run started");
      cleanup();
    });

    it("fires script-succeeded for exit code 0", () => {
      const cleanup = initActivityLogListeners();

      useScriptStore.setState({
        exitCodes: { "ws-1:run": 0 },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("script-succeeded");
      cleanup();
    });

    it("fires script-failed for non-zero exit code", () => {
      const cleanup = initActivityLogListeners();

      useScriptStore.setState({
        exitCodes: { "ws-1:run": 1 },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("script-failed");
      expect(entries[0].message).toContain("code 1");
      cleanup();
    });

    it("does not fire for null exit code", () => {
      const cleanup = initActivityLogListeners();

      useScriptStore.setState({
        exitCodes: { "ws-1:run": null },
      });

      expect(useActivityLogStore.getState().entries).toHaveLength(0);
      cleanup();
    });
  });

  describe("PR events", () => {
    it("fires pr-merged when state transitions to MERGED", () => {
      const cleanup = initActivityLogListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "Test PR",
            state: "OPEN", checks: [],
          } as any,
        },
      });

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "Test PR",
            state: "MERGED", checks: [],
          } as any,
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("pr-merged");
      expect(entries[0].message).toContain("Test PR");
      cleanup();
    });

    it("fires pr-checks-pass when checks transition pending to pass", () => {
      const cleanup = initActivityLogListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "IN_PROGRESS", conclusion: null }],
          } as any,
        },
      });

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "COMPLETED", conclusion: "SUCCESS" }],
          } as any,
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("pr-checks-pass");
      cleanup();
    });

    it("fires pr-checks-fail when checks have failures", () => {
      const cleanup = initActivityLogListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "IN_PROGRESS", conclusion: null }],
          } as any,
        },
      });

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE" }],
          } as any,
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("pr-checks-fail");
      cleanup();
    });

    it("skips null prInfo entries", () => {
      const cleanup = initActivityLogListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": null as any,
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(0);
      cleanup();
    });

    it("fires pr-checks-pass with correct message for all passing", () => {
      const cleanup = initActivityLogListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "PR",
            state: "OPEN",
            checks: [
              { name: "CI", status: "IN_PROGRESS", conclusion: null },
              { name: "Lint", status: "IN_PROGRESS", conclusion: null },
            ],
          } as any,
        },
      });

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1", prNumber: 1, title: "PR",
            state: "OPEN",
            checks: [
              { name: "CI", status: "COMPLETED", conclusion: "SUCCESS" },
              { name: "Lint", status: "COMPLETED", conclusion: "SUCCESS" },
            ],
          } as any,
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("pr-checks-pass");
      expect(entries[0].message).toContain("All 2 checks passed");
      cleanup();
    });
  });

  describe("merge conflicts", () => {
    it("fires merge-conflict-detected when conflicts appear", () => {
      const cleanup = initActivityLogListeners();

      useMergeStore.setState({
        conflictedFiles: {
          "ws-1": [{ path: "file.ts", status: "conflicted" }] as any[],
        },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("merge-conflict-detected");
      expect(entries[0].message).toContain("1 conflicted");
      cleanup();
    });

    it("fires merge-conflict-resolved when conflicts are cleared", () => {
      const cleanup = initActivityLogListeners();

      useMergeStore.setState({
        conflictedFiles: {
          "ws-1": [{ path: "file.ts", status: "conflicted" }] as any[],
        },
      });

      useActivityLogStore.setState({ entries: [] });

      useMergeStore.setState({
        conflictedFiles: { "ws-1": [] },
      });

      const entries = useActivityLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("merge-conflict-resolved");
      cleanup();
    });
  });

  describe("cleanup", () => {
    it("stops firing entries after cleanup", () => {
      const cleanup = initActivityLogListeners();
      cleanup();

      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });

      expect(useActivityLogStore.getState().entries).toHaveLength(0);
    });
  });
});
