import { instrumentedInvoke as invoke } from "./ipcInstrumentation";

// Repository types
export interface Repository {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  currentBranch: string | null;
  provider: "git_hub" | "azure_dev_ops" | "unknown";
  remoteUrl: string | null;
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
  pinned: boolean;
  createdAt: string;
  archivedAt: string | null;
  devcontainerConfig?: DevContainerConfig | null;
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
  fetchRemoteBranch?: boolean;
  devcontainerConfig?: DevContainerConfig;
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
  disableThinking?: boolean;
  disablePlanMode?: boolean;
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
  | {
      type: "result";
      isError: boolean;
      result: string | null;
      sessionId: string | null;
      durationMs?: number;
      durationApiMs?: number;
      totalCostUsd?: number;
      numTurns?: number;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
    }
  | { type: "permissionRequest"; toolName: string; input: unknown }
  | { type: "assistantImage"; mediaType: string; data: string };

// Chat types
export type MessageRole = "user" | "assistant" | "system";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolUseId: string; content: string }
  | { type: "image"; mediaType: string; data: string };

export interface ResponseMetadata {
  durationMs?: number;
  durationApiMs?: number;
  totalCostUsd?: number;
  numTurns?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: number;
  displayText?: string;
  metadata?: ResponseMetadata;
}

// Persisted chat message (matches backend ChatMessage with ISO timestamp)
export interface PersistedChatMessage {
  id: string;
  workspaceId: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: string; // ISO 8601
  displayText?: string;
  metadata?: ResponseMetadata;
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
    ...(msg.displayText ? { displayText: msg.displayText } : {}),
    ...(msg.metadata ? { metadata: msg.metadata } : {}),
  };
}

export function fromPersisted(msg: PersistedChatMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp).getTime(),
    ...(msg.displayText ? { displayText: msg.displayText } : {}),
    ...(msg.metadata ? { metadata: msg.metadata } : {}),
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

// Chat search types
export interface ChatMessageSearchResult {
  messageId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  matchedText: string;
  timestamp: string;
}

export async function searchChatMessages(
  query: string,
  workspaceId?: string,
): Promise<ChatMessageSearchResult[]> {
  return invoke<ChatMessageSearchResult[]>("search_chat_messages", {
    query,
    workspaceId,
  });
}

// Agent commands
export async function sendMessage(request: SendMessageRequest): Promise<void> {
  return invoke("send_message", { request });
}

