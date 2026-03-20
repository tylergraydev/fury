import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { DiffResult, FileDiffContent, FilePatchPreview, Checkpoint } from "./types";

// Checkpoint commands
export async function listCheckpoints(
  workspaceId: string,
): Promise<Checkpoint[]> {
  return invoke<Checkpoint[]>("list_checkpoints", { workspaceId });
}

export async function revertToCheckpoint(
  workspaceId: string,
  checkpointId: string,
): Promise<void> {
  return invoke("revert_to_checkpoint", { workspaceId, checkpointId });
}

// Diff commands
export async function getDiff(workspaceId: string): Promise<DiffResult> {
  return invoke<DiffResult>("get_diff", { workspaceId });
}

export async function getFileDiff(
  workspaceId: string,
  filePath: string,
): Promise<FileDiffContent> {
  return invoke<FileDiffContent>("get_file_diff", { workspaceId, filePath });
}

// Repo-scoped diff commands
export async function getRepoDiff(repoId: string): Promise<DiffResult> {
  return invoke<DiffResult>("get_repo_diff", { repoId });
}

export async function getRepoFileDiff(
  repoId: string,
  filePath: string,
): Promise<FileDiffContent> {
  return invoke<FileDiffContent>("get_repo_file_diff", { repoId, filePath });
}

// Patch preview commands (lightweight diff for hover)
export async function getFilePatch(
  workspaceId: string,
  filePath: string,
  isUntracked?: boolean,
): Promise<FilePatchPreview> {
  return invoke<FilePatchPreview>("get_file_patch", {
    workspaceId,
    filePath,
    isUntracked,
  });
}

export async function getRepoFilePatch(
  repoId: string,
  filePath: string,
  isUntracked?: boolean,
): Promise<FilePatchPreview> {
  return invoke<FilePatchPreview>("get_repo_file_patch", {
    repoId,
    filePath,
    isUntracked,
  });
}

// Diff file watcher commands
export async function startDiffWatcher(
  contextId: string,
  contextType: "workspace" | "repo",
): Promise<void> {
  return invoke("start_diff_watcher", { contextId, contextType });
}

export async function stopDiffWatcher(contextId: string): Promise<void> {
  return invoke("stop_diff_watcher", { contextId });
}

// Cross-worktree diff
export async function crossWorktreeDiff(
  workspaceId: string,
  linkedWorkspaceId: string,
): Promise<DiffResult> {
  return invoke<DiffResult>("cross_worktree_diff", {
    workspaceId,
    linkedWorkspaceId,
  });
}

export async function getCrossWorktreeFileDiff(
  workspaceId: string,
  linkedWorkspaceId: string,
  filePath: string,
): Promise<FileDiffContent> {
  return invoke<FileDiffContent>("get_cross_worktree_file_diff", {
    workspaceId,
    linkedWorkspaceId,
    filePath,
  });
}
