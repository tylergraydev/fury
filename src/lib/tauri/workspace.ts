import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type { CreateWorkspaceRequest, WorkspaceInfo, ExportOptions } from "./bindings.generated";

// Workspace commands
export async function createWorkspace(
  request: CreateWorkspaceRequest,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("create_workspace", { request });
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  return invoke<WorkspaceInfo[]>("list_workspaces");
}

export async function archiveWorkspace(workspaceId: string): Promise<void> {
  return invoke("archive_workspace", { workspaceId });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invoke("delete_workspace", { workspaceId });
}

// Workspace file listing
export async function listWorkspaceFiles(
  workspaceId: string,
): Promise<string[]> {
  return invoke<string[]>("list_workspace_files", { workspaceId });
}

// Archived workspace commands
export async function listArchivedWorkspaces(): Promise<WorkspaceInfo[]> {
  return invoke<WorkspaceInfo[]>("list_archived_workspaces");
}

export async function restoreWorkspace(
  workspaceId: string,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("restore_workspace", { workspaceId });
}

// Workspace notes and rename commands
export async function updateWorkspaceNotes(
  workspaceId: string,
  notes: string,
): Promise<void> {
  return invoke("update_workspace_notes", { workspaceId, notes });
}

export async function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<void> {
  return invoke("rename_workspace", { workspaceId, name });
}

export async function setWorkspacePinned(
  workspaceId: string,
  pinned: boolean,
): Promise<void> {
  return invoke("set_workspace_pinned", { workspaceId, pinned });
}

// Workspace linking commands
export async function linkWorkspaces(
  workspaceId: string,
  linkedWorkspaceId: string,
): Promise<void> {
  return invoke("link_workspaces", { workspaceId, linkedWorkspaceId });
}

export async function unlinkWorkspaces(
  workspaceId: string,
  linkedWorkspaceId: string,
): Promise<void> {
  return invoke("unlink_workspaces", { workspaceId, linkedWorkspaceId });
}

export async function getLinkedWorkspaces(
  workspaceId: string,
): Promise<string[]> {
  return invoke<string[]>("get_linked_workspaces", { workspaceId });
}

// Spotlight commands
export async function startSpotlight(
  workspaceId: string,
): Promise<void> {
  return invoke("start_spotlight", { workspaceId });
}

export async function stopSpotlight(
  workspaceId: string,
): Promise<void> {
  return invoke("stop_spotlight", { workspaceId });
}

// Export
export async function exportWorkspace(
  options: ExportOptions,
): Promise<string> {
  return invoke<string>("export_workspace", { options });
}

// Todo commands
export async function addTodo(request: import("./bindings.generated").CreateTodoRequest): Promise<import("./bindings.generated").TodoItem> {
  return invoke<import("./bindings.generated").TodoItem>("add_todo", { request });
}

export async function updateTodo(request: import("./bindings.generated").UpdateTodoRequest): Promise<void> {
  return invoke("update_todo", { request });
}

export async function deleteTodo(todoId: string): Promise<void> {
  return invoke("delete_todo", { todoId });
}

export async function listTodos(workspaceId: string): Promise<import("./bindings.generated").TodoItem[]> {
  return invoke<import("./bindings.generated").TodoItem[]>("list_todos", { workspaceId });
}

export async function toggleTodo(todoId: string): Promise<boolean> {
  return invoke<boolean>("toggle_todo", { todoId });
}

export async function reorderTodos(
  request: import("./bindings.generated").ReorderTodosRequest,
): Promise<void> {
  return invoke("reorder_todos", { request });
}

export async function getTodoSummary(
  workspaceId: string,
): Promise<import("./bindings.generated").TodoSummary> {
  return invoke<import("./bindings.generated").TodoSummary>("get_todo_summary", { workspaceId });
}
