import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getBranchStatus: vi.fn(),
  fetchUpstream: vi.fn(),
  pullRebase: vi.fn(),
  pullMerge: vi.fn(),
  getConflictedFiles: vi.fn(),
  getConflictContent: vi.fn(),
  resolveConflict: vi.fn(),
  abortMerge: vi.fn(),
  continueMerge: vi.fn(),
  crossWorktreeDiff: vi.fn(),
  getCrossWorktreeFileDiff: vi.fn(),
}));

import { useMergeStore } from "./mergeStore";
import {
  getBranchStatus,
  fetchUpstream,
  pullRebase,
  pullMerge,
  getConflictedFiles,
  getConflictContent,
  resolveConflict,
  abortMerge,
  continueMerge,
  crossWorktreeDiff,
  getCrossWorktreeFileDiff,
} from "../lib/tauri";

const makeStatus = (overrides: Record<string, unknown> = {}) => ({
  branch: "main",
  defaultBranch: "main",
  ahead: 0,
  behind: 0,
  hasUpstream: true,
  ...overrides,
});

beforeEach(() => {
  useMergeStore.setState(
    {
      branchStatus: {},
      comparisonTarget: {},
      comparisonDiff: {},
      comparisonFileDiff: {},
      comparisonSelectedFile: {},
      conflictedFiles: {},
      conflictContent: {},
      selectedConflictFile: {},
      loading: {},
      error: {},
      activeSection: {},
    },
  );
  vi.clearAllMocks();
});

describe("mergeStore - loadBranchStatus", () => {
  it("loads and stores branch status", async () => {
    const status = makeStatus({ behind: 3 });
    vi.mocked(getBranchStatus).mockResolvedValue(status as any);

    await useMergeStore.getState().loadBranchStatus("ws-1");

    expect(useMergeStore.getState().branchStatus["ws-1"]).toEqual(status);
  });

  it("sets error on failure", async () => {
    vi.mocked(getBranchStatus).mockRejectedValue(new Error("fail"));

    await useMergeStore.getState().loadBranchStatus("ws-1");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: fail");
  });
});