export async function sendFollowupMessage(
  workspaceId: string,
  message: string,
): Promise<void> {
  return invoke("send_followup_message", { workspaceId, message });
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

export interface FilePatchPreview {
  path: string;
  language: string;
  patch: string;
  truncated: boolean;
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

export async function saveClipboardImage(data: string, mimeType: string): Promise<string> {
  return invoke<string>("save_clipboard_image", { data, mimeType });
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
  providerOverride: ProviderConfig | null;
  devcontainer?: DevContainerConfig | null;
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

export interface PrComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  path: string | null;
  line: number | null;
}

export interface PrReview {
  id: number;
  author: string;
  state: string;
  body: string;
  submittedAt: string;
}

export async function getPrReviews(
  workspaceId: string,
): Promise<PrReview[]> {
  return invoke<PrReview[]>("get_pr_reviews", { workspaceId });
}

export async function getPrReviewComments(
  workspaceId: string,
): Promise<PrComment[]> {
  return invoke<PrComment[]>("get_pr_review_comments", { workspaceId });
}

export interface PrFullData {
  info: PrInfo;
  reviews: PrReview[];
  reviewComments: PrComment[];
}

export interface ReviewsAndComments {
  reviews: PrReview[];
  reviewComments: PrComment[];
}

export async function getPrFullData(
  workspaceId: string,
): Promise<PrFullData> {
  return invoke<PrFullData>("get_pr_full_data", { workspaceId });
}

export async function getReviewsAndComments(
  workspaceId: string,
): Promise<ReviewsAndComments> {
  return invoke<ReviewsAndComments>("get_reviews_and_comments", {
    workspaceId,
  });
}

// Workflow types
export interface WorkflowRun {
  id: number;
  name: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  event: string;
  createdAt: string;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface RunLogsResult {
  logs: string;
  truncated: boolean;
}

// Workflow commands
export async function getWorkflowRuns(
  workspaceId: string,
): Promise<WorkflowRun[]> {
  return invoke<WorkflowRun[]>("get_workflow_runs", { workspaceId });
}

export async function getRunJobs(
  workspaceId: string,
  runId: number,
): Promise<WorkflowJob[]> {
  return invoke<WorkflowJob[]>("get_run_jobs", { workspaceId, runId });
}

export async function getRunLogs(
  workspaceId: string,
  runId: number,
  failedOnly: boolean,
): Promise<RunLogsResult> {
  return invoke<RunLogsResult>("get_run_logs", {
    workspaceId,
    runId,
    failedOnly,
  });
}

export async function rerunWorkflow(
  workspaceId: string,
  runId: number,
  failedOnly: boolean,
): Promise<void> {
  return invoke("rerun_workflow", { workspaceId, runId, failedOnly });
}

// PR/Issue list types
export interface PrListItem {
  number: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  state: string;
  author: string;
  url: string;
}

export interface PrDetail {
  number: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  body: string;
  state: string;
  url: string;
}

export interface IssueListItem {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
}

export interface IssueDetail {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
}

// PR/Issue list commands
export async function listRepoPrs(repoId: string): Promise<PrListItem[]> {
  return invoke<PrListItem[]>("list_repo_prs", { repoId });
}

export async function listRepoIssues(
  repoId: string,
): Promise<IssueListItem[]> {
  return invoke<IssueListItem[]>("list_repo_issues", { repoId });
}

export async function getPrDetails(
  repoId: string,
  prNumber: number,
): Promise<PrDetail> {
  return invoke<PrDetail>("get_pr_details", { repoId, prNumber });
}

export async function getIssueDetails(
  repoId: string,
  issueNumber: number,
): Promise<IssueDetail> {
  return invoke<IssueDetail>("get_issue_details", { repoId, issueNumber });
}

// Linear types
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  stateName: string | null;
  priority: number | null;
  teamName: string | null;
  description: string | null;
}

export interface LinkIssueRequest {
  workspaceId: string;
  issueId: string;
  identifier: string;
  title: string;
  url: string;
}

export interface UnlinkIssueRequest {
  workspaceId: string;
  issueId: string;
}

export interface WorkspaceIssue {
  issueId: string;
  workspaceId: string;
  identifier: string;
  title: string;
  url: string;
  linkedAt: string;
}

// Linear commands
export async function searchLinearIssues(
  query: string,
): Promise<LinearIssue[]> {
  return invoke<LinearIssue[]>("search_linear_issues", { query });
}

export async function linkIssueToWorkspace(
  request: LinkIssueRequest,
): Promise<void> {
  return invoke("link_issue_to_workspace", { request });
}

export async function unlinkIssueFromWorkspace(
  request: UnlinkIssueRequest,
): Promise<void> {
  return invoke("unlink_issue_from_workspace", { request });
}

export async function getWorkspaceIssues(
  workspaceId: string,
): Promise<WorkspaceIssue[]> {
  return invoke<WorkspaceIssue[]>("get_workspace_issues", { workspaceId });
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

// LSP Plugin types
export interface LspCatalogEntry {
  pluginName: string;
  language: string;
  binaryName: string;
  extensions: string[];
  installHint: string;
}

export interface LspPlugin {
  name: string;
  scope: string;
  enabled: boolean;
  binaryFound: boolean;
  binaryName: string;
  installHint: string;
}

export interface InstallLspPluginRequest {
  pluginName: string;
  scope: string;
}

export interface UninstallLspPluginRequest {
  pluginName: string;
  scope: string;
}

export interface LspSuggestion {
  pluginName: string;
  language: string;
  fileCount: number;
  binaryName: string;
  installHint: string;
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

// Agent type
export type AgentType = "claude_code" | "codex_cli";

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

export interface LinearSettings {
  apiKey: string | null;
}

export interface AzureDevOpsSettings {
  pat: string | null;
  defaultOrg: string | null;
}

export interface ClaudeContextSettings {
  enabled: boolean;
  openaiApiKey: string | null;
  zillizUri: string | null;
  zillizToken: string | null;
}

export type IndexingState = "not_indexed" | "indexing" | "indexed" | "error";

export interface IndexingStatus {
  repoId: string;
  repoPath: string;
  status: IndexingState;
  error: string | null;
  lastIndexedAt: string | null;
}

export interface CustomTheme {
  id: string;
  name: string;
  vars: Record<string, string>;
  baseTheme?: string;
  createdAt: string;
}

export interface AppSettings {
  agentType: AgentType;
  theme: string;
  provider: ProviderConfig;
  systemPromptAdditions: string | null;
  analyticsEnabled: boolean;
  experimental: ExperimentalSettings;
  copilot: CopilotSettings;
  linear: LinearSettings;
  azureDevops: AzureDevOpsSettings;
  claudeContext: ClaudeContextSettings;
  customThemes?: CustomTheme[];
}

// LSP Plugin commands
export async function getLspCatalog(): Promise<LspCatalogEntry[]> {
  return invoke<LspCatalogEntry[]>("get_lsp_catalog");
}

export async function listLspPlugins(): Promise<LspPlugin[]> {
  return invoke<LspPlugin[]>("list_lsp_plugins");
}

export async function installLspPlugin(
  request: InstallLspPluginRequest,
): Promise<void> {
  return invoke("install_lsp_plugin", { request });
}

export async function uninstallLspPlugin(
  request: UninstallLspPluginRequest,
): Promise<void> {
  return invoke("uninstall_lsp_plugin", { request });
}

export async function detectLspSuggestions(
  repoPath: string,
): Promise<LspSuggestion[]> {
  return invoke<LspSuggestion[]>("detect_lsp_suggestions", { repoPath });
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

// Claude Context indexing commands
export async function indexRepository(repoId: string): Promise<void> {
  return invoke("index_repository", { repoId });
}

export async function getIndexingStatus(
  repoId: string,
): Promise<IndexingStatus> {
  return invoke<IndexingStatus>("get_indexing_status", { repoId });
}

export async function listIndexingStatuses(): Promise<IndexingStatus[]> {
  return invoke<IndexingStatus[]>("list_indexing_statuses");
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

export async function setWorkspacePinned(
  workspaceId: string,
  pinned: boolean,
): Promise<void> {
  return invoke("set_workspace_pinned", { workspaceId, pinned });
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

// Stash types
export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  timestamp: string;
}

export interface StashFileStat {
  path: string;
  additions: number;
  deletions: number;
}

export interface StashDetail {
  index: number;
  message: string;
  files: StashFileStat[];
  patch: string;
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

// Workspace template types
export interface WorkspaceTemplate {
  id: string;
  repoId: string;
  name: string;
  description: string | null;
  setupScript: string | null;
  runScript: string | null;
  archiveScript: string | null;
  runScriptMode: string;
  envVars: Record<string, string>;
  sparseDirs: string[] | null;
  autoCommit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceTemplateRequest {
  repoId: string;
  name: string;
  description?: string;
  setupScript?: string;
  runScript?: string;
  archiveScript?: string;
  runScriptMode?: string;
  envVars?: Record<string, string>;
  sparseDirs?: string[];
  autoCommit?: boolean;
}

export interface UpdateWorkspaceTemplateRequest {
  name?: string;
  description?: string;
  setupScript?: string;
  runScript?: string;
  archiveScript?: string;
  runScriptMode?: string;
  envVars?: Record<string, string>;
  sparseDirs?: string[];
  autoCommit?: boolean;
}

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

// File bookmark types
export interface FileBookmark {
  id: string;
  repoId: string;
  filePath: string;
  lineNumber: number;
  note: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookmarkRequest {
  repoId: string;
  filePath: string;
  lineNumber: number;
  note?: string;
  color?: string;
}

export interface UpdateBookmarkRequest {
  note?: string;
  color?: string;
  lineNumber?: number;
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

// Prompt library types
export interface Prompt {
  id: string;
  name: string;
  content: string;
  description: string | null;
  category: string | null;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptRequest {
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export interface UpdatePromptRequest {
  name?: string;
  content?: string;
  description?: string;
  category?: string;
  tags?: string[];
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

// Snippet manager types
export interface Snippet {
  id: string;
  title: string;
  content: string;
  language: string | null;
  description: string | null;
  tags: string[];
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSnippetRequest {
  title: string;
  content: string;
  language?: string;
  description?: string;
  tags?: string[];
  source?: string;
}

export interface UpdateSnippetRequest {
  title?: string;
  content?: string;
  language?: string;
  description?: string;
  tags?: string[];
  source?: string;
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

// Test runner types
export type TestFramework = "vitest" | "jest" | "pytest" | "cargotest" | "gotest" | "custom";
export type TestStatus = "passed" | "failed" | "skipped" | "running" | "pending";

export interface TestRunnerConfig {
  framework: TestFramework | null;
  testCommand: string | null;
  testFileCommand: string | null;
  workingDir: string | null;
  coverageCommand: string | null;
}

export interface TestResult {
  name: string;
  suite: string;
  status: TestStatus;
  durationMs: number | null;
  failureMessage: string | null;
}

export interface TestSuite {
  name: string;
  tests: TestResult[];
  status: TestStatus;
  durationMs: number | null;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  suites: TestSuite[];
}

export type TestRunEvent =
  | { type: "suiteUpdate"; suite: TestSuite }
  | { type: "runComplete"; summary: TestRunSummary }
  | { type: "outputLine"; line: string; stream: string }
  | { type: "error"; message: string }
  | { type: "coverageResult"; report: CoverageReport };

// Test runner commands
export async function detectTestFramework(
  repoId: string,
): Promise<TestRunnerConfig> {
  return invoke<TestRunnerConfig>("detect_test_framework", { repoId });
}

export async function getTestRunnerConfig(
  repoId: string,
): Promise<TestRunnerConfig> {
  return invoke<TestRunnerConfig>("get_test_runner_config", { repoId });
}

export async function saveTestRunnerConfig(
  repoId: string,
  config: TestRunnerConfig,
): Promise<void> {
  return invoke("save_test_runner_config", { repoId, config });
}

export async function runTests(
  contextId: string,
  contextType: string,
  fileFilter?: string,
): Promise<void> {
  return invoke("run_tests", { contextId, contextType, fileFilter });
}

export async function stopTests(contextId: string): Promise<void> {
  return invoke("stop_tests", { contextId });
}

export async function startTestWatch(
  contextId: string,
  contextType: string,
): Promise<void> {
  return invoke("start_test_watch", { contextId, contextType });
}

export async function stopTestWatch(contextId: string): Promise<void> {
  return invoke("stop_test_watch", { contextId });
}

export interface TestRunRecord {
  id: string;
  repoId: string;
  ranAt: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export async function listTestHistory(
  repoId: string,
  limit?: number,
): Promise<TestRunRecord[]> {
  return invoke("list_test_history", { repoId, limit });
}

export async function runCoverage(
  contextId: string,
  contextType: string,
): Promise<void> {
  return invoke("run_coverage", { contextId, contextType });
}

export interface FileCoverage {
  file: string;
  linesPct: number;
  branchesPct: number;
  uncoveredLines: number[];
}

export interface CoverageReport {
  files: FileCoverage[];
  totalLinesPct: number;
  totalBranchesPct: number;
}

// Usage dashboard types
export interface UsageDataPoint {
  workspaceId: string;
  workspaceName: string;
  timestamp: string;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  numTurns: number;
  durationMs: number;
}

export async function getUsageData(
  workspaceId?: string,
  since?: string,
): Promise<UsageDataPoint[]> {
  return invoke<UsageDataPoint[]>("get_usage_data", { workspaceId, since });
}

// Export types
export interface ExportOptions {
  workspaceId: string;
  includeChat: boolean;
  includeTodos: boolean;
  includeRepoSettings: boolean;
  includeEnvVars: boolean;
  includeBookmarks: boolean;
  includeSnippets: boolean;
}

export async function exportWorkspace(
  options: ExportOptions,
): Promise<string> {
  return invoke<string>("export_workspace", { options });
}

// Dev Container types

export type ContainerBackend = "devcontainerCli" | "rawDocker";

export type AgentExecMode = "host" | "container";

export type ContainerStatus =
  | "none"
  | "building"
  | "running"
  | "stopped"
  | { error: string };

export interface DevContainerConfig {
  enabled: boolean;
  backend: ContainerBackend;
  agentExecMode: AgentExecMode;
  image: string | null;
  composeFile: string | null;
  composeService: string | null;
  devcontainerPath: string | null;
  containerWorkspacePath: string | null;
  extraDockerArgs: string[];
  containerEnvVars: Record<string, string>;
}

export interface ContainerState {
  workspaceId: string;
  status: ContainerStatus;
  containerId: string | null;
  containerName: string | null;
  logTail: string[];
}

export interface ContainerStatusEvent {
  workspaceId: string;
  status: ContainerStatus;
  containerId: string | null;
}

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
