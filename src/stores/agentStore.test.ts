import { describe, it, expect, beforeEach, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";

vi.mock("../lib/tauri", () => ({
  sendMessage: vi.fn(),
  sendFollowupMessage: vi.fn(),
  stopAgent: vi.fn(),
  getAgentStatus: vi.fn(),
}));

import { useAgentStore } from "./agentStore";
import {
  sendMessage as sendMessageCmd,
  sendFollowupMessage as sendFollowupCmd,
  stopAgent as stopAgentCmd,
  getAgentStatus,
} from "../lib/tauri";

const mockListen = vi.mocked(listen);

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {}, needsAttention: {} });
  vi.clearAllMocks();
});

describe("agentStore - getStatus", () => {
  it("returns Idle when no agent info exists", () => {
    expect(useAgentStore.getState().getStatus("ws-1")).toBe("Idle");
  });

  it("returns stored status for known workspace", () => {
    useAgentStore.setState({
      agents: {
        "ws-1": {
          workspaceId: "ws-1",
          sessionId: null,
          status: "Running",
          startedAt: null,
        } as any,
      },
    });
    expect(useAgentStore.getState().getStatus("ws-1")).toBe("Running");
  });
});

describe("agentStore - subscribe", () => {
  it("registers a listener for agent-status events", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValueOnce(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");
    expect(mockListen).toHaveBeenCalledWith(
      "agent-status:ws-1",
      expect.any(Function),
    );
    expect(useAgentStore.getState().subscriptions["ws-1"]).toBe(mockUnlisten);
  });

  it("does not double-subscribe", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");
    await useAgentStore.getState().subscribe("ws-1");
    expect(mockListen).toHaveBeenCalledTimes(1);
  });

  it("updates agent status from event callback", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValueOnce(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");
    const callback = mockListen.mock.calls[0][1] as (event: any) => void;
    callback({ payload: { status: "Running" } });
    expect(useAgentStore.getState().agents["ws-1"].status).toBe("Running");
  });
});

describe("agentStore - unsubscribe", () => {
  it("calls unlisten and removes subscription", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValueOnce(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");
    useAgentStore.getState().unsubscribe("ws-1");
    expect(mockUnlisten).toHaveBeenCalledOnce();
    expect(useAgentStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });

  it("does nothing for non-existent workspace", () => {
    useAgentStore.getState().unsubscribe("non-existent");
    expect(useAgentStore.getState().subscriptions).toEqual({});
  });
});

describe("agentStore - sendMessage", () => {
  it("sends workspace message", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "hello");
    expect(sendMessageCmd).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      message: "hello",
      disableThinking: undefined,
      disablePlanMode: undefined,
    });
  });

  it("sends repo message when contextType is repo", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("repo-1", "hello", "repo");
    expect(sendMessageCmd).toHaveBeenCalledWith({
      repoId: "repo-1",
      message: "hello",
      disableThinking: undefined,
      disablePlanMode: undefined,
    });
  });

  it("sends with disableThinking and disablePlanMode flags", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "hello", "workspace", "opus", true, true);
    expect(sendMessageCmd).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      message: "hello",
      model: "opus",
      disableThinking: true,
      disablePlanMode: true,
    });
  });

  it("sends followup when agent is already Running", async () => {
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
    });
    vi.mocked(sendFollowupCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "followup");
    expect(sendFollowupCmd).toHaveBeenCalledWith("ws-1", "followup");
    expect(sendMessageCmd).not.toHaveBeenCalled();
  });

  it("re-throws errors", async () => {
    vi.mocked(sendMessageCmd).mockRejectedValue(new Error("send fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      useAgentStore.getState().sendMessage("ws-1", "hello"),
    ).rejects.toThrow("send fail");
  });
});

describe("agentStore - stopAgent", () => {
  it("calls Tauri stop command", async () => {
    vi.mocked(stopAgentCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().stopAgent("ws-1");
    expect(stopAgentCmd).toHaveBeenCalledWith("ws-1");
  });

  it("re-throws errors from stopAgent", async () => {
    vi.mocked(stopAgentCmd).mockRejectedValue(new Error("stop fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      useAgentStore.getState().stopAgent("ws-1"),
    ).rejects.toThrow("stop fail");
  });
});

describe("agentStore - broadcastMessage", () => {
  it("sends messages to all workspace IDs", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    const result = await useAgentStore.getState().broadcastMessage(
      ["ws-1", "ws-2"],
      "build the feature",
    );
    expect(sendMessageCmd).toHaveBeenCalledTimes(2);
    expect(sendMessageCmd).toHaveBeenCalledWith({ workspaceId: "ws-1", message: "build the feature" });
    expect(sendMessageCmd).toHaveBeenCalledWith({ workspaceId: "ws-2", message: "build the feature" });
    expect(result.succeeded).toEqual(["ws-1", "ws-2"]);
    expect(result.failed).toEqual([]);
  });

  it("collects failures for rejected sends", async () => {
    vi.mocked(sendMessageCmd)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Agent is already processing a message"));
    const result = await useAgentStore.getState().broadcastMessage(
      ["ws-1", "ws-2"],
      "hello",
    );
    expect(result.succeeded).toEqual(["ws-1"]);
    expect(result.failed).toEqual([
      { workspaceId: "ws-2", error: "Error: Agent is already processing a message" },
    ]);
  });

  it("passes model when provided", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().broadcastMessage(["ws-1"], "hello", "opus");
    expect(sendMessageCmd).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      message: "hello",
      model: "opus",
    });
  });
});

