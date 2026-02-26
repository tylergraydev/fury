import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listWorkspaceFiles: vi.fn(),
  listRepoFiles: vi.fn(),
}));

import { useFileTreeStore } from "./fileTreeStore";
import { listWorkspaceFiles, listRepoFiles } from "../lib/tauri";

beforeEach(() => {
  useFileTreeStore.setState(
    { files: {}, expandedDirs: {}, loading: {}, error: {} },
  );
  vi.clearAllMocks();
});

describe("fileTreeStore - loadFiles", () => {
  it("loads workspace files and clears loading", async () => {
    const files = ["src/main.ts", "src/app.ts"];
    vi.mocked(listWorkspaceFiles).mockResolvedValue(files);
    await useFileTreeStore.getState().loadFiles("ws-1");
    expect(useFileTreeStore.getState().files["ws-1"]).toEqual(files);
    expect(useFileTreeStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(listWorkspaceFiles).mockRejectedValue(new Error("fail"));
    await useFileTreeStore.getState().loadFiles("ws-1");
    expect(useFileTreeStore.getState().error["ws-1"]).toBe("Error: fail");
    expect(useFileTreeStore.getState().loading["ws-1"]).toBe(false);
  });

  it("shows loading spinner on first load only", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["a.ts"]);
    // First load: loading should be true
    const promise1 = useFileTreeStore.getState().loadFiles("ws-1");
    expect(useFileTreeStore.getState().loading["ws-1"]).toBe(true);
    await promise1;

    // Second load: loading should stay false (cached data shown)
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["a.ts", "b.ts"]);
    const promise2 = useFileTreeStore.getState().loadFiles("ws-1");
    expect(useFileTreeStore.getState().loading["ws-1"]).toBe(false);
    await promise2;
    expect(useFileTreeStore.getState().files["ws-1"]).toEqual(["a.ts", "b.ts"]);
  });

  it("suppresses error when cached data exists", async () => {
    vi.mocked(listWorkspaceFiles).mockResolvedValue(["a.ts"]);
    await useFileTreeStore.getState().loadFiles("ws-1");

    vi.mocked(listWorkspaceFiles).mockRejectedValue(new Error("network"));
    await useFileTreeStore.getState().loadFiles("ws-1");
    expect(useFileTreeStore.getState().error["ws-1"]).toBeNull();
    expect(useFileTreeStore.getState().files["ws-1"]).toEqual(["a.ts"]);
  });
});

describe("fileTreeStore - loadFiles inflight dedup", () => {
  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(listWorkspaceFiles).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useFileTreeStore.getState().loadFiles("ws-1");
    const p2 = useFileTreeStore.getState().loadFiles("ws-1");
    resolve!(["a.ts"]);
    await Promise.all([p1, p2]);
    expect(listWorkspaceFiles).toHaveBeenCalledTimes(1);
  });
});

describe("fileTreeStore - loadRepoFiles", () => {
  it("loads repo files", async () => {
    const files = ["Cargo.toml", "src/main.rs"];
    vi.mocked(listRepoFiles).mockResolvedValue(files);
    await useFileTreeStore.getState().loadRepoFiles("repo-1");
    expect(useFileTreeStore.getState().files["repo-1"]).toEqual(files);
    expect(listRepoFiles).toHaveBeenCalledWith("repo-1");
  });

  it("sets error on failure", async () => {
    vi.mocked(listRepoFiles).mockRejectedValue(new Error("repo fail"));
    await useFileTreeStore.getState().loadRepoFiles("repo-1");
    expect(useFileTreeStore.getState().error["repo-1"]).toBe(
      "Error: repo fail",
    );
  });
});

describe("fileTreeStore - loadRepoFiles inflight dedup", () => {
  it("deduplicates concurrent calls", async () => {
    let resolve: (v: any) => void;
    vi.mocked(listRepoFiles).mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const p1 = useFileTreeStore.getState().loadRepoFiles("repo-1");
    const p2 = useFileTreeStore.getState().loadRepoFiles("repo-1");
    resolve!(["main.rs"]);
    await Promise.all([p1, p2]);
    expect(listRepoFiles).toHaveBeenCalledTimes(1);
  });

  it("suppresses error when cached data exists", async () => {
    vi.mocked(listRepoFiles).mockResolvedValue(["main.rs"]);
    await useFileTreeStore.getState().loadRepoFiles("repo-1");

    vi.mocked(listRepoFiles).mockRejectedValue(new Error("net"));
    await useFileTreeStore.getState().loadRepoFiles("repo-1");
    expect(useFileTreeStore.getState().error["repo-1"]).toBeNull();
  });
});

describe("fileTreeStore - toggleDir", () => {
  it("expands a collapsed directory", () => {
    useFileTreeStore.getState().toggleDir("ws-1", "src");
    const expanded = useFileTreeStore.getState().expandedDirs["ws-1"];
    expect(expanded?.has("src")).toBe(true);
  });

  it("collapses an expanded directory", () => {
    useFileTreeStore.setState({
      expandedDirs: { "ws-1": new Set(["src"]) },
    });
    useFileTreeStore.getState().toggleDir("ws-1", "src");
    const expanded = useFileTreeStore.getState().expandedDirs["ws-1"];
    expect(expanded?.has("src")).toBe(false);
  });

  it("preserves other expanded dirs when toggling", () => {
    useFileTreeStore.setState({
      expandedDirs: { "ws-1": new Set(["src", "lib"]) },
    });
    useFileTreeStore.getState().toggleDir("ws-1", "src");
    const expanded = useFileTreeStore.getState().expandedDirs["ws-1"];
    expect(expanded?.has("src")).toBe(false);
    expect(expanded?.has("lib")).toBe(true);
  });
});
