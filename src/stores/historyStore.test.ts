import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getGitLog: vi.fn(),
}));

import { useHistoryStore } from "./historyStore";
import { getGitLog } from "../lib/tauri";

const makeEntry = (sha = "abc123") => ({
  sha,
  message: "commit message",
  author: "test",
  date: "2025-01-01",
});

beforeEach(() => {
  useHistoryStore.setState(
    { gitLog: {}, loading: {}, error: {} },
  );
  vi.clearAllMocks();
});

describe("historyStore - loadGitLog", () => {
  it("loads git log for a workspace", async () => {
    const log = [makeEntry("abc"), makeEntry("def")];
    vi.mocked(getGitLog).mockResolvedValue(log as any);
    await useHistoryStore.getState().loadGitLog("ws-1");
    expect(useHistoryStore.getState().gitLog["ws-1"]).toEqual(log);
    expect(useHistoryStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(getGitLog).mockRejectedValue(new Error("git fail"));
    await useHistoryStore.getState().loadGitLog("ws-1");
    expect(useHistoryStore.getState().error["ws-1"]).toBe("Error: git fail");
    expect(useHistoryStore.getState().loading["ws-1"]).toBe(false);
  });
});

describe("historyStore - getGitLog", () => {
  it("returns log for a known workspace", () => {
    const log = [makeEntry()];
    useHistoryStore.setState({ gitLog: { "ws-1": log as any } });
    expect(useHistoryStore.getState().getGitLog("ws-1")).toEqual(log);
  });

  it("returns empty array for unknown workspace", () => {
    expect(useHistoryStore.getState().getGitLog("unknown")).toEqual([]);
  });
});
