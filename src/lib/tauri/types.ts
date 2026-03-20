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

// Chat search types
export interface ChatMessageSearchResult {
  messageId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  matchedText: string;
  timestamp: string;
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

// File content types
export interface FileContent {
  content: string;
  language: string;
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

// File content writing
export interface WriteFileResult {
  content: string;
  language: string;
  formatted: boolean;
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

export interface PrFullData {
  info: PrInfo;
  reviews: PrReview[];
  reviewComments: PrComment[];
}

export interface ReviewsAndComments {
  reviews: PrReview[];
  reviewComments: PrComment[];
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

// Cursorrules conversion types
export interface CursorRulesImportResult {
  rulesFound: boolean;
  claudeMdExisted: boolean;
  written: boolean;
  claudeMdPath: string;
}

// Git log types
export interface GitLogEntry {
  hash: string;
  fullHash: string;
  message: string;
  author: string;
  timestamp: string;
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
