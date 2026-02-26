import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./tauri", () => ({
  sendMessage: vi.fn(),
  stopAgent: vi.fn(),
  getAgentStatus: vi.fn(),
}));

import { useAgentStore } from "../stores/agentStore";
import { usePrStore } from "../stores/prStore";
import { useScriptStore } from "../stores/scriptStore";
import { useMergeStore } from "../stores/mergeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useNotificationStore } from "../stores/notificationStore";
import { initNotificationListeners } from "./notificationListeners";

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
  usePrStore.setState({ prInfo: {}, reviews: {}, reviewComments: {}, workflowRuns: {}, loading: {}, error: {}, subscriptions: {}, pollIntervals: {}, workflowLoading: {}, reviewsLoading: {} });
  useScriptStore.setState({ output: {}, running: {}, exitCodes: {}, subscriptions: {} });
  useMergeStore.setState({ conflictedFiles: {} });
  useNotificationStore.setState({ notifications: [], unreadCount: 0, panelOpen: false });
  useWorkspaceStore.setState({
    workspaces: [{ id: "ws-1", name: "test-workspace", repoId: "repo-1", branch: "main", status: "Active", createdAt: new Date().toISOString(), pinned: false }] as any[],
  });
});

describe("notificationListeners", () => {
  it("returns a cleanup function", () => {
    const cleanup = initNotificationListeners();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  describe("agent completion", () => {
    it("fires notification when agent transitions Running -> Idle", () => {
      const cleanup = initNotificationListeners();

      // Set initial Running state
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      });

      // Transition to Idle
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("agent-complete");
      expect(notifications[0].title).toBe("Agent completed");
      expect(notifications[0].workspaceName).toBe("test-workspace");
      cleanup();
    });

    it("does not fire for Idle -> Idle", () => {
      const cleanup = initNotificationListeners();

      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
      cleanup();
    });

    it("does not fire for Idle -> Running", () => {
      const cleanup = initNotificationListeners();

      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
      cleanup();
    });
  });

  describe("PR checks", () => {
    it("fires notification when checks transition from pending to pass", () => {
      const cleanup = initNotificationListeners();

      // Pending state
      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1",
            prNumber: 1,
            title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "IN_PROGRESS", conclusion: null }],
          } as any,
        },
      });

      // Completed state
      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1",
            prNumber: 1,
            title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "COMPLETED", conclusion: "SUCCESS" }],
          } as any,
        },
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("pr-checks-pass");
      cleanup();
    });

    it("fires notification when checks transition from pending to fail", () => {
      const cleanup = initNotificationListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1",
            prNumber: 1,
            title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "IN_PROGRESS", conclusion: null }],
          } as any,
        },
      });

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1",
            prNumber: 1,
            title: "Test PR",
            state: "OPEN",
            checks: [{ name: "CI", status: "COMPLETED", conclusion: "FAILURE" }],
          } as any,
        },
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("pr-checks-fail");
      cleanup();
    });
  });

  describe("PR merged", () => {
    it("fires notification when PR state transitions to MERGED", () => {
      const cleanup = initNotificationListeners();

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1",
            prNumber: 1,
            title: "Test PR",
            state: "OPEN",
            checks: [],
          } as any,
        },
      });

      usePrStore.setState({
        prInfo: {
          "ws-1": {
            workspaceId: "ws-1",
            prNumber: 1,
            title: "Test PR",
            state: "MERGED",
            checks: [],
          } as any,
        },
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("pr-merged");
      expect(notifications[0].message).toContain("Test PR");
      cleanup();
    });
  });

  describe("script error", () => {
    it("fires notification when script exits with non-zero code", () => {
      const cleanup = initNotificationListeners();

      useScriptStore.setState({
        exitCodes: { "ws-1:run": 1 },
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("build-error");
      expect(notifications[0].message).toContain("code 1");
      cleanup();
    });

    it("does not fire for exit code 0", () => {
      const cleanup = initNotificationListeners();

      useScriptStore.setState({
        exitCodes: { "ws-1:run": 0 },
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
      cleanup();
    });

    it("does not fire for null exit code", () => {
      const cleanup = initNotificationListeners();

      useScriptStore.setState({
        exitCodes: { "ws-1:run": null },
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
      cleanup();
    });
  });

  describe("merge conflicts", () => {
    it("fires notification when conflicts appear", () => {
      const cleanup = initNotificationListeners();

      useMergeStore.setState({
        conflictedFiles: {
          "ws-1": [{ path: "file.ts", status: "conflicted" }] as any[],
        },
      });

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("merge-conflict");
      expect(notifications[0].message).toContain("1 conflicted");
      cleanup();
    });

    it("does not fire when conflicts are resolved (count goes to 0)", () => {
      const cleanup = initNotificationListeners();

      // First, conflicts appear
      useMergeStore.setState({
        conflictedFiles: {
          "ws-1": [{ path: "file.ts", status: "conflicted" }] as any[],
        },
      });

      // Clear notifications to test fresh
      useNotificationStore.setState({ notifications: [], unreadCount: 0 });

      // Conflicts resolved
      useMergeStore.setState({
        conflictedFiles: { "ws-1": [] },
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
      cleanup();
    });
  });

  describe("cleanup", () => {
    it("stops firing notifications after cleanup", () => {
      const cleanup = initNotificationListeners();
      cleanup();

      // Changes after cleanup should not trigger notifications
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      });
      useAgentStore.setState({
        agents: { "ws-1": { workspaceId: "ws-1", status: "Idle" } as any },
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });
  });
});
