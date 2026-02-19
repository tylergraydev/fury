import { invoke } from "@tauri-apps/api/core";

// Repository types
export interface Repository {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  currentBranch: string | null;
}

// Workspace types
export interface WorkspaceInfo {
  id: string;
  repoId: string;
  name: string;
  branch: string;
  status: WorkspaceStatus;
  portBase: number;
  createdAt: string;
}

export type WorkspaceStatus =
  | "Creating"
  | "Active"
  | "Archived"
  | { Error: string };

export interface CreateWorkspaceRequest {
  repoId: string;
  workspaceName: string;
  branchName: string;
  sparseDirs?: string[];
}

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

// Agent types
export type AgentStatus =
  | "Idle"
  | "Running"
  | "Stopping"
  | { Error: string };

export interface AgentInfo {
  workspaceId: string;
  sessionId: string | null;
  status: AgentStatus;
  startedAt: string | null;
}

export interface SendMessageRequest {
  workspaceId?: string;
  repoId?: string;
  message: string;
}

export interface AgentStatusEvent {
  workspaceId: string;
  status: AgentStatus;
}

// Stream event types from Claude Code
export type FrontendStreamEvent =
  | { type: "system"; sessionId: string | null; message: string | null }
  | { type: "assistantText"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolUseId: string; content: string }
  | { type: "result"; isError: boolean; result: string | null; sessionId: string | null };

// Chat types
export type MessageRole = "user" | "assistant" | "system";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolUseId: string; content: string };

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: number;
}

// Agent commands
export async function sendMessage(request: SendMessageRequest): Promise<void> {
  return invoke("send_message", { request });
}

export async function stopAgent(workspaceId: string): Promise<void> {
  return invoke("stop_agent", { workspaceId });
}

export async function getAgentStatus(workspaceId: string): Promise<AgentInfo> {
  return invoke<AgentInfo>("get_agent_status", { workspaceId });
}

export async function clearSession(workspaceId: string): Promise<void> {
  return invoke("clear_session", { workspaceId });
}

// Checkpoint types
export interface Checkpoint {
  id: string;
  workspaceId: string;
  sessionId: string;
  turnIndex: number;
  refName: string;
  treeSha: string;
  commitSha: string;
  createdAt: string;
  userMessage: string;
}

// Diff types
export interface DiffResult {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface FileDiff {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export type FileStatus =
  | "Added"
  | "Modified"
  | "Deleted"
  | { Renamed: { from: string } }
  | "Untracked";

export interface FileDiffContent {
  path: string;
  original: string;
  modified: string;
  language: string;
}

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
