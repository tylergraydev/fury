import { describe, it, expect, beforeEach, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";

vi.mock("../lib/ipcInstrumentation", () => ({
  pushStreamEvent: vi.fn(),
  pushAgentTurnMetric: vi.fn(),
}));

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
      repoId: null,
      message: "hello",
      model: null,
      disableThinking: null,
      disablePlanMode: null,
    });
  });

  it("sends repo message when contextType is repo", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("repo-1", "hello", "repo");
    expect(sendMessageCmd).toHaveBeenCalledWith({
      repoId: "repo-1",
      workspaceId: null,
      message: "hello",
      model: null,
      disableThinking: null,
      disablePlanMode: null,
    });
  });

  it("sends with disableThinking and disablePlanMode flags", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "hello", "workspace", "opus", true, true);
    expect(sendMessageCmd).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      repoId: null,
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
    expect(sendMessageCmd).toHaveBeenCalledWith({ workspaceId: "ws-1", repoId: null, message: "build the feature", model: null, disableThinking: null, disablePlanMode: null });
    expect(sendMessageCmd).toHaveBeenCalledWith({ workspaceId: "ws-2", repoId: null, message: "build the feature", model: null, disableThinking: null, disablePlanMode: null });
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
      repoId: null,
      message: "hello",
      model: "opus",
      disableThinking: null,
      disablePlanMode: null,
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
    // Set to Running via state (not callback) so runStartedAt isn't set
    useAgentStore.setState({
      agents: { "ws-1": { workspaceId: "ws-1", status: "Running" } as any },
      runStartedAt: {}, // explicitly empty
    });

    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    // becameRunning should be false (prevStatus === "Running", so !== fails)
    // runStartedAt should NOT be set
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeUndefined();
  });

  it("does NOT set runStartedAt on Idle→Idle", () => {
    // prevStatus defaults to Idle, newStatus is Idle
    // becameRunning should be false
    useAgentStore.setState({ runStartedAt: {} });
    callback({ payload: { status: "Idle", workspaceId: "ws-1" } });
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

  it("defaults prevStatus to Idle when no agent exists", () => {
    // No agent set for ws-1 — prevStatus should default to "Idle"
    // Transitioning from Idle to Running should set runStartedAt
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeDefined();
  });

  it("calls pushStreamEvent with status transition detail", async () => {
    const { pushStreamEvent: pse } = await import("../lib/ipcInstrumentation");
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    expect(pse).toHaveBeenCalledWith("ws-1", "status_changed", expect.stringContaining("Running"));
  });

  it("does not delete runStartedAt on non-idle transition from Running", () => {
    // Running → Error should NOT delete runStartedAt (only Running → Idle does)
    callback({ payload: { status: "Running", workspaceId: "ws-1" } });
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeDefined();

    callback({ payload: { status: { Error: "crash" }, workspaceId: "ws-1" } });
    // becameIdle is false (Error !== "Idle"), so runStartedAt should remain
    expect(useAgentStore.getState().runStartedAt["ws-1"]).toBeDefined();
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

describe("agentStore - sendMessage error handling", () => {
  it("logs error and rethrows on sendMessage failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMessageCmd).mockRejectedValue(new Error("send failed"));

    await expect(
      useAgentStore.getState().sendMessage("ws-1", "hello", "workspace"),
    ).rejects.toThrow("send failed");

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("passes model to sendMessage when provided", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "hello", "workspace", "haiku");
    expect(sendMessageCmd).toHaveBeenCalledWith(
      expect.objectContaining({ model: "haiku" }),
    );
  });

  it("passes null model when not provided", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "hello", "workspace");
    expect(sendMessageCmd).toHaveBeenCalledWith(
      expect.objectContaining({ model: null }),
    );
  });
});

describe("agentStore - stopAgent error handling", () => {
  it("logs error and rethrows on stopAgent failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stopAgentCmd).mockRejectedValue(new Error("stop failed"));

    await expect(
      useAgentStore.getState().stopAgent("ws-1"),
    ).rejects.toThrow("stop failed");

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("agentStore - fetchStatus", () => {
  it("updates agent state on successful fetch", async () => {
    vi.mocked(getAgentStatus).mockResolvedValue({
      workspaceId: "ws-1",
      status: "Running",
      sessionId: "sess-1",
      startedAt: null,
      pid: null,
    } as any);

    await useAgentStore.getState().fetchStatus("ws-1");

    expect(useAgentStore.getState().agents["ws-1"]?.status).toBe("Running");
  });

  it("logs error on fetchStatus failure without throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getAgentStatus).mockRejectedValue(new Error("fetch failed"));

    // Should NOT throw
    await useAgentStore.getState().fetchStatus("ws-1");

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[agentStore] Failed to fetch status"),
      expect.any(Error),
    );
    spy.mockRestore();
  });
});

describe("agentStore - error message content", () => {
  it("sendMessage error log includes function context", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMessageCmd).mockRejectedValue(new Error("fail"));
    await useAgentStore.getState().sendMessage("ws-1", "hi").catch(() => {});
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send message"),
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("stopAgent error log includes function context", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stopAgentCmd).mockRejectedValue(new Error("fail"));
    await useAgentStore.getState().stopAgent("ws-1").catch(() => {});
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to stop agent"),
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("status listener pushes 'Idle' as default prevStatus", async () => {
    const { pushStreamEvent } = await import("../lib/ipcInstrumentation");
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);
    await useAgentStore.getState().subscribe("ws-str");

    const callback = mockListen.mock.calls[mockListen.mock.calls.length - 1][1] as (event: any) => void;
    callback({ payload: { status: "Running", workspaceId: "ws-str" } });

    expect(pushStreamEvent).toHaveBeenCalledWith(
      "ws-str",
      "status_changed",
      expect.stringContaining("Idle"),
    );
  });

  it("model ?? null converts empty string to empty string (falsy but not nullish)", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("ws-1", "hi", "workspace", "");
    expect(sendMessageCmd).toHaveBeenCalledWith(
      expect.objectContaining({ model: "" }),
    );
  });

  it("model passed correctly in repo context", async () => {
    vi.mocked(sendMessageCmd).mockResolvedValue(undefined);
    await useAgentStore.getState().sendMessage("repo-1", "hi", "repo", "haiku");
    expect(sendMessageCmd).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: "repo-1", model: "haiku" }),
    );
  });
});
