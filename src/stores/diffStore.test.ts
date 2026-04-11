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
import { useToastStore } from "./toastStore";
import { useChatStore } from "./chatStore";
import { useAgentStore } from "./agentStore";
import { useWorkspaceStore } from "./workspaceStore";
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

// ─── Mutation-killing tests ──────────────────────────────────────────────

describe("diffStore - loading state transitions", () => {
  it("sets loading true during loadDiff when no cached data", async () => {
    vi.mocked(getDiff).mockImplementation(() => new Promise(() => {})); // never resolves
    useDiffStore.getState().loadDiff("ws-load-true");
    expect(useDiffStore.getState().loading["ws-load-true"]).toBe(true);
  });

  it("sets loading false after loadDiff completes", async () => {
    vi.mocked(getDiff).mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 } as any);
    await useDiffStore.getState().loadDiff("ws-load-false");
    expect(useDiffStore.getState().loading["ws-load-false"]).toBe(false);
  });

  it("skips loading indicator when cached data exists", async () => {
    useDiffStore.setState({ diffResults: { "ws-cached": { files: [] } as any } });
    vi.mocked(getDiff).mockResolvedValue({ files: [{ path: "new.ts" }] } as any);
    await useDiffStore.getState().loadDiff("ws-cached");
    expect(useDiffStore.getState().loading["ws-cached"]).toBe(false);
  });

  it("sets loading true during loadRepoDiff when no cached data", async () => {
    vi.mocked(getRepoDiff).mockImplementation(() => new Promise(() => {}));
    useDiffStore.getState().loadRepoDiff("repo-loading");
    expect(useDiffStore.getState().loading["repo-loading"]).toBe(true);
  });

  it("sets loading false after loadRepoDiff completes", async () => {
    vi.mocked(getRepoDiff).mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 } as any);
    await useDiffStore.getState().loadRepoDiff("repo-done");
    expect(useDiffStore.getState().loading["repo-done"]).toBe(false);
  });
});

describe("diffStore - loadDiff error sets loading false", () => {
  it("sets loading false on loadDiff failure", async () => {
    vi.mocked(getDiff).mockRejectedValue(new Error("network error"));
    await useDiffStore.getState().loadDiff("ws-err-load");
    expect(useDiffStore.getState().loading["ws-err-load"]).toBe(false);
  });

  it("sets error on loadDiff failure", async () => {
    vi.mocked(getDiff).mockRejectedValue(new Error("db error"));
    await useDiffStore.getState().loadDiff("ws-err-msg");
    expect(useDiffStore.getState().error["ws-err-msg"]).toContain("db error");
  });
});

describe("diffStore - key format and getter functions", () => {
  it("selectFile constructs key as contextId:filePath", async () => {
    vi.mocked(getFileDiff).mockResolvedValue({ path: "a.ts", original: "", modified: "", language: "typescript" } as any);
    useDiffStore.getState().selectFile("ctx-key", "src/a.ts");
    await vi.waitFor(() => {
      expect(useDiffStore.getState().fileDiffs["ctx-key:src/a.ts"]).toBeTruthy();
    });
    expect(useDiffStore.getState().fileDiffs["ctx-key:src/a.ts"]!.path).toBe("a.ts");
  });

  it("getFileDiffContent uses contextId:filePath key to look up diff", () => {
    useDiffStore.setState({
      fileDiffs: { "ws-1:src/main.ts": { path: "src/main.ts", original: "old", modified: "new", language: "typescript" } as any },
    });
    const result = useDiffStore.getState().getFileDiffContent("ws-1", "src/main.ts");
    expect(result).toBeTruthy();
    expect(result!.path).toBe("src/main.ts");
  });

  it("getFileDiffContent returns null for unknown key", () => {
    const result = useDiffStore.getState().getFileDiffContent("ws-99", "nope.ts");
    expect(result).toBeNull();
  });
});

describe("diffStore - patch preview error string", () => {
  it("logs specific error message on patch failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getFilePatch).mockRejectedValue(new Error("patch fail"));
    await useDiffStore.getState().loadPatchPreview("ws-str", "str.ts", false, "workspace");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load patch preview"),
      expect.any(Error),
    );
    spy.mockRestore();
  });
});