describe("mergeStore - fetchUpstream", () => {
  it("fetches and reloads branch status", async () => {
    const status = makeStatus({ behind: 2 });
    vi.mocked(fetchUpstream).mockResolvedValue(undefined);
    vi.mocked(getBranchStatus).mockResolvedValue(status as any);

    await useMergeStore.getState().fetchUpstream("ws-1");

    expect(fetchUpstream).toHaveBeenCalledWith("ws-1");
    expect(useMergeStore.getState().branchStatus["ws-1"]).toEqual(status);
    expect(useMergeStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(fetchUpstream).mockRejectedValue(new Error("fetch fail"));

    await useMergeStore.getState().fetchUpstream("ws-1");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: fetch fail");
    expect(useMergeStore.getState().loading["ws-1"]).toBe(false);
  });
});

describe("mergeStore - pullRebase", () => {
  it("pulls without conflicts and refreshes status", async () => {
    const result = {
      success: true,
      message: "ok",
      hasConflicts: false,
      conflictedFiles: [],
    };
    const status = makeStatus();
    vi.mocked(pullRebase).mockResolvedValue(result as any);
    vi.mocked(getBranchStatus).mockResolvedValue(status as any);

    const res = await useMergeStore.getState().pullRebase("ws-1");

    expect(res).toEqual(result);
    expect(useMergeStore.getState().branchStatus["ws-1"]).toEqual(status);
    expect(useMergeStore.getState().loading["ws-1"]).toBe(false);
  });

  it("pulls with conflicts and loads conflicted files", async () => {
    const result = {
      success: true,
      message: "conflicts",
      hasConflicts: true,
      conflictedFiles: ["file.ts"],
    };
    const conflicts = [{ path: "file.ts", conflictType: "BothModified" }];
    vi.mocked(pullRebase).mockResolvedValue(result as any);
    vi.mocked(getConflictedFiles).mockResolvedValue(conflicts as any);

    await useMergeStore.getState().pullRebase("ws-1");

    expect(useMergeStore.getState().conflictedFiles["ws-1"]).toEqual(conflicts);
    expect(useMergeStore.getState().activeSection["ws-1"]).toBe("conflicts");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(pullRebase).mockRejectedValue(new Error("pull fail"));

    await expect(
      useMergeStore.getState().pullRebase("ws-1"),
    ).rejects.toThrow("pull fail");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: pull fail");
  });
});

describe("mergeStore - pullMerge", () => {
  it("pulls without conflicts and refreshes status", async () => {
    const result = {
      success: true,
      message: "ok",
      hasConflicts: false,
      conflictedFiles: [],
    };
    vi.mocked(pullMerge).mockResolvedValue(result as any);
    vi.mocked(getBranchStatus).mockResolvedValue(makeStatus() as any);

    const res = await useMergeStore.getState().pullMerge("ws-1");

    expect(res).toEqual(result);
    expect(useMergeStore.getState().loading["ws-1"]).toBe(false);
  });

  it("pulls with conflicts", async () => {
    const result = {
      success: true,
      message: "conflicts",
      hasConflicts: true,
      conflictedFiles: ["a.ts"],
    };
    vi.mocked(pullMerge).mockResolvedValue(result as any);
    vi.mocked(getConflictedFiles).mockResolvedValue([
      { path: "a.ts", conflictType: "BothModified" },
    ] as any);

    await useMergeStore.getState().pullMerge("ws-1");

    expect(useMergeStore.getState().activeSection["ws-1"]).toBe("conflicts");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(pullMerge).mockRejectedValue(new Error("merge fail"));

    await expect(
      useMergeStore.getState().pullMerge("ws-1"),
    ).rejects.toThrow("merge fail");
  });
});

describe("mergeStore - cross-worktree comparison", () => {
  it("setComparisonTarget resets state and triggers load", async () => {
    const diff = { files: [{ path: "a.ts", status: "modified" }] };
    vi.mocked(crossWorktreeDiff).mockResolvedValue(diff as any);

    useMergeStore.getState().setComparisonTarget("ws-1", "ws-2");

    expect(useMergeStore.getState().comparisonTarget["ws-1"]).toBe("ws-2");
    expect(useMergeStore.getState().comparisonDiff["ws-1"]).toBeNull();
    expect(useMergeStore.getState().comparisonSelectedFile["ws-1"]).toBeNull();

    // Wait for the async loadComparisonDiff
    await vi.waitFor(() => {
      expect(crossWorktreeDiff).toHaveBeenCalledWith("ws-1", "ws-2");
    });
  });

  it("loadComparisonDiff skips without target", async () => {
    await useMergeStore.getState().loadComparisonDiff("ws-1");
    expect(crossWorktreeDiff).not.toHaveBeenCalled();
  });

  it("loadComparisonDiff loads diff for target", async () => {
    const diff = { files: [] };
    useMergeStore.setState({ comparisonTarget: { "ws-1": "ws-2" } });
    vi.mocked(crossWorktreeDiff).mockResolvedValue(diff as any);

    await useMergeStore.getState().loadComparisonDiff("ws-1");

    expect(useMergeStore.getState().comparisonDiff["ws-1"]).toEqual(diff);
  });

  it("loadComparisonDiff sets error on failure", async () => {
    useMergeStore.setState({ comparisonTarget: { "ws-1": "ws-2" } });
    vi.mocked(crossWorktreeDiff).mockRejectedValue(new Error("diff fail"));

    await useMergeStore.getState().loadComparisonDiff("ws-1");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: diff fail");
    expect(useMergeStore.getState().loading["ws-1"]).toBe(false);
  });

  it("selectComparisonFile loads file diff", async () => {
    const fileDiff = { original: "a", modified: "b" };
    useMergeStore.setState({ comparisonTarget: { "ws-1": "ws-2" } });
    vi.mocked(getCrossWorktreeFileDiff).mockResolvedValue(fileDiff as any);

    await useMergeStore.getState().selectComparisonFile("ws-1", "test.ts");

    expect(useMergeStore.getState().comparisonSelectedFile["ws-1"]).toBe(
      "test.ts",
    );
    expect(
      useMergeStore.getState().comparisonFileDiff["ws-1:ws-2:test.ts"],
    ).toEqual(fileDiff);
  });

  it("selectComparisonFile skips without target", async () => {
    await useMergeStore.getState().selectComparisonFile("ws-1", "test.ts");
    expect(getCrossWorktreeFileDiff).not.toHaveBeenCalled();
  });

  it("selectComparisonFile sets error on failure", async () => {
    useMergeStore.setState({ comparisonTarget: { "ws-1": "ws-2" } });
    vi.mocked(getCrossWorktreeFileDiff).mockRejectedValue(new Error("file diff fail"));

    await useMergeStore.getState().selectComparisonFile("ws-1", "test.ts");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: file diff fail");
  });
});

describe("mergeStore - conflicts", () => {
  it("loadConflictedFiles stores files", async () => {
    const files = [{ path: "a.ts", conflictType: "BothModified" }];
    vi.mocked(getConflictedFiles).mockResolvedValue(files as any);

    await useMergeStore.getState().loadConflictedFiles("ws-1");

    expect(useMergeStore.getState().conflictedFiles["ws-1"]).toEqual(files);
  });

  it("loadConflictContent stores content keyed by ws:path", async () => {
    const content = {
      path: "a.ts",
      base: "b",
      ours: "o",
      theirs: "t",
      merged: "m",
      language: "typescript",
    };
    vi.mocked(getConflictContent).mockResolvedValue(content as any);

    await useMergeStore.getState().loadConflictContent("ws-1", "a.ts");

    expect(useMergeStore.getState().selectedConflictFile["ws-1"]).toBe("a.ts");
    expect(useMergeStore.getState().conflictContent["ws-1:a.ts"]).toEqual(
      content,
    );
  });

  it("loadConflictedFiles sets error on failure", async () => {
    vi.mocked(getConflictedFiles).mockRejectedValue(new Error("conflict fail"));

    await useMergeStore.getState().loadConflictedFiles("ws-1");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: conflict fail");
  });

  it("loadConflictContent sets error on failure", async () => {
    vi.mocked(getConflictContent).mockRejectedValue(new Error("content fail"));

    await useMergeStore.getState().loadConflictContent("ws-1", "a.ts");

    expect(useMergeStore.getState().selectedConflictFile["ws-1"]).toBe("a.ts");
    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: content fail");
  });

  it("resolveConflict removes file from list", async () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [
          { path: "a.ts", conflictType: "BothModified" },
          { path: "b.ts", conflictType: "BothModified" },
        ] as any,
      },
    });
    vi.mocked(resolveConflict).mockResolvedValue(undefined);

    await useMergeStore.getState().resolveConflict("ws-1", "a.ts", "ours");

    expect(useMergeStore.getState().conflictedFiles["ws-1"]).toHaveLength(1);
    expect(useMergeStore.getState().conflictedFiles["ws-1"][0].path).toBe(
      "b.ts",
    );
    expect(useMergeStore.getState().selectedConflictFile["ws-1"]).toBeNull();
  });

  it("resolveConflict handles workspace with no prior conflicted files", async () => {
    vi.mocked(resolveConflict).mockResolvedValue(undefined);

    await useMergeStore.getState().resolveConflict("ws-new", "a.ts", "ours");

    expect(useMergeStore.getState().conflictedFiles["ws-new"]).toEqual([]);
    expect(useMergeStore.getState().selectedConflictFile["ws-new"]).toBeNull();
  });

  it("resolveConflict sets error on failure", async () => {
    vi.mocked(resolveConflict).mockRejectedValue(new Error("resolve fail"));

    await useMergeStore.getState().resolveConflict("ws-1", "a.ts", "ours");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: resolve fail");
  });
});

