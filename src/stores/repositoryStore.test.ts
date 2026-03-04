import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  listRepositories: vi.fn(),
  addRepository: vi.fn(),
  cloneRepository: vi.fn(),
  initRepository: vi.fn(),
  removeRepository: vi.fn(),
}));

import { useRepositoryStore } from "./repositoryStore";
import {
  listRepositories,
  addRepository,
  cloneRepository,
  initRepository,
  removeRepository,
  type Repository,
} from "../lib/tauri";

const makeRepo = (id = "repo-1"): Repository => ({
  id,
  name: "test-repo",
  path: "/path/to/repo",
  defaultBranch: "main",
  currentBranch: "main",
  provider: "git_hub" as const,
  remoteUrl: null,
});

beforeEach(() => {
  useRepositoryStore.setState(
    { repositories: [], loading: false, error: null },
  );
  vi.clearAllMocks();
});

describe("repositoryStore - loadRepositories", () => {
  it("loads repositories and clears loading", async () => {
    const repos = [makeRepo()];
    vi.mocked(listRepositories).mockResolvedValue(repos as any);
    await useRepositoryStore.getState().loadRepositories();
    expect(useRepositoryStore.getState().repositories).toEqual(repos);
    expect(useRepositoryStore.getState().loading).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(listRepositories).mockRejectedValue(new Error("fail"));
    await useRepositoryStore.getState().loadRepositories();
    expect(useRepositoryStore.getState().error).toBe("Error: fail");
    expect(useRepositoryStore.getState().loading).toBe(false);
  });
});

describe("repositoryStore - addRepo", () => {
  it("adds a repository to the list", async () => {
    const repo = makeRepo("repo-new");
    vi.mocked(addRepository).mockResolvedValue(repo as any);
    const result = await useRepositoryStore.getState().addRepo("/path");
    expect(result).toEqual(repo);
    expect(useRepositoryStore.getState().repositories).toContainEqual(repo);
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(addRepository).mockRejectedValue(new Error("add fail"));
    await expect(
      useRepositoryStore.getState().addRepo("/path"),
    ).rejects.toThrow("add fail");
    expect(useRepositoryStore.getState().error).toBe("Error: add fail");
  });
});

describe("repositoryStore - cloneRepo", () => {
  it("clones and adds to list", async () => {
    const repo = makeRepo("cloned");
    vi.mocked(cloneRepository).mockResolvedValue(repo as any);
    const result = await useRepositoryStore.getState().cloneRepo("url", "/p");
    expect(result).toEqual(repo);
    expect(cloneRepository).toHaveBeenCalledWith("url", "/p");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(cloneRepository).mockRejectedValue(new Error("clone fail"));
    await expect(
      useRepositoryStore.getState().cloneRepo("url", "/p"),
    ).rejects.toThrow("clone fail");
    expect(useRepositoryStore.getState().error).toBe("Error: clone fail");
  });
});

describe("repositoryStore - initRepo", () => {
  it("inits and adds to list", async () => {
    const repo = makeRepo("inited");
    vi.mocked(initRepository).mockResolvedValue(repo as any);
    const result = await useRepositoryStore
      .getState()
      .initRepo("/p", "my-repo");
    expect(result).toEqual(repo);
    expect(initRepository).toHaveBeenCalledWith("/p", "my-repo");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(initRepository).mockRejectedValue(new Error("init fail"));
    await expect(
      useRepositoryStore.getState().initRepo("/p", "my-repo"),
    ).rejects.toThrow("init fail");
    expect(useRepositoryStore.getState().error).toBe("Error: init fail");
  });
});

describe("repositoryStore - removeRepo", () => {
  it("removes a repository from the list", async () => {
    useRepositoryStore.setState({
      repositories: [makeRepo("r1"), makeRepo("r2")] as any,
    });
    vi.mocked(removeRepository).mockResolvedValue(undefined);
    await useRepositoryStore.getState().removeRepo("r1");
    expect(useRepositoryStore.getState().repositories).toHaveLength(1);
    expect(useRepositoryStore.getState().repositories[0].id).toBe("r2");
  });

  it("sets error on failure without throwing", async () => {
    vi.mocked(removeRepository).mockRejectedValue(new Error("rm fail"));
    useRepositoryStore.setState({
      repositories: [makeRepo()] as any,
    });
    await useRepositoryStore.getState().removeRepo("repo-1");
    expect(useRepositoryStore.getState().error).toBe("Error: rm fail");
  });
});
