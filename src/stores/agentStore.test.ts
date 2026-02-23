import { describe, it, expect, beforeEach, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";

vi.mock("../lib/tauri", () => ({
  sendMessage: vi.fn(),
  stopAgent: vi.fn(),
  getAgentStatus: vi.fn(),
}));

import { useAgentStore } from "./agentStore";
import {
  sendMessage as sendMessageCmd,
  stopAgent as stopAgentCmd,
  getAgentStatus,
} from "../lib/tauri";

const mockListen = vi.mocked(listen);

beforeEach(() => {
  useAgentStore.setState({ agents: {}, subscriptions: {} });
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
