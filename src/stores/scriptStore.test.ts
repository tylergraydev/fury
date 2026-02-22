import { describe, it, expect, beforeEach, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";

vi.mock("../lib/tauri", () => ({
  runScript: vi.fn(),
  stopScript: vi.fn(),
  runRepoScript: vi.fn(),
  stopRepoScript: vi.fn(),
}));

import { useScriptStore } from "./scriptStore";
import {
  runScript as runScriptCmd,
  stopScript as stopScriptCmd,
  runRepoScript as runRepoScriptCmd,
  stopRepoScript as stopRepoScriptCmd,
} from "../lib/tauri";

const mockListen = vi.mocked(listen);

beforeEach(() => {
  useScriptStore.setState(
    { output: {}, running: {}, exitCodes: {}, subscriptions: {} },
  );
  vi.clearAllMocks();
});

describe("scriptStore - subscribe", () => {
  it("registers output and exit listeners", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useScriptStore.getState().subscribe("ws-1", "setup");
    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(mockListen).toHaveBeenCalledWith(
      "script-output:setup:ws-1",
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      "script-exit:setup:ws-1",
      expect.any(Function),
    );
  });

  it("does not double-subscribe", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useScriptStore.getState().subscribe("ws-1", "setup");
    await useScriptStore.getState().subscribe("ws-1", "setup");
    expect(mockListen).toHaveBeenCalledTimes(2);
  });

  it("appends output with stderr prefix from output event", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useScriptStore.getState().subscribe("ws-1", "setup");
    const outputCallback = mockListen.mock.calls[0][1] as (e: any) => void;
    outputCallback({ payload: { stream: "stderr", line: "error msg" } });
    expect(useScriptStore.getState().output["ws-1:setup"]).toEqual([
      "[stderr] error msg",
    ]);
  });

  it("appends stdout output without prefix", async () => {
    mockListen.mockResolvedValue(vi.fn());
    await useScriptStore.getState().subscribe("ws-1", "setup");
    const outputCallback = mockListen.mock.calls[0][1] as (e: any) => void;
    outputCallback({ payload: { stream: "stdout", line: "hello" } });
    expect(useScriptStore.getState().output["ws-1:setup"]).toEqual(["hello"]);
  });

  it("sets running=false and exitCode on exit event", async () => {
    mockListen.mockResolvedValue(vi.fn());
    useScriptStore.setState({ running: { "ws-1:setup": true } });
    await useScriptStore.getState().subscribe("ws-1", "setup");
    const exitCallback = mockListen.mock.calls[1][1] as (e: any) => void;
    exitCallback({ payload: { exitCode: 0 } });
    expect(useScriptStore.getState().running["ws-1:setup"]).toBe(false);
    expect(useScriptStore.getState().exitCodes["ws-1:setup"]).toBe(0);
  });
});

describe("scriptStore - unsubscribe", () => {
  it("is a no-op for non-existent key", () => {
    useScriptStore.getState().unsubscribe("non-existent", "setup");
    expect(useScriptStore.getState().subscriptions).toEqual({});
  });

  it("calls both unlisten functions", async () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    mockListen.mockResolvedValueOnce(unsub1).mockResolvedValueOnce(unsub2);
    await useScriptStore.getState().subscribe("ws-1", "setup");
    useScriptStore.getState().unsubscribe("ws-1", "setup");
    expect(unsub1).toHaveBeenCalled();
    expect(unsub2).toHaveBeenCalled();
  });
});

