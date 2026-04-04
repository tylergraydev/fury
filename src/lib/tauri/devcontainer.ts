import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { ContainerState, DevContainerConfig } from "./bindings.generated";

// Dev Container commands
export async function startContainer(
  workspaceId: string,
): Promise<ContainerState> {
  return invoke<ContainerState>("start_container", { workspaceId });
}

export async function stopContainer(workspaceId: string): Promise<void> {
  return invoke("stop_container", { workspaceId });
}

export async function rebuildContainer(
  workspaceId: string,
): Promise<ContainerState> {
  return invoke<ContainerState>("rebuild_container", { workspaceId });
}

export async function getContainerStatus(
  workspaceId: string,
): Promise<ContainerState> {
  return invoke<ContainerState>("get_container_status", { workspaceId });
}

export async function updateDevcontainerConfig(
  workspaceId: string,
  config: DevContainerConfig,
): Promise<void> {
  return invoke("update_devcontainer_config", { workspaceId, config });
}

export async function detectDevcontainer(
  repoId: string,
): Promise<string | null> {
  return invoke<string | null>("detect_devcontainer", { repoId });
}

export async function containerizeRepo(
  workspaceId: string,
): Promise<string> {
  return invoke<string>("containerize_repo", { workspaceId });
}

export async function applyDevcontainerConfig(
  workspaceId: string,
  configJson: string,
  commitToRepo: boolean,
  devcontainerPath?: string,
): Promise<void> {
  return invoke("apply_devcontainer_config", {
    workspaceId,
    configJson,
    commitToRepo,
    devcontainerPath: devcontainerPath ?? null,
  });
}
