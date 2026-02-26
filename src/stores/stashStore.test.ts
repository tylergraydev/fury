import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listStashes: vi.fn(),
  createStash: vi.fn(),
  applyStash: vi.fn(),
  popStash: vi.fn(),
  dropStash: vi.fn(),
  showStash: vi.fn(),
}));

import { useStashStore } from "./stashStore";
import {
  listStashes,
  createStash,
  applyStash,
  popStash,
  dropStash,
  showStash,
} from "../lib/tauri";

const makeStash = (index: number, overrides: Record<string, unknown> = {}) => ({
  index,
  message: `stash ${index}`,
  branch: "main",
  timestamp: "2024-01-15T10:00:00+00:00",
  ...overrides,
});

const makeDetail = (index: number) => ({
  index,
  message: `stash ${index}`,
  files: [{ path: "file.ts", additions: 5, deletions: 2 }],
  patch: "diff --git a/file.ts b/file.ts",
});

beforeEach(() => {
  useStashStore.setState({
    stashes: {},
    selectedStash: {},
    stashDetail: {},
    loading: {},
    error: {},
  });
  vi.clearAllMocks();
});

describe("stashStore - loadStashes", () => {
  it("loads and stores stashes", async () => {
    const stashes = [makeStash(0), makeStash(1)];
    vi.mocked(listStashes).mockResolvedValue(stashes as any);

    await useStashStore.getState().loadStashes("ws-1");

    expect(useStashStore.getState().stashes["ws-1"]).toEqual(stashes);
  });

  it("sets error on failure", async () => {
    vi.mocked(listStashes).mockRejectedValue(new Error("list fail"));

    await useStashStore.getState().loadStashes("ws-1");

    expect(useStashStore.getState().error["ws-1"]).toBe("Error: list fail");
  });

  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(listStashes).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useStashStore.getState().loadStashes("ws-1");
    const p2 = useStashStore.getState().loadStashes("ws-1");
    resolve!([]);
    await Promise.all([p1, p2]);
    expect(listStashes).toHaveBeenCalledTimes(1);
  });
});

describe("stashStore - createStash", () => {
  it("creates stash and refreshes list", async () => {
    const created = makeStash(0, { message: "my stash" });
    const refreshed = [created];
    vi.mocked(createStash).mockResolvedValue(created as any);
    vi.mocked(listStashes).mockResolvedValue(refreshed as any);

    await useStashStore.getState().createStash("ws-1", "my stash", true);

    expect(createStash).toHaveBeenCalledWith("ws-1", "my stash", true);
    expect(useStashStore.getState().stashes["ws-1"]).toEqual(refreshed);
    expect(useStashStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(createStash).mockRejectedValue(new Error("no changes"));

    await useStashStore.getState().createStash("ws-1");

    expect(useStashStore.getState().error["ws-1"]).toBe("Error: no changes");
    expect(useStashStore.getState().loading["ws-1"]).toBe(false);
  });
});

describe("stashStore - applyStash", () => {
  it("applies stash successfully", async () => {
    vi.mocked(applyStash).mockResolvedValue(undefined);

    await useStashStore.getState().applyStash("ws-1", 0);

    expect(applyStash).toHaveBeenCalledWith("ws-1", 0);
    expect(useStashStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(applyStash).mockRejectedValue(new Error("apply fail"));

    await useStashStore.getState().applyStash("ws-1", 0);

    expect(useStashStore.getState().error["ws-1"]).toBe("Error: apply fail");
    expect(useStashStore.getState().loading["ws-1"]).toBe(false);
  });
});

describe("stashStore - popStash", () => {
  it("pops stash and refreshes list", async () => {
    vi.mocked(popStash).mockResolvedValue(undefined);
    vi.mocked(listStashes).mockResolvedValue([]);

    await useStashStore.getState().popStash("ws-1", 0);

    expect(popStash).toHaveBeenCalledWith("ws-1", 0);
    expect(useStashStore.getState().stashes["ws-1"]).toEqual([]);
    expect(useStashStore.getState().selectedStash["ws-1"]).toBeNull();
    expect(useStashStore.getState().stashDetail["ws-1"]).toBeNull();
    expect(useStashStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(popStash).mockRejectedValue(new Error("pop fail"));

    await useStashStore.getState().popStash("ws-1", 0);

    expect(useStashStore.getState().error["ws-1"]).toBe("Error: pop fail");
  });
});

describe("stashStore - dropStash", () => {
  it("drops stash and refreshes list", async () => {
    vi.mocked(dropStash).mockResolvedValue(undefined);
    vi.mocked(listStashes).mockResolvedValue([]);

    await useStashStore.getState().dropStash("ws-1", 0);

    expect(dropStash).toHaveBeenCalledWith("ws-1", 0);
    expect(useStashStore.getState().stashes["ws-1"]).toEqual([]);
    expect(useStashStore.getState().selectedStash["ws-1"]).toBeNull();
    expect(useStashStore.getState().stashDetail["ws-1"]).toBeNull();
    expect(useStashStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(dropStash).mockRejectedValue(new Error("drop fail"));

    await useStashStore.getState().dropStash("ws-1", 0);

    expect(useStashStore.getState().error["ws-1"]).toBe("Error: drop fail");
  });
});

describe("stashStore - showStash", () => {
  it("loads and stores stash detail", async () => {
    const detail = makeDetail(0);
    vi.mocked(showStash).mockResolvedValue(detail as any);

    await useStashStore.getState().showStash("ws-1", 0);

    expect(useStashStore.getState().selectedStash["ws-1"]).toBe(0);
    expect(useStashStore.getState().stashDetail["ws-1"]).toEqual(detail);
  });

  it("toggles off when clicking same stash", async () => {
    useStashStore.setState({ selectedStash: { "ws-1": 0 } });

    await useStashStore.getState().showStash("ws-1", 0);

    expect(useStashStore.getState().selectedStash["ws-1"]).toBeNull();
    expect(useStashStore.getState().stashDetail["ws-1"]).toBeNull();
    expect(showStash).not.toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    vi.mocked(showStash).mockRejectedValue(new Error("show fail"));

    await useStashStore.getState().showStash("ws-1", 0);

    expect(useStashStore.getState().error["ws-1"]).toBe("Error: show fail");
  });
});

describe("stashStore - clearSelection", () => {
  it("clears selected stash and detail", () => {
    useStashStore.setState({
      selectedStash: { "ws-1": 0 },
      stashDetail: { "ws-1": makeDetail(0) as any },
    });

    useStashStore.getState().clearSelection("ws-1");

    expect(useStashStore.getState().selectedStash["ws-1"]).toBeNull();
    expect(useStashStore.getState().stashDetail["ws-1"]).toBeNull();
  });
});
