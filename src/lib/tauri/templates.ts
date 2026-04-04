import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type {
  WorkspaceTemplate,
  CreateWorkspaceTemplateRequest,
  UpdateWorkspaceTemplateRequest,
  FileBookmark,
  CreateBookmarkRequest,
  UpdateBookmarkRequest,
  Prompt,
  CreatePromptRequest,
  UpdatePromptRequest,
  Snippet,
  CreateSnippetRequest,
  UpdateSnippetRequest,
} from "./bindings.generated";

// Workspace template commands
export async function createWorkspaceTemplate(
  request: CreateWorkspaceTemplateRequest,
): Promise<WorkspaceTemplate> {
  return invoke<WorkspaceTemplate>("create_workspace_template", { request });
}

export async function listWorkspaceTemplates(
  repoId: string,
): Promise<WorkspaceTemplate[]> {
  return invoke<WorkspaceTemplate[]>("list_workspace_templates", { repoId });
}

export async function updateWorkspaceTemplate(
  templateId: string,
  request: UpdateWorkspaceTemplateRequest,
): Promise<WorkspaceTemplate> {
  return invoke<WorkspaceTemplate>("update_workspace_template", {
    templateId,
    request,
  });
}

export async function deleteWorkspaceTemplate(
  templateId: string,
): Promise<void> {
  return invoke("delete_workspace_template", { templateId });
}

// File bookmark commands
export async function createBookmark(
  request: CreateBookmarkRequest,
): Promise<FileBookmark> {
  return invoke<FileBookmark>("create_bookmark", { request });
}

export async function listBookmarks(
  repoId: string,
): Promise<FileBookmark[]> {
  return invoke<FileBookmark[]>("list_bookmarks", { repoId });
}

export async function updateBookmark(
  bookmarkId: string,
  request: UpdateBookmarkRequest,
): Promise<FileBookmark> {
  return invoke<FileBookmark>("update_bookmark", { bookmarkId, request });
}

export async function deleteBookmark(
  bookmarkId: string,
): Promise<void> {
  return invoke("delete_bookmark", { bookmarkId });
}

export async function toggleBookmark(
  repoId: string,
  filePath: string,
  lineNumber: number,
): Promise<FileBookmark | null> {
  return invoke<FileBookmark | null>("toggle_bookmark", {
    repoId,
    filePath,
    lineNumber,
  });
}

// Prompt library commands
export async function createPrompt(
  request: CreatePromptRequest,
): Promise<Prompt> {
  return invoke<Prompt>("create_prompt", { request });
}

export async function listPrompts(): Promise<Prompt[]> {
  return invoke<Prompt[]>("list_prompts");
}

export async function updatePrompt(
  promptId: string,
  request: UpdatePromptRequest,
): Promise<Prompt> {
  return invoke<Prompt>("update_prompt", { promptId, request });
}

export async function deletePrompt(promptId: string): Promise<void> {
  return invoke("delete_prompt", { promptId });
}

// Snippet manager commands
export async function createSnippet(
  request: CreateSnippetRequest,
): Promise<Snippet> {
  return invoke<Snippet>("create_snippet", { request });
}

export async function listSnippets(): Promise<Snippet[]> {
  return invoke<Snippet[]>("list_snippets");
}

export async function updateSnippet(
  snippetId: string,
  request: UpdateSnippetRequest,
): Promise<Snippet> {
  return invoke<Snippet>("update_snippet", { snippetId, request });
}

export async function deleteSnippet(snippetId: string): Promise<void> {
  return invoke("delete_snippet", { snippetId });
}