describe("mergeStore - abortMerge", () => {
  it("clears conflicts and refreshes status", async () => {
    useMergeStore.setState({
      conflictedFiles: {
        "ws-1": [{ path: "a.ts", conflictType: "BothModified" }] as any,
      },
      selectedConflictFile: { "ws-1": "a.ts" },
    });
    vi.mocked(abortMerge).mockResolvedValue(undefined);
    vi.mocked(getBranchStatus).mockResolvedValue(makeStatus() as any);

    await useMergeStore.getState().abortMerge("ws-1");

    expect(useMergeStore.getState().conflictedFiles["ws-1"]).toEqual([]);
    expect(useMergeStore.getState().selectedConflictFile["ws-1"]).toBeNull();
    expect(useMergeStore.getState().activeSection["ws-1"]).toBe("sync");
    expect(getBranchStatus).toHaveBeenCalledWith("ws-1");
  });

  it("sets error on failure", async () => {
    vi.mocked(abortMerge).mockRejectedValue(new Error("abort fail"));

    await useMergeStore.getState().abortMerge("ws-1");

    expect(useMergeStore.getState().error["ws-1"]).toBe("Error: abort fail");
  });
});

describe("mergeStore - continueMerge", () => {
  it("clears conflicts and refreshes status", async () => {
    useMergeStore.setState({
      conflictedFiles: { "ws-1": [] },
    });
    vi.mocked(continueMerge).mockResolvedValue(undefined);
    vi.mocked(getBranchStatus).mockResolvedValue(makeStatus() as any);

    await useMergeStore.getState().continueMerge("ws-1");

    expect(useMergeStore.getState().conflictedFiles["ws-1"]).toEqual([]);
    expect(useMergeStore.getState().activeSection["ws-1"]).toBe("sync");
  });

  it("sets error on failure", async () => {
    vi.mocked(continueMerge).mockRejectedValue(new Error("continue fail"));

    await useMergeStore.getState().continueMerge("ws-1");

    expect(useMergeStore.getState().error["ws-1"]).toBe(
      "Error: continue fail",
    );
  });
});

describe("mergeStore - setActiveSection", () => {
  it("sets the active section", () => {
    useMergeStore.getState().setActiveSection("ws-1", "compare");

    expect(useMergeStore.getState().activeSection["ws-1"]).toBe("compare");
  });
});