describe("scriptStore - runScript", () => {
  it("sets running=true, clears output, calls command", async () => {
    vi.mocked(runScriptCmd).mockResolvedValue(undefined);
    await useScriptStore.getState().runScript("ws-1", "setup");
    expect(useScriptStore.getState().running["ws-1:setup"]).toBe(true);
    expect(useScriptStore.getState().output["ws-1:setup"]).toEqual([]);
    expect(runScriptCmd).toHaveBeenCalledWith("ws-1", "setup");
  });

  it("handles error by setting running=false and appending error", async () => {
    vi.mocked(runScriptCmd).mockRejectedValue(new Error("fail"));
    await useScriptStore.getState().runScript("ws-1", "setup");
    expect(useScriptStore.getState().running["ws-1:setup"]).toBe(false);
    expect(useScriptStore.getState().output["ws-1:setup"][0]).toContain(
      "[error]",
    );
  });

  it("handles error when output key was cleared externally", async () => {
    vi.mocked(runScriptCmd).mockImplementation(async () => {
      // Simulate the output being cleared during the async operation
      useScriptStore.setState({ output: {} });
      throw new Error("fail after clear");
    });
    await useScriptStore.getState().runScript("ws-1", "setup");
    expect(useScriptStore.getState().running["ws-1:setup"]).toBe(false);
    expect(useScriptStore.getState().output["ws-1:setup"][0]).toContain("[error]");
  });
});

describe("scriptStore - stopScript", () => {
  it("calls stopScript command", async () => {
    vi.mocked(stopScriptCmd).mockResolvedValue(undefined);
    await useScriptStore.getState().stopScript("ws-1", "setup");
    expect(stopScriptCmd).toHaveBeenCalledWith("ws-1", "setup");
  });

  it("swallows errors from stopScript", async () => {
    vi.mocked(stopScriptCmd).mockRejectedValue(new Error("stop fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useScriptStore.getState().stopScript("ws-1", "setup");
    // Should not throw
  });
});

describe("scriptStore - runRepoScript", () => {
  it("runs repo script", async () => {
    vi.mocked(runRepoScriptCmd).mockResolvedValue(undefined);
    await useScriptStore.getState().runRepoScript("repo-1", "setup");
    expect(runRepoScriptCmd).toHaveBeenCalledWith("repo-1", "setup");
    expect(useScriptStore.getState().running["repo-1:setup"]).toBe(true);
  });

  it("handles error by setting running=false and appending error", async () => {
    vi.mocked(runRepoScriptCmd).mockRejectedValue(new Error("repo fail"));
    await useScriptStore.getState().runRepoScript("repo-1", "setup");
    expect(useScriptStore.getState().running["repo-1:setup"]).toBe(false);
    expect(useScriptStore.getState().output["repo-1:setup"][0]).toContain(
      "[error]",
    );
  });

  it("handles error when output key was cleared externally (uses ?? [] fallback)", async () => {
    vi.mocked(runRepoScriptCmd).mockImplementation(async () => {
      useScriptStore.setState({ output: {} });
      throw new Error("fail after clear");
    });
    await useScriptStore.getState().runRepoScript("repo-1", "setup");
    expect(useScriptStore.getState().running["repo-1:setup"]).toBe(false);
    expect(useScriptStore.getState().output["repo-1:setup"][0]).toContain("[error]");
  });
});

describe("scriptStore - stopRepoScript", () => {
  it("calls stopRepoScript command", async () => {
    vi.mocked(stopRepoScriptCmd).mockResolvedValue(undefined);
    await useScriptStore.getState().stopRepoScript("repo-1", "setup");
    expect(stopRepoScriptCmd).toHaveBeenCalledWith("repo-1", "setup");
  });

  it("swallows errors from stopRepoScript", async () => {
    vi.mocked(stopRepoScriptCmd).mockRejectedValue(new Error("stop repo fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useScriptStore.getState().stopRepoScript("repo-1", "setup");
    // Should not throw
  });
});

describe("scriptStore - clearOutput", () => {
  it("clears output and exitCode", () => {
    useScriptStore.setState({
      output: { "ws-1:setup": ["line1"] },
      exitCodes: { "ws-1:setup": 0 },
    });
    useScriptStore.getState().clearOutput("ws-1", "setup");
    expect(useScriptStore.getState().output["ws-1:setup"]).toEqual([]);
    expect(useScriptStore.getState().exitCodes["ws-1:setup"]).toBeNull();
  });
});

describe("scriptStore - getters", () => {
  it("getOutput returns empty array for unknown key", () => {
    expect(useScriptStore.getState().getOutput("unknown", "setup")).toEqual([]);
  });

  it("isRunning returns false for unknown key", () => {
    expect(useScriptStore.getState().isRunning("unknown", "setup")).toBe(false);
  });
});
