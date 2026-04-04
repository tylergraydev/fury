import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type {
  BranchStatus,
  PullResult,
  ConflictedFile,
  ConflictContent,
  StashEntry,
  StashDetail,
} from "./bindings.generated";

// Merge/branch commands
export async function getBranchStatus(
  workspaceId: string,
): Promise<BranchStatus> {
  return invoke<BranchStatus>("get_branch_status", { workspaceId });
}

export async function fetchUpstream(workspaceId: string): Promise<void> {
  return invoke("fetch_upstream", { workspaceId });
}

export async function pullRebase(workspaceId: string): Promise<PullResult> {
  return invoke<PullResult>("pull_rebase", { workspaceId });
}

export async function pullMerge(workspaceId: string): Promise<PullResult> {
  return invoke<PullResult>("pull_merge", { workspaceId });
}

export async function pushWorkspace(workspaceId: string): Promise<void> {
  return invoke("push_workspace", { workspaceId });
}

export async function getConflictedFiles(
  workspaceId: string,
): Promise<ConflictedFile[]> {
  return invoke<ConflictedFile[]>("get_conflicted_files", { workspaceId });
}

export async function getConflictContent(
  workspaceId: string,
  filePath: string,
): Promise<ConflictContent> {
  return invoke<ConflictContent>("get_conflict_content", {
    workspaceId,
    filePath,
  });
}

export async function resolveConflict(
  workspaceId: string,
  filePath: string,
  strategy: string,
): Promise<void> {
  return invoke("resolve_conflict", { workspaceId, filePath, strategy });
}

export async function abortMerge(workspaceId: string): Promise<void> {
  return invoke("abort_merge_cmd", { workspaceId });
}

export async function continueMerge(workspaceId: string): Promise<void> {
  return invoke("continue_merge", { workspaceId });
}

// Stash commands
export async function listStashes(
  workspaceId: string,
): Promise<StashEntry[]> {
  return invoke<StashEntry[]>("list_stashes", { workspaceId });
}

export async function createStash(
  workspaceId: string,
  message?: string,
  includeUntracked?: boolean,
): Promise<StashEntry> {
  return invoke<StashEntry>("create_stash", {
    workspaceId,
    message,
    includeUntracked,
  });
}

export async function applyStash(
  workspaceId: string,
  index: number,
): Promise<void> {
  return invoke("apply_stash", { workspaceId, index });
}

export async function popStash(
  workspaceId: string,
  index: number,
): Promise<void> {
  return invoke("pop_stash", { workspaceId, index });
}

export async function dropStash(
  workspaceId: string,
  index: number,
): Promise<void> {
  return invoke("drop_stash", { workspaceId, index });
}

export async function showStash(
  workspaceId: string,
  index: number,
): Promise<StashDetail> {
  return invoke<StashDetail>("show_stash", { workspaceId, index });
}
