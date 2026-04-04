import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { RepoSettings } from "./bindings.generated";
import type { ScriptKind } from "./types";

// Script commands
export async function runScript(
  workspaceId: string,
  scriptKind: ScriptKind,
): Promise<void> {
  return invoke("run_script", { workspaceId, scriptKind });
}

export async function stopScript(
  workspaceId: string,
  scriptKind: ScriptKind,
): Promise<void> {
  return invoke("stop_script", { workspaceId, scriptKind });
}

// Repo-scoped script commands
export async function runRepoScript(
  repoId: string,
  scriptKind: ScriptKind,
): Promise<void> {
  return invoke("run_repo_script", { repoId, scriptKind });
}

export async function stopRepoScript(
  repoId: string,
  scriptKind: ScriptKind,
): Promise<void> {
  return invoke("stop_repo_script", { repoId, scriptKind });
}

export async function getRepoSettings(
  repoId: string,
): Promise<RepoSettings> {
  return invoke<RepoSettings>("get_repo_settings", { repoId });
}

export async function updateRepoSettings(
  repoId: string,
  settings: RepoSettings,
): Promise<void> {
  return invoke("update_repo_settings", { repoId, settings });
}