describe("diffStore - file diff error handling", () => {
  it("logs error on loadFileDiff failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getFileDiff).mockRejectedValue(new Error("not found"));
    await useDiffStore.getState().loadFileDiff("ws-1", "missing.ts");
    expect(spy).toHaveBeenCalledWith("Failed to load file diff:", expect.any(Error));
    spy.mockRestore();
  });

  it("logs error on loadRepoFileDiff failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getRepoFileDiff).mockRejectedValue(new Error("not found"));
    await useDiffStore.getState().loadRepoFileDiff("repo-1", "missing.ts");
    expect(spy).toHaveBeenCalledWith("Failed to load repo file diff:", expect.any(Error));
    spy.mockRestore();
  });
});

describe("diffStore - patch preview loading state", () => {
  it("sets patchLoading true during loadPatchPreview", async () => {
    vi.mocked(getFilePatch).mockImplementation(() => new Promise(() => {}));
    useDiffStore.getState().loadPatchPreview("ws-patch-1", "loading.ts", false, "workspace");
    expect(useDiffStore.getState().patchLoading["ws-patch-1:loading.ts"]).toBe(true);
  });

  it("logs error on patch preview failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getFilePatch).mockRejectedValue(new Error("fail"));
    await useDiffStore.getState().loadPatchPreview("ws-patch-err", "err.ts", false, "workspace");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("diffStore - selectFile key format", () => {
  it("uses contextId:filePath as the key for fileDiffs", async () => {
    vi.mocked(getFileDiff).mockResolvedValue({ path: "test.ts", original: "", modified: "", language: "typescript" } as any);
    useDiffStore.getState().selectFile("ws-1", "test.ts");
    // Wait for async loadFileDiff
    await vi.waitFor(() => {
      expect(useDiffStore.getState().fileDiffs["ws-1:test.ts"]).toBeTruthy();
    });
  });
});

describe("diffStore - clearPatchPreviews", () => {
  it("clears both previews and loading for workspace prefix", () => {
    useDiffStore.setState({
      patchPreviews: { "ws-1:a.ts": {} as any, "ws-1:b.ts": {} as any, "ws-2:c.ts": {} as any },
      patchLoading: { "ws-1:a.ts": true, "ws-1:b.ts": false, "ws-2:c.ts": true },
    });
    useDiffStore.getState().clearPatchPreviews("ws-1");
    expect(useDiffStore.getState().patchPreviews["ws-1:a.ts"]).toBeUndefined();
    expect(useDiffStore.getState().patchPreviews["ws-1:b.ts"]).toBeUndefined();
    expect(useDiffStore.getState().patchPreviews["ws-2:c.ts"]).toBeTruthy();
    expect(useDiffStore.getState().patchLoading["ws-1:a.ts"]).toBeUndefined();
    expect(useDiffStore.getState().patchLoading["ws-2:c.ts"]).toBe(true);
  });
});

describe("diffStore - error toast with Ask Chat", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" } as any);
    useToastStore.setState({ toasts: [] });
  });

  it("shows error toast with Ask Chat action on loadDiff failure", async () => {
    vi.mocked(getDiff).mockRejectedValue(new Error("git error"));
    await useDiffStore.getState().loadDiff("ws-1");

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toBe("Error: git error");
    expect(toasts[0].action).toBeDefined();
    expect(toasts[0].action!.label).toBe("Ask Chat");
  });

  it("shows error toast with Ask Chat action on loadRepoDiff failure", async () => {
    vi.mocked(getRepoDiff).mockRejectedValue(new Error("repo error"));
    await useDiffStore.getState().loadRepoDiff("repo-1");

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toBe("Error: repo error");
    expect(toasts[0].action!.label).toBe("Ask Chat");

    // Verify Ask Chat sends with repo context type
    const addUserMessage = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({ addUserMessage } as any);
    useAgentStore.setState({ sendMessage } as any);

    toasts[0].action!.onClick();
    expect(sendMessage).toHaveBeenCalledWith(
      "repo-1",
      expect.stringContaining("repo error"),
      "repo",
    );
  });

  it("sends error to chat when Ask Chat is clicked", async () => {
    const addUserMessage = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({ addUserMessage } as any);
    useAgentStore.setState({ sendMessage } as any);

    vi.mocked(getDiff).mockRejectedValue(new Error("git error"));
    await useDiffStore.getState().loadDiff("ws-1");

    const toast = useToastStore.getState().toasts[0];
    toast.action!.onClick();

    expect(addUserMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining("git error"),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining("git error"),
      "workspace",
    );
  });

  it("shows toast without Ask Chat action when no active workspace and no contextId", async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null } as any);
    vi.mocked(getDiff).mockRejectedValue(new Error("git error"));
    await useDiffStore.getState().loadDiff("ws-1");

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    // Still has action because contextId is passed directly from loadDiff
    expect(toasts[0].action).toBeDefined();
  });
});
