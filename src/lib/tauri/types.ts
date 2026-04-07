// Re-export all shared IPC types from the auto-generated bindings.
// bindings.generated.ts is the source of truth — generated from Rust types via tauri-specta.
export type {
  Repository,
  WorkspaceInfo,
  WorkspaceStatus,
  CreateWorkspaceRequest,
  AgentStatus,
  AgentInfo,
  SendMessageRequest,
  AgentInfo as AgentStatusEvent,
  FrontendStreamEvent,
  MessageRole,
  ContentBlock,
  ResponseMetadata,
  ChatMessage,
  ChatMessageSearchResult,
  Checkpoint,
  DiffResult,
  FileDiff,
  FileStatus,
  FileDiffContent,
  FilePatchPreview,
  FileContent,
  TypeDefFile,
  TypeDefinitions,
  WriteFileResult,
  RepoSettings,
  PrInfo,
  PrCheck,
  CreatePrRequest,
  MergeResult,
  PrComment,
  PrReview,
  PrFullData,
  ReviewsAndComments,
  SubmitReviewRequest,
  ReviewInlineComment,
  WorkflowRun,
  WorkflowJob,
  WorkflowStep,
  RunLogsResult,
  PrListItem,
  PrDetail,
  IssueListItem,
  IssueDetail,
  LinearIssue,
  LinkIssueRequest,
  UnlinkIssueRequest,
  WorkspaceIssue,
  TodoItem,
  CreateTodoRequest,
  UpdateTodoRequest,
  ReorderTodosRequest,
  TodoSummary,
  SlashCommand,
  LspCatalogEntry,
  LspPlugin,
  InstallLspPluginRequest,
  UninstallLspPluginRequest,
  LspSuggestion,
  McpServer,
  AddMcpRequest,
  RemoveMcpRequest,
  CursorMigrationResult,
  CursorRulesImportResult,
  AppSettings,
  ProviderConfig,
  ExperimentalSettings,
  CopilotSettings,
  LinearSettings,
  AzureDevOpsSettings,
  ClaudeContextSettings,
  IndexingState,
  IndexingStatus,
  CustomTheme,
  GitLogEntry,
  BranchStatus,
  PullResult,
  ConflictedFile,
  ConflictType,
  ConflictContent,
  StashEntry,
  StashFileStat,
  StashDetail,
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
  TestRunnerConfig,
  TestRunRecord,
  UsageDataPoint,
  ExportOptions,
  ContainerBackend,
  AgentExecMode,
  ContainerStatus,
  DevContainerConfig,
  ContainerState,
  ContainerState as ContainerStatusEvent,
} from "./bindings.generated";

// ─── Frontend-only types (not generated from Rust) ──────────────────────────

// Persisted chat message — frontend transform between DB format and ChatMessage
export interface PersistedChatMessage {
  id: string;
  workspaceId: string;
  role: "user" | "assistant" | "system";
  content: import("./bindings.generated").ContentBlock[];
  timestamp: string; // ISO 8601
  displayText?: string;
  metadata?: import("./bindings.generated").ResponseMetadata;
}

export type ScriptKind = "setup" | "run" | "archive";

export interface ScriptOutputEvent {
  line: string;
  stream: "stdout" | "stderr";
}

export interface ScriptExitEvent {
  exitCode: number | null;
  success: boolean;
}

// Type aliases for types not in generated bindings
export type McpScope = "user" | "project";
export type AgentType = "claude_code" | "codex_cli";
export type ProviderType =
  | "Anthropic"
  | "OpenRouter"
  | "VercelAIGateway"
  | "Bedrock"
  | "Vertex"
  | "AzureFoundry"
  | "Custom";

// Test runner types (event-based, frontend-only)
export type TestFramework = "vitest" | "jest" | "pytest" | "cargotest" | "gotest" | "custom";
export type TestStatus = "passed" | "failed" | "skipped" | "running" | "pending";

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

export type ContainerizeStatus = "analyzing" | "done" | "error";
