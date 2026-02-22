import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getDiff: vi.fn(),
  getFileDiff: vi.fn(),
  getRepoDiff: vi.fn(),
  getRepoFileDiff: vi.fn(),
}));

import { useDiffStore } from "./diffStore";
import {
  getDiff,
  getFileDiff,
  getRepoDiff,
  getRepoFileDiff,
} from "../lib/tauri";

beforeEach(() => {
  useDiffStore.setState(
    {
      diffResults: {},
      fileDiffs: {},
      selectedFile: {},
      loading: false,
      error: null,
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
    expect(useDiffStore.getState().loading).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(getDiff).mockRejectedValue(new Error("fail"));
    await useDiffStore.getState().loadDiff("ws-1");
    expect(useDiffStore.getState().error).toBe("Error: fail");
  });
});

describe("diffStore - loadFileDiff", () => {
  it("loads file diff content", async () => {
    const content = { before: "old", after: "new" };
    vi.mocked(getFileDiff).mockResolvedValue(content as any);
    await useDiffStore.getState().loadFileDiff("ws-1", "src/a.ts");
    expect(useDiffStore.getState().fileDiffs["ws-1:src/a.ts"]).toEqual(content);
  });

  it("sets error on failure", async () => {
    vi.mocked(getFileDiff).mockRejectedValue(new Error("file fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useDiffStore.getState().loadFileDiff("ws-1", "src/a.ts");
    expect(useDiffStore.getState().error).toBe("Error: file fail");
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
    expect(useDiffStore.getState().error).toBe("Error: repo diff fail");
    expect(useDiffStore.getState().loading).toBe(false);
  });
});

describe("diffStore - loadRepoFileDiff", () => {
  it("loads repo file diff content", async () => {
    const content = { before: "old", after: "new" };
    vi.mocked(getRepoFileDiff).mockResolvedValue(content as any);
    await useDiffStore.getState().loadRepoFileDiff("repo-1", "main.rs");
    expect(useDiffStore.getState().fileDiffs["repo-1:main.rs"]).toEqual(content);
  });

  it("sets error on failure", async () => {
    vi.mocked(getRepoFileDiff).mockRejectedValue(new Error("repo file fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useDiffStore.getState().loadRepoFileDiff("repo-1", "main.rs");
    expect(useDiffStore.getState().error).toBe("Error: repo file fail");
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