describe("agentStore - stopAllAgents", () => {
  it("calls stopAgent for all workspace IDs", async () => {
    vi.mocked(stopAgentCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().stopAllAgents(["ws-1", "ws-2"]);
    expect(stopAgentCmd).toHaveBeenCalledTimes(2);
    expect(stopAgentCmd).toHaveBeenCalledWith("ws-1");
    expect(stopAgentCmd).toHaveBeenCalledWith("ws-2");
  });

  it("does not throw when some stop calls fail", async () => {
    vi.mocked(stopAgentCmd)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("already stopped"));
    await useAgentStore.getState().stopAllAgents(["ws-1", "ws-2"]);
    // Should not throw
  });
});

describe("agentStore - fetchStatus", () => {
  it("fetches and stores agent info", async () => {
    const info = {
      workspaceId: "ws-1",
      sessionId: "s1",
      status: "Running",
      startedAt: null,
    };
    vi.mocked(getAgentStatus).mockResolvedValue(info as any);
    await useAgentStore.getState().fetchStatus("ws-1");
    expect(useAgentStore.getState().agents["ws-1"]).toEqual(info);
  });

  it("swallows errors", async () => {
    vi.mocked(getAgentStatus).mockRejectedValue(new Error("fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useAgentStore.getState().fetchStatus("ws-1");
    // Should not throw
  });
});

describe("agentStore - needsAttention", () => {
  it("sets needsAttention when agent transitions from Running to Idle", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValueOnce(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");

    // Set initial state to Running
    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", status: "Running" } as any,
      },
    });

    // Simulate event callback with Idle status
    const callback = mockListen.mock.calls[0][1] as (event: any) => void;
    callback({ payload: { status: "Idle" } });

    expect(useAgentStore.getState().needsAttention["ws-1"]).toBe(true);
  });

  it("does not set needsAttention for Idle to Idle transition", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValueOnce(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");

    // No agent info yet, getStatus returns "Idle" by default
    const callback = mockListen.mock.calls[0][1] as (event: any) => void;
    callback({ payload: { status: "Idle" } });

    expect(useAgentStore.getState().needsAttention["ws-1"]).toBeUndefined();
  });

  it("does not set needsAttention for Running to Error transition", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValueOnce(mockUnlisten);
    await useAgentStore.getState().subscribe("ws-1");

    useAgentStore.setState({
      agents: {
        "ws-1": { workspaceId: "ws-1", status: "Running" } as any,
      },
    });

    const callback = mockListen.mock.calls[0][1] as (event: any) => void;
    callback({ payload: { status: { Error: "something broke" } } });

    expect(useAgentStore.getState().needsAttention["ws-1"]).toBeUndefined();
  });

  it("clears needsAttention via clearNeedsAttention", () => {
    useAgentStore.setState({ needsAttention: { "ws-1": true } });
    useAgentStore.getState().clearNeedsAttention("ws-1");
    expect(useAgentStore.getState().needsAttention["ws-1"]).toBe(false);
  });
});

// ─── Mutation-killing tests ──────────────────────────────────────────────

describe("agentStore - status change tracking via listener", () => {
  let callback: (event: any) => void;

  beforeEach(async () => {
    mockListen.mockImplementation(async (_ch, handler) => {
      callback = handler as any;
      return () => {};
    });
    await useAgentStore.getState().subscribe("ws-1");
  });

  it("sets runStartedAt when agent becomes Running", () => {
    // Initially Idle (default), transition to Running
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeDefined();
    expect(typeof useAgentStore.getState().runStartedAt["ws-1"]).toBe("number");
  });

  it("clears runStartedAt when agent becomes Idle from Running", () => {
    // Set Running first
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeDefined();

    // Then Idle
    callback({ payload: { status: "Idle", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeUndefined();
  });

  it("does NOT set runStartedAt on Running→Running (already running)", () => {
    // Set to Running
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
    });

    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    // becameRunning should be false (prev was already Running)
    // runStartedAt should NOT be set
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeUndefined();
  });

  it("does NOT set needsAttention on Idle→Idle", () => {
    // Already Idle, stays Idle — no status change notification
    callback({ payload: { status: "Idle", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().needsAttention["ws-1"]).toBeUndefined();
  });

  it("updates agent status in state", () => {
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().agents["ws-1"]?.status).toBe("Running");

    callback({ payload: { status: "Stopping", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().agents["ws-1"]?.status).toBe("Stopping");
  });

  it("preserves other workspace state on status change", () => {
    useAgentStore.setState({
      agents: { "ws-2": { workspaceId: "ws-2", status: "Running" } as any },
    });
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });

    expect(useAgentStore.getState().agents["ws-2"]?.status).toBe("Running");
    expect(useAgentStore.getState().agents["ws-1"]?.status).toBe("Running");
  });
});
