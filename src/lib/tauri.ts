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
  autoCommit: boolean;
  createdAt: string;
  archivedAt: string | null;
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
  baseBranch?: string;
  autoCommit?: boolean;
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
  model?: string;
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
  | { type: "result"; isError: boolean; result: string | null; sessionId: string | null }
  | { type: "permissionRequest"; toolName: string; input: unknown };

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

// Persisted chat message (matches backend ChatMessage with ISO timestamp)
export interface PersistedChatMessage {
  id: string;
  workspaceId: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: string; // ISO 8601
}

export function toPersisted(
  msg: ChatMessage,
  workspaceId: string,
): PersistedChatMessage {
  return {
    id: msg.id,
    workspaceId,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp).toISOString(),
  };
}

export function fromPersisted(msg: PersistedChatMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp).getTime(),
  };
}

// Chat persistence commands
export async function saveChatMessage(
  message: PersistedChatMessage,
): Promise<void> {
  return invoke("save_chat_message", { message });
}

export async function listChatMessages(
  workspaceId: string,
): Promise<PersistedChatMessage[]> {
  return invoke<PersistedChatMessage[]>("list_chat_messages", { workspaceId });
}

export async function clearChatMessages(
  workspaceId: string,
): Promise<void> {
  return invoke("clear_chat_messages", { workspaceId });
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

export async function respondToPermission(
  workspaceId: string,
  approved: boolean,
): Promise<void> {
  return invoke("respond_to_permission", { workspaceId, approved });
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

// Workspace file listing
export async function listWorkspaceFiles(
  workspaceId: string,
): Promise<string[]> {
  return invoke<string[]>("list_workspace_files", { workspaceId });
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

// File content reading
export interface FileContent {
  content: string;
  language: string;
}

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

// Type definitions for Monaco language services
export interface TypeDefFile {
  filePath: string;
  content: string;
}

export interface TypeDefinitions {
  tsconfig: string | null;
  libs: TypeDefFile[];
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
export interface WriteFileResult {
  content: string;
  language: string;
  formatted: boolean;
}

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

// Repo-scoped file listing
export async function listRepoFiles(repoId: string): Promise<string[]> {
  return invoke<string[]>("list_repo_files", { repoId });
}

// Script types
export type ScriptKind = "setup" | "run" | "archive";

export interface ScriptOutputEvent {
  line: string;
  stream: "stdout" | "stderr";
}

export interface ScriptExitEvent {
  exitCode: number | null;
  success: boolean;
}

export interface RepoSettings {
  setupScript: string | null;
  runScript: string | null;
  archiveScript: string | null;
  runScriptMode: "concurrent" | "nonconcurrent";
  envVars: Record<string, string>;
  worktreeBasePath: string | null;
}

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

// Terminal commands
export async function createTerminal(
  workspaceId: string,
  cols: number,
  rows: number,
): Promise<string> {
  return invoke<string>("create_terminal", { workspaceId, cols, rows });
}

// Repo-scoped terminal command
export async function createRepoTerminal(
  repoId: string,
  cols: number,
  rows: number,
): Promise<string> {
  return invoke<string>("create_repo_terminal", { repoId, cols, rows });
}

export async function writeTerminal(
  terminalId: string,
  data: string,
): Promise<void> {
  return invoke("write_terminal", { terminalId, data });
}

export async function resizeTerminal(
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("resize_terminal", { terminalId, cols, rows });
}

export async function closeTerminal(terminalId: string): Promise<void> {
  return invoke("close_terminal", { terminalId });
}

// PR types
export interface PrInfo {
  workspaceId: string;
  prNumber: number | null;
  prUrl: string | null;
  title: string | null;
  state: string | null;
  checks: PrCheck[];
  mergeable: string | null;
}

export interface PrCheck {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
  description: string | null;
}

export interface CreatePrRequest {
  workspaceId: string;
  title: string;
  body: string;
  draft?: boolean;
}

export interface MergeResult {
  success: boolean;
  message: string;
  mergeMethod: string;
}

// PR commands
export async function createPr(request: CreatePrRequest): Promise<PrInfo> {
  return invoke<PrInfo>("create_pr", { request });
}

export async function getPrInfo(workspaceId: string): Promise<PrInfo> {
  return invoke<PrInfo>("get_pr_info", { workspaceId });
}

export async function getPrChecks(workspaceId: string): Promise<PrCheck[]> {
  return invoke<PrCheck[]>("get_pr_checks", { workspaceId });
}

export async function pushChanges(workspaceId: string): Promise<void> {
  return invoke("push_changes", { workspaceId });
}

export async function fixFailingChecks(workspaceId: string): Promise<string> {
  return invoke<string>("fix_failing_checks", { workspaceId });
}

export async function mergePr(
  workspaceId: string,
  mergeMethod?: string,
): Promise<MergeResult> {
  return invoke<MergeResult>("merge_pr", { workspaceId, mergeMethod });
}

// Todo types
export interface TodoItem {
  id: string;
  workspaceId: string;
  text: string;
  completed: boolean;
  sortOrder: number;
}

export interface CreateTodoRequest {
  workspaceId: string;
  text: string;
}

export interface UpdateTodoRequest {
  id: string;
  workspaceId: string;
  text?: string;
  completed?: boolean;
}

export interface ReorderTodosRequest {
  workspaceId: string;
  todoIds: string[];
}

export interface TodoSummary {
  total: number;
  completed: number;
  allCompleted: boolean;
  items: TodoItem[];
}

// Slash command types
export interface SlashCommand {
  name: string;
  source: "global" | "project" | "plugin" | "built-in";
  description: string;
  content: string;
}

// Todo commands
export async function addTodo(request: CreateTodoRequest): Promise<TodoItem> {
  return invoke<TodoItem>("add_todo", { request });
}

export async function updateTodo(request: UpdateTodoRequest): Promise<void> {
  return invoke("update_todo", { request });
}

export async function deleteTodo(todoId: string): Promise<void> {
  return invoke("delete_todo", { todoId });
}

export async function listTodos(workspaceId: string): Promise<TodoItem[]> {
  return invoke<TodoItem[]>("list_todos", { workspaceId });
}

export async function toggleTodo(todoId: string): Promise<boolean> {
  return invoke<boolean>("toggle_todo", { todoId });
}

export async function reorderTodos(
  request: ReorderTodosRequest,
): Promise<void> {
  return invoke("reorder_todos", { request });
}

export async function getTodoSummary(
  workspaceId: string,
): Promise<TodoSummary> {
  return invoke<TodoSummary>("get_todo_summary", { workspaceId });
}

// MCP types
export type McpScope = "user" | "project";

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  scope: McpScope;
}

export interface AddMcpRequest {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  scope: McpScope;
}

export interface RemoveMcpRequest {
  name: string;
  scope: McpScope;
}

export interface CursorMigrationResult {
  mcpServersFound: number;
  mcpServersImported: number;
  rulesFound: boolean;
}

// App settings types
export type ProviderType =
  | "Anthropic"
  | "OpenRouter"
  | "VercelAIGateway"
  | "Bedrock"
  | "Vertex"
  | "AzureFoundry"
  | "Custom";

export interface ProviderConfig {
  providerType: ProviderType;
  envVars: Record<string, string>;
}

export interface ExperimentalSettings {
  spotlightTesting: boolean;
  agentTeams: boolean;
  persistentProcesses: boolean;
  safeMode: boolean;
}

export interface CopilotSettings {
  enabled: boolean;
}

export interface AppSettings {
  theme: "blend" | "midnight" | "github";
  provider: ProviderConfig;
  systemPromptAdditions: string | null;
  analyticsEnabled: boolean;
  experimental: ExperimentalSettings;
  copilot: CopilotSettings;
}

// MCP commands
export async function listMcpServers(
  scope?: string,
): Promise<McpServer[]> {
  return invoke<McpServer[]>("list_mcp_servers", { scope });
}

export async function addMcpServer(
  request: AddMcpRequest,
): Promise<void> {
  return invoke("add_mcp_server", { request });
}

export async function removeMcpServer(
  request: RemoveMcpRequest,
): Promise<void> {
  return invoke("remove_mcp_server", { request });
}

export async function detectCursorConfig(): Promise<boolean> {
  return invoke<boolean>("detect_cursor_config");
}

export async function importCursorConfig(): Promise<CursorMigrationResult> {
  return invoke<CursorMigrationResult>("import_cursor_config");
}

// App settings commands
export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function updateAppSettings(
  settings: AppSettings,
): Promise<void> {
  return invoke("update_app_settings", { settings });
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

// Slash command commands
export async function listSlashCommands(
  contextId: string,
  contextType: "workspace" | "repo" = "workspace",
): Promise<SlashCommand[]> {
  return invoke<SlashCommand[]>("list_slash_commands", { contextId, contextType });
}

export async function getSlashCommandContent(
  workspaceId: string,
  name: string,
): Promise<SlashCommand | null> {
  return invoke<SlashCommand | null>("get_slash_command_content", {
    workspaceId,
    name,
  });
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

// Cursorrules conversion types
export interface CursorRulesImportResult {
  rulesFound: boolean;
  claudeMdExisted: boolean;
  written: boolean;
  claudeMdPath: string;
}

// Cursorrules commands
export async function detectCursorrules(
  repoId: string,
): Promise<boolean> {
  return invoke<boolean>("detect_cursorrules", { repoId });
}

export async function importCursorrules(
  repoId: string,
  overwrite: boolean,
): Promise<CursorRulesImportResult> {
  return invoke<CursorRulesImportResult>("import_cursorrules", {
    repoId,
    overwrite,
  });
}

// Git log types
export interface GitLogEntry {
  hash: string;
  fullHash: string;
  message: string;
  author: string;
  timestamp: string;
}

// Git log command
export async function getGitLog(
  workspaceId: string,
  maxCount?: number,
): Promise<GitLogEntry[]> {
  return invoke<GitLogEntry[]>("get_git_log", { workspaceId, maxCount });
}

// Merge/branch types
export interface BranchStatus {
  branch: string;
  defaultBranch: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

export interface PullResult {
  success: boolean;
  message: string;
  hasConflicts: boolean;
  conflictedFiles: string[];
}

export interface ConflictedFile {
  path: string;
  conflictType: ConflictType;
}

export type ConflictType =
  | "BothModified"
  | "DeletedByUs"
  | "DeletedByThem"
  | "AddedByBoth"
  | "BothDeleted"
  | "Unknown";

export interface ConflictContent {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  merged: string;
  language: string;
}

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
