import { describe, it, expect, beforeEach, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";

vi.mock("../lib/tauri", () => ({
  listCheckpoints: vi.fn(),
  revertToCheckpoint: vi.fn(),
}));

import { useCheckpointStore } from "./checkpointStore";
import {
  listCheckpoints,
  revertToCheckpoint,
} from "../lib/tauri";

const mockListen = vi.mocked(listen);

const makeCheckpoint = (turnIndex = 0) => ({
  id: `cp-${turnIndex}`,
  workspaceId: "ws-1",
  sessionId: "s1",
  turnIndex,
  refName: `refs/checkpoints/${turnIndex}`,
  treeSha: "abc",
  commitSha: "def",
  createdAt: "2025-01-01",
  userMessage: "msg",
});

beforeEach(() => {
  useCheckpointStore.setState(
    { checkpoints: {}, subscriptions: {}, revertedTurnIndex: {} },
  );
  vi.clearAllMocks();
});

describe("checkpointStore - subscribe", () => {
  it("registers two listeners (created + reverted)", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useCheckpointStore.getState().subscribe("ws-1");
    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(mockListen).toHaveBeenCalledWith(
      "checkpoint-created:ws-1",
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      "checkpoint-reverted:ws-1",
      expect.any(Function),
    );
  });

  it("does not double-subscribe", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useCheckpointStore.getState().subscribe("ws-1");
    await useCheckpointStore.getState().subscribe("ws-1");
    expect(mockListen).toHaveBeenCalledTimes(2);
  });

  it("appends checkpoint on created event", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useCheckpointStore.getState().subscribe("ws-1");
    const createdCallback = mockListen.mock.calls[0][1] as (e: any) => void;
    const cp = makeCheckpoint(0);
    createdCallback({ payload: cp });
    expect(useCheckpointStore.getState().checkpoints["ws-1"]).toEqual([cp]);
  });

  it("filters checkpoints and sets revertedTurnIndex on reverted event", async () => {
    mockListen.mockResolvedValue(vi.fn());
    useCheckpointStore.setState({
      checkpoints: {
        "ws-1": [makeCheckpoint(0), makeCheckpoint(1), makeCheckpoint(2)] as any,
      },
    });
    await useCheckpointStore.getState().subscribe("ws-1");
    const revertedCallback = mockListen.mock.calls[1][1] as (e: any) => void;
    revertedCallback({ payload: { turnIndex: 1 } });
    const cps = useCheckpointStore.getState().checkpoints["ws-1"];
    expect(cps).toHaveLength(2);
    expect(useCheckpointStore.getState().revertedTurnIndex["ws-1"]).toBe(1);
  });
});

describe("checkpointStore - unsubscribe", () => {
  it("calls both unlisten functions", async () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    mockListen.mockResolvedValueOnce(unsub1).mockResolvedValueOnce(unsub2);
    await useCheckpointStore.getState().subscribe("ws-1");
    useCheckpointStore.getState().unsubscribe("ws-1");
    expect(unsub1).toHaveBeenCalledOnce();
    expect(unsub2).toHaveBeenCalledOnce();
    expect(useCheckpointStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });
});

describe("checkpointStore - loadCheckpoints", () => {
  it("loads checkpoints from backend", async () => {
    const cps = [makeCheckpoint(0), makeCheckpoint(1)];
    vi.mocked(listCheckpoints).mockResolvedValue(cps as any);
    await useCheckpointStore.getState().loadCheckpoints("ws-1");
    expect(useCheckpointStore.getState().checkpoints["ws-1"]).toEqual(cps);
  });

  it("swallows errors", async () => {
    vi.mocked(listCheckpoints).mockRejectedValue(new Error("fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useCheckpointStore.getState().loadCheckpoints("ws-1");
    // Should not throw
  });
});

describe("checkpointStore - revertToCheckpoint", () => {
  it("calls the revert command", async () => {
    vi.mocked(revertToCheckpoint).mockResolvedValue(undefined);
    await useCheckpointStore.getState().revertToCheckpoint("ws-1", "cp-0");
    expect(revertToCheckpoint).toHaveBeenCalledWith("ws-1", "cp-0");
  });

  it("re-throws errors", async () => {
    vi.mocked(revertToCheckpoint).mockRejectedValue(new Error("revert fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      useCheckpointStore.getState().revertToCheckpoint("ws-1", "cp-0"),
    ).rejects.toThrow("revert fail");
  });
});

describe("checkpointStore - getters", () => {
  it("getCheckpoints returns empty array for unknown workspace", () => {
    expect(useCheckpointStore.getState().getCheckpoints("unknown")).toEqual([]);
  });

  it("getRevertedTurnIndex returns null for unknown workspace", () => {
    expect(
      useCheckpointStore.getState().getRevertedTurnIndex("unknown"),
    ).toBeNull();
  });
});
