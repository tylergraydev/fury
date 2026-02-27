import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getDiff: vi.fn(),
  getFileDiff: vi.fn(),
  getRepoDiff: vi.fn(),
  getRepoFileDiff: vi.fn(),
  getFilePatch: vi.fn(),
  getRepoFilePatch: vi.fn(),
}));

import { useDiffStore } from "./diffStore";
import {
  getDiff,
  getFileDiff,
  getRepoDiff,
  getRepoFileDiff,
  getFilePatch,
  getRepoFilePatch,
} from "../lib/tauri";

beforeEach(() => {
  useDiffStore.setState(
    {
      diffResults: {},
      fileDiffs: {},
      selectedFile: {},
      loading: {},
      error: {},
      patchPreviews: {},
      patchLoading: {},
    },
  );
  vi.clearAllMocks();
});

describe("diffStore - loadDiff", () => {
  it("loads diff result for workspace", async () => {
    const result = { files: ["a.ts", "b.ts"] };
    vi.mocked(getDiff).mockResolvedValue(result as any);
    await useDiffStore.getState().loadDiff("ws-1");
    expect(useDiffStore.getState().diffResults["ws-1"]).toEqual(result);
    expect(useDiffStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(getDiff).mockRejectedValue(new Error("fail"));
    await useDiffStore.getState().loadDiff("ws-1");
    expect(useDiffStore.getState().error["ws-1"]).toBe("Error: fail");
  });
});

describe("diffStore - loadFileDiff", () => {
  it("loads file diff content", async () => {
    const content = { before: "old", after: "new" };
    vi.mocked(getFileDiff).mockResolvedValue(content as any);
    await useDiffStore.getState().loadFileDiff("ws-1", "src/a.ts");
    expect(useDiffStore.getState().fileDiffs["ws-1:src/a.ts"]).toEqual(content);
  });

  it("logs error on failure", async () => {
    vi.mocked(getFileDiff).mockRejectedValue(new Error("file fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useDiffStore.getState().loadFileDiff("ws-1", "src/a.ts");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("diffStore - loadRepoDiff", () => {
  it("loads repo diff", async () => {
    const result = { files: ["c.rs"] };
    vi.mocked(getRepoDiff).mockResolvedValue(result as any);
    await useDiffStore.getState().loadRepoDiff("repo-1");
    expect(useDiffStore.getState().diffResults["repo-1"]).toEqual(result);
  });

  it("sets error on failure", async () => {
    vi.mocked(getRepoDiff).mockRejectedValue(new Error("repo diff fail"));
    await useDiffStore.getState().loadRepoDiff("repo-1");
    expect(useDiffStore.getState().error["repo-1"]).toBe("Error: repo diff fail");
    expect(useDiffStore.getState().loading["repo-1"]).toBe(false);
  });
});

describe("diffStore - loadRepoFileDiff", () => {
  it("loads repo file diff content", async () => {
    const content = { before: "old", after: "new" };
    vi.mocked(getRepoFileDiff).mockResolvedValue(content as any);
    await useDiffStore.getState().loadRepoFileDiff("repo-1", "main.rs");
    expect(useDiffStore.getState().fileDiffs["repo-1:main.rs"]).toEqual(content);
  });

  it("logs error on failure", async () => {
    vi.mocked(getRepoFileDiff).mockRejectedValue(new Error("repo file fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useDiffStore.getState().loadRepoFileDiff("repo-1", "main.rs");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("diffStore - selectFile", () => {
  it("sets selected file and triggers loadFileDiff", async () => {
    const content = { before: "", after: "" };
    vi.mocked(getFileDiff).mockResolvedValue(content as any);
    useDiffStore.getState().selectFile("ws-1", "src/a.ts");
    expect(useDiffStore.getState().selectedFile["ws-1"]).toBe("src/a.ts");
    expect(getFileDiff).toHaveBeenCalledWith("ws-1", "src/a.ts");
  });
});

describe("diffStore - selectRepoFile", () => {
  it("sets selected file and triggers loadRepoFileDiff", async () => {
    vi.mocked(getRepoFileDiff).mockResolvedValue({} as any);
    useDiffStore.getState().selectRepoFile("repo-1", "main.rs");
    expect(useDiffStore.getState().selectedFile["repo-1"]).toBe("main.rs");
    expect(getRepoFileDiff).toHaveBeenCalledWith("repo-1", "main.rs");
  });
});

describe("diffStore - loadDiff inflight dedup", () => {
  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(getDiff).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useDiffStore.getState().loadDiff("ws-1");
    const p2 = useDiffStore.getState().loadDiff("ws-1");
    resolve!({ files: [] });
    await Promise.all([p1, p2]);
    expect(getDiff).toHaveBeenCalledTimes(1);
  });

  it("suppresses error when cached data exists", async () => {
    vi.mocked(getDiff).mockResolvedValue({ files: ["a.ts"] } as any);
    await useDiffStore.getState().loadDiff("ws-1");
    expect(useDiffStore.getState().diffResults["ws-1"]).toBeTruthy();

    vi.mocked(getDiff).mockRejectedValue(new Error("net"));
    await useDiffStore.getState().loadDiff("ws-1");
    expect(useDiffStore.getState().error["ws-1"]).toBeNull();
  });
});

describe("diffStore - loadRepoDiff inflight dedup", () => {
  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(getRepoDiff).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useDiffStore.getState().loadRepoDiff("repo-1");
    const p2 = useDiffStore.getState().loadRepoDiff("repo-1");
    resolve!({ files: [] });
    await Promise.all([p1, p2]);
    expect(getRepoDiff).toHaveBeenCalledTimes(1);
  });

  it("suppresses error when cached data exists", async () => {
    vi.mocked(getRepoDiff).mockResolvedValue({ files: ["a.rs"] } as any);
    await useDiffStore.getState().loadRepoDiff("repo-1");

    vi.mocked(getRepoDiff).mockRejectedValue(new Error("net"));
    await useDiffStore.getState().loadRepoDiff("repo-1");
    expect(useDiffStore.getState().error["repo-1"]).toBeNull();
  });
});

describe("diffStore - getters", () => {
  it("getDiffResult returns null for unknown context", () => {
    expect(useDiffStore.getState().getDiffResult("unknown")).toBeNull();
  });

  it("getFileDiffContent returns null for unknown key", () => {
    expect(
      useDiffStore.getState().getFileDiffContent("ws-1", "missing.ts"),
    ).toBeNull();
  });

  it("getSelectedFile returns null for unknown context", () => {
    expect(useDiffStore.getState().getSelectedFile("unknown")).toBeNull();
  });
});

describe("diffStore - refresh", () => {
  it("reloads diff and selected file diff", async () => {
    vi.mocked(getDiff).mockResolvedValue({ files: [] } as any);
    vi.mocked(getFileDiff).mockResolvedValue({} as any);
    useDiffStore.setState({ selectedFile: { "ws-1": "src/a.ts" } });
    await useDiffStore.getState().refresh("ws-1");
    expect(getDiff).toHaveBeenCalledWith("ws-1");
    expect(getFileDiff).toHaveBeenCalledWith("ws-1", "src/a.ts");
  });

  it("skips file diff reload when no file is selected", async () => {
    vi.mocked(getDiff).mockResolvedValue({ files: [] } as any);
    await useDiffStore.getState().refresh("ws-1");
    expect(getFileDiff).not.toHaveBeenCalled();
  });
});

describe("diffStore - refreshRepo", () => {
  it("reloads repo diff and selected file diff", async () => {
    vi.mocked(getRepoDiff).mockResolvedValue({ files: [] } as any);
    vi.mocked(getRepoFileDiff).mockResolvedValue({} as any);
    useDiffStore.setState({ selectedFile: { "repo-1": "main.rs" } });
    await useDiffStore.getState().refreshRepo("repo-1");
    expect(getRepoDiff).toHaveBeenCalledWith("repo-1");
    expect(getRepoFileDiff).toHaveBeenCalledWith("repo-1", "main.rs");
  });

  it("skips file diff reload when no file is selected", async () => {
    vi.mocked(getRepoDiff).mockResolvedValue({ files: [] } as any);
    await useDiffStore.getState().refreshRepo("repo-1");
    expect(getRepoFileDiff).not.toHaveBeenCalled();
  });
});

describe("diffStore - loadPatchPreview", () => {
  it("loads and caches patch preview for workspace", async () => {
    const preview = { path: "a.ts", language: "typescript", patch: "+hello", truncated: false };
    vi.mocked(getFilePatch).mockResolvedValue(preview as any);
    await useDiffStore.getState().loadPatchPreview("ws-1", "a.ts", false, "workspace");
    expect(useDiffStore.getState().patchPreviews["ws-1:a.ts"]).toEqual(preview);
    expect(useDiffStore.getState().patchLoading["ws-1:a.ts"]).toBe(false);
  });

  it("returns cached value on second call", async () => {
    const preview = { path: "a.ts", language: "typescript", patch: "+hello", truncated: false };
    vi.mocked(getFilePatch).mockResolvedValue(preview as any);
    await useDiffStore.getState().loadPatchPreview("ws-1", "a.ts", false, "workspace");
    await useDiffStore.getState().loadPatchPreview("ws-1", "a.ts", false, "workspace");
    expect(getFilePatch).toHaveBeenCalledTimes(1);
  });

  it("uses getRepoFilePatch for repo context", async () => {
    vi.mocked(getRepoFilePatch).mockResolvedValue({} as any);
    await useDiffStore.getState().loadPatchPreview("r1", "main.rs", false, "repo");
    expect(getRepoFilePatch).toHaveBeenCalledWith("r1", "main.rs", false);
  });

  it("logs error on failure", async () => {
    vi.mocked(getFilePatch).mockRejectedValue(new Error("patch fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useDiffStore.getState().loadPatchPreview("ws-1", "a.ts", false, "workspace");
    expect(console.error).toHaveBeenCalled();
    expect(useDiffStore.getState().patchLoading["ws-1:a.ts"]).toBe(false);
  });
});

describe("diffStore - getPatchPreview", () => {
  it("returns null for unknown key", () => {
    expect(useDiffStore.getState().getPatchPreview("ws-1", "missing.ts")).toBeNull();
  });

  it("returns cached preview", () => {
    const preview = { path: "a.ts", language: "typescript", patch: "+x", truncated: false };
    useDiffStore.setState({ patchPreviews: { "ws-1:a.ts": preview as any } });
    expect(useDiffStore.getState().getPatchPreview("ws-1", "a.ts")).toEqual(preview);
  });
});

describe("diffStore - clearPatchPreviews", () => {
  it("removes cached entries for context", () => {
    useDiffStore.setState({
      patchPreviews: {
        "ws-1:a.ts": { path: "a.ts" } as any,
        "ws-1:b.ts": { path: "b.ts" } as any,
        "ws-2:c.ts": { path: "c.ts" } as any,
      },
      patchLoading: {
        "ws-1:a.ts": false,
        "ws-2:c.ts": false,
      },
    });
    useDiffStore.getState().clearPatchPreviews("ws-1");
    expect(useDiffStore.getState().patchPreviews["ws-1:a.ts"]).toBeUndefined();
    expect(useDiffStore.getState().patchPreviews["ws-1:b.ts"]).toBeUndefined();
    expect(useDiffStore.getState().patchPreviews["ws-2:c.ts"]).toBeDefined();
    expect(useDiffStore.getState().patchLoading["ws-1:a.ts"]).toBeUndefined();
  });
});

describe("diffStore - refresh clears patch cache", () => {
  it("refresh clears patch previews", async () => {
    vi.mocked(getDiff).mockResolvedValue({ files: [] } as any);
    useDiffStore.setState({
      patchPreviews: { "ws-1:a.ts": { path: "a.ts" } as any },
    });
    await useDiffStore.getState().refresh("ws-1");
    expect(useDiffStore.getState().patchPreviews["ws-1:a.ts"]).toBeUndefined();
  });

  it("refreshRepo clears patch previews", async () => {
    vi.mocked(getRepoDiff).mockResolvedValue({ files: [] } as any);
    useDiffStore.setState({
      patchPreviews: { "repo-1:main.rs": { path: "main.rs" } as any },
    });
    await useDiffStore.getState().refreshRepo("repo-1");
    expect(useDiffStore.getState().patchPreviews["repo-1:main.rs"]).toBeUndefined();
  });
});
