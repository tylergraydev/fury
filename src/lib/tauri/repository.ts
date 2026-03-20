import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { Repository } from "./types";

// Repository commands
export async function addRepository(path: string): Promise<Repository> {
  return invoke<Repository>("add_repository", { path });
}

export async function removeRepository(repoId: string): Promise<void> {
  return invoke("remove_repository", { repoId });
}

export async function listRepositories(): Promise<Repository[]> {
  return invoke<Repository[]>("list_repositories");
}

export async function listBranches(repoId: string): Promise<string[]> {
  return invoke<string[]>("list_branches", { repoId });
}

export async function cloneRepository(
  url: string,
  path: string,
): Promise<Repository> {
  return invoke<Repository>("clone_repository", { url, path });
}

export async function initRepository(
  path: string,
  name: string,
): Promise<Repository> {
  return invoke<Repository>("init_repository", { path, name });
}

// Sparse checkout commands
export async function listRepoDirectories(
  repoId: string,
  depth?: number,
): Promise<string[]> {
  return invoke<string[]>("list_repo_directories", { repoId, depth });
}

export async function updateSparseDirs(
  workspaceId: string,
  dirs: string[],
): Promise<void> {
  return invoke("update_sparse_dirs", { workspaceId, dirs });
}

// Git log command
export async function getGitLog(
  workspaceId: string,
  maxCount?: number,
): Promise<import("./types").GitLogEntry[]> {
  return invoke<import("./types").GitLogEntry[]>("get_git_log", { workspaceId, maxCount });
}

// Repo-scoped file listing
export async function listRepoFiles(repoId: string): Promise<string[]> {
  return invoke<string[]>("list_repo_files", { repoId });
}
