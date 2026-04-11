import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { FileContent, TypeDefinitions, WriteFileResult } from "./bindings.generated";

// File content reading
export async function readWorkspaceFile(
  workspaceId: string,
  filePath: string,
): Promise<FileContent> {
  return invoke<FileContent>("read_workspace_file", { workspaceId, filePath });
}

export async function readRepoFile(
  repoId: string,
  filePath: string,
): Promise<FileContent> {
  return invoke<FileContent>("read_repo_file", { repoId, filePath });
}

export async function readFileBase64(filePath: string): Promise<string> {
  return invoke<string>("read_file_base64", { filePath });
}

export async function saveClipboardImage(data: string, mimeType: string): Promise<string> {
  return invoke<string>("save_clipboard_image", { data, mimeType });
}

export async function loadTypeDefinitions(
  contextId: string,
  contextType: "workspace" | "repo",
): Promise<TypeDefinitions> {
  return invoke<TypeDefinitions>("load_type_definitions", {
    workspaceId: contextType === "workspace" ? contextId : undefined,
    repoId: contextType === "repo" ? contextId : undefined,
  });
}

// File content writing
export async function writeWorkspaceFile(
  workspaceId: string,
  filePath: string,
  content: string,
  formatOnSave: boolean = true,
): Promise<WriteFileResult> {
  return invoke<WriteFileResult>("write_workspace_file", {
    workspaceId,
    filePath,
    content,
    formatOnSave,
  });
}

export async function writeRepoFile(
  repoId: string,
  filePath: string,
  content: string,
  formatOnSave: boolean = true,
): Promise<WriteFileResult> {
  return invoke<WriteFileResult>("write_repo_file", {
    repoId,
    filePath,
    content,
    formatOnSave,
  });
}

// File/directory creation
export async function createWorkspaceFile(
  workspaceId: string,
  filePath: string,
): Promise<void> {
  return invoke<void>("create_workspace_file", { workspaceId, filePath });
}

export async function createRepoFile(
  repoId: string,
  filePath: string,
): Promise<void> {
  return invoke<void>("create_repo_file", { repoId, filePath });
}

export async function createWorkspaceDirectory(
  workspaceId: string,
  dirPath: string,
): Promise<void> {
  return invoke<void>("create_workspace_directory", { workspaceId, dirPath });
}

export async function createRepoDirectory(
  repoId: string,
  dirPath: string,
): Promise<void> {
  return invoke<void>("create_repo_directory", { repoId, dirPath });
}
