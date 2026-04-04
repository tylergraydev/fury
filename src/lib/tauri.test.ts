import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  toPersisted,
  fromPersisted,
  // Repository commands
  addRepository,
  removeRepository,
  listRepositories,
  listBranches,
  cloneRepository,
  initRepository,
  // Workspace commands
  createWorkspace,
  listWorkspaces,
  archiveWorkspace,
  deleteWorkspace,
  // Chat persistence commands
  saveChatMessage,
  listChatMessages,
  clearChatMessages,
  // Agent commands
  sendMessage,
  stopAgent,
  getAgentStatus,
  clearSession,
  // Checkpoint commands
  listCheckpoints,
  revertToCheckpoint,
  // Diff commands
  getDiff,
  getFileDiff,
  listWorkspaceFiles,
  getRepoDiff,
  getRepoFileDiff,
  // Patch preview commands
  getFilePatch,
  getRepoFilePatch,
  // File content reading
  readWorkspaceFile,
  readRepoFile,
  // Type definitions
  loadTypeDefinitions,
  // File content writing
  writeWorkspaceFile,
  writeRepoFile,
  // Repo file listing
  listRepoFiles,
  // Script commands
  runScript,
  stopScript,
  runRepoScript,
  stopRepoScript,
  getRepoSettings,
  updateRepoSettings,
  // Terminal commands
  createTerminal,
  createRepoTerminal,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  // PR commands
  createPr,
  getPrInfo,
  getPrChecks,
  pushChanges,
  fixFailingChecks,
  mergePr,
  // Todo commands
  addTodo,
  updateTodo,
  deleteTodo,
  listTodos,
  toggleTodo,
  reorderTodos,
  getTodoSummary,
  // MCP commands
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  detectCursorConfig,
  importCursorConfig,
  // App settings commands
  getAppSettings,
  updateAppSettings,
  // Sparse checkout commands
  listRepoDirectories,
  updateSparseDirs,
  // Workspace linking commands
  linkWorkspaces,
  unlinkWorkspaces,
  getLinkedWorkspaces,
  // Spotlight commands
  startSpotlight,
  stopSpotlight,
  // Slash command commands
  listSlashCommands,
  getSlashCommandContent,
  // Archived workspace commands
  listArchivedWorkspaces,
  restoreWorkspace,
  // Workspace notes and rename commands
  updateWorkspaceNotes,
  renameWorkspace,
  // Cursorrules commands
  detectCursorrules,
  importCursorrules,
  // Git log command
  getGitLog,
  // Merge/branch commands
  getBranchStatus,
  fetchUpstream,
  pullRebase,
  pullMerge,
  pushWorkspace,
  getConflictedFiles,
  getConflictContent,
  resolveConflict,
  abortMerge,
  continueMerge,
  crossWorktreeDiff,
  getCrossWorktreeFileDiff,
  // Permission commands
  respondToPermission,
  // File content reading (additional)
  readFileBase64,
  // PR review commands
  getPrReviews,
  getPrReviewComments,
  // Workflow commands
  getWorkflowRuns,
  getRunJobs,
  getRunLogs,
  rerunWorkflow,
  // Claude Context indexing commands
  indexRepository,
  getIndexingStatus,
  listIndexingStatuses,
  // Workspace pinning
  setWorkspacePinned,
  // PR/Issue list commands
  listRepoPrs,
  listRepoIssues,
  getPrDetails,
  getIssueDetails,
  // Linear commands
  searchLinearIssues,
  linkIssueToWorkspace,
  unlinkIssueFromWorkspace,
  getWorkspaceIssues,
  // Chat search commands
  searchChatMessages,
  // Stash commands
  listStashes,
  createStash,
  applyStash,
  popStash,
  dropStash,
  showStash,
  // Followup message
  sendFollowupMessage,
  // Diff watcher commands
  startDiffWatcher,
  stopDiffWatcher,
  // Clipboard commands
  saveClipboardImage,
  // PR full data commands
  getPrFullData,
  getReviewsAndComments,
  // LSP commands
  getLspCatalog,
  listLspPlugins,
  installLspPlugin,
  uninstallLspPlugin,
  detectLspSuggestions,
  // Workspace template commands
  createWorkspaceTemplate,
  listWorkspaceTemplates,
  updateWorkspaceTemplate,
  deleteWorkspaceTemplate,
  // File bookmark commands
  createBookmark,
  listBookmarks,
  updateBookmark,
  deleteBookmark,
  toggleBookmark,
  // Prompt library commands
  createPrompt,
  listPrompts,
  updatePrompt,
  deletePrompt,
  // Snippet manager commands
  createSnippet,
  listSnippets,
  updateSnippet,
  deleteSnippet,
  // Test runner commands
  detectTestFramework,
  getTestRunnerConfig,
  saveTestRunnerConfig,
  runTests,
  stopTests,
  startTestWatch,
  stopTestWatch,
  listTestHistory,
  runCoverage,
  // Usage dashboard commands
  getUsageData,
  // Export commands
  exportWorkspace,
  // Dev container commands
  startContainer,
  stopContainer,
  rebuildContainer,
  getContainerStatus,
  updateDevcontainerConfig,
  detectDevcontainer,
} from "./tauri";
import type { ChatMessage, PersistedChatMessage } from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Type conversion helpers ────────────────────────────────────────────────

describe("toPersisted", () => {
  it("converts a ChatMessage to PersistedChatMessage with ISO timestamp", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      workspaceId: "ws-1",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = toPersisted(msg, "ws-1");
    expect(result).toEqual({
      id: "msg-1",
      workspaceId: "ws-1",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    });
  });

  it("preserves all content block types", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      workspaceId: "ws-2",
      role: "assistant",
      content: [
        { type: "text", text: "Let me help" },
        { type: "toolUse", id: "tu-1", name: "read", input: { path: "/foo" } },
        { type: "toolResult", toolUseId: "tu-1", content: "file contents" },
      ],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = toPersisted(msg, "ws-2");
    expect(result.content).toHaveLength(3);
    expect(result.content[0]).toEqual({ type: "text", text: "Let me help" });
    expect(result.content[1]).toEqual({ type: "toolUse", id: "tu-1", name: "read", input: { path: "/foo" } });
    expect(result.content[2]).toEqual({ type: "toolResult", toolUseId: "tu-1", content: "file contents" });
  });
});

describe("fromPersisted", () => {
  it("converts a PersistedChatMessage to ChatMessage with numeric timestamp", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-1",
      workspaceId: "ws-1",
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = fromPersisted(persisted);
    expect(result).toEqual({
      id: "msg-1",
      workspaceId: "ws-1",
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    });
  });

  it("includes workspaceId in the result", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-1",
      workspaceId: "ws-1",
      role: "user",
      content: [],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = fromPersisted(persisted);
    expect(result).toHaveProperty("workspaceId", "ws-1");
  });
});

describe("toPersisted/fromPersisted round-trip", () => {
  it("round-trips a message preserving all data", () => {
    const original: ChatMessage = {
      id: "msg-rt",
      workspaceId: "ws-rt",
      role: "system",
      content: [{ type: "text", text: "System message" }],
      timestamp: "2024-01-02T00:00:00.000Z",
    };
    const persisted = toPersisted(original, "ws-rt");
    const restored = fromPersisted(persisted);
    expect(restored).toEqual(original);
  });

  it("round-trips with complex content blocks", () => {
    const original: ChatMessage = {
      id: "msg-complex",
      workspaceId: "ws-complex",
      role: "assistant",
      content: [
        { type: "text", text: "Working on it" },
        { type: "toolUse", id: "tu-1", name: "bash", input: { command: "ls" } },
        { type: "toolResult", toolUseId: "tu-1", content: "file1.ts\nfile2.ts" },
        { type: "text", text: "Done!" },
      ],
      timestamp: "2024-01-03T00:00:00.000Z",
    };
    const persisted = toPersisted(original, "ws-complex");
    const restored = fromPersisted(persisted);
    expect(restored).toEqual(original);
  });
});

// ─── Repository commands ────────────────────────────────────────────────────

describe("Repository commands", () => {
  it("addRepository calls invoke with add_repository", async () => {
    const repo = { id: "r1", name: "repo", path: "/path", defaultBranch: "main", currentBranch: "main" };
    (invoke as any).mockResolvedValueOnce(repo);
    const result = await addRepository("/path");
    expect(invoke).toHaveBeenCalledWith("add_repository", { path: "/path" });
    expect(result).toEqual(repo);
  });

  it("removeRepository calls invoke with remove_repository", async () => {
    await removeRepository("r1");
    expect(invoke).toHaveBeenCalledWith("remove_repository", { repoId: "r1" });
  });

  it("listRepositories calls invoke with list_repositories", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listRepositories();
    expect(invoke).toHaveBeenCalledWith("list_repositories");
    expect(result).toEqual([]);
  });

  it("listBranches calls invoke with list_branches", async () => {
    (invoke as any).mockResolvedValueOnce(["main", "dev"]);
    const result = await listBranches("r1");
    expect(invoke).toHaveBeenCalledWith("list_branches", { repoId: "r1" });
    expect(result).toEqual(["main", "dev"]);
  });

  it("cloneRepository calls invoke with clone_repository", async () => {
    const repo = { id: "r2", name: "cloned", path: "/cloned", defaultBranch: "main", currentBranch: null };
    (invoke as any).mockResolvedValueOnce(repo);
    const result = await cloneRepository("https://github.com/test/repo.git", "/cloned");
    expect(invoke).toHaveBeenCalledWith("clone_repository", { url: "https://github.com/test/repo.git", path: "/cloned" });
    expect(result).toEqual(repo);
  });

  it("initRepository calls invoke with init_repository", async () => {
    const repo = { id: "r3", name: "new-repo", path: "/new", defaultBranch: "main", currentBranch: "main" };
    (invoke as any).mockResolvedValueOnce(repo);
    const result = await initRepository("/new", "new-repo");
    expect(invoke).toHaveBeenCalledWith("init_repository", { path: "/new", name: "new-repo" });
    expect(result).toEqual(repo);
  });
});

// ─── Workspace commands ─────────────────────────────────────────────────────

describe("Workspace commands", () => {
  it("createWorkspace calls invoke with create_workspace", async () => {
    const request = { repoId: "r1", workspaceName: "ws", branchName: "feature", sparseDirs: null, baseBranch: null, autoCommit: null, fetchRemoteBranch: null, devcontainerConfig: null };
    const ws = { id: "w1", repoId: "r1", name: "ws", branch: "feature", status: "Active" as const, portBase: 3000, autoCommit: false, createdAt: "2024-01-01", archivedAt: null };
    (invoke as any).mockResolvedValueOnce(ws);
    const result = await createWorkspace(request);
    expect(invoke).toHaveBeenCalledWith("create_workspace", { request });
    expect(result).toEqual(ws);
  });

  it("listWorkspaces calls invoke with list_workspaces", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listWorkspaces();
    expect(invoke).toHaveBeenCalledWith("list_workspaces");
    expect(result).toEqual([]);
  });

  it("archiveWorkspace calls invoke with archive_workspace", async () => {
    await archiveWorkspace("w1");
    expect(invoke).toHaveBeenCalledWith("archive_workspace", { workspaceId: "w1" });
  });

  it("deleteWorkspace calls invoke with delete_workspace", async () => {
    await deleteWorkspace("w1");
    expect(invoke).toHaveBeenCalledWith("delete_workspace", { workspaceId: "w1" });
  });
});

// ─── Chat persistence commands ──────────────────────────────────────────────

describe("Chat persistence commands", () => {
  it("saveChatMessage calls invoke with save_chat_message", async () => {
    const message: PersistedChatMessage = {
      id: "m1",
      workspaceId: "w1",
      role: "user",
      content: [{ type: "text", text: "hi" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    await saveChatMessage(message);
    expect(invoke).toHaveBeenCalledWith("save_chat_message", { message });
  });

  it("listChatMessages calls invoke with list_chat_messages", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listChatMessages("w1");
    expect(invoke).toHaveBeenCalledWith("list_chat_messages", { workspaceId: "w1" });
    expect(result).toEqual([]);
  });

  it("clearChatMessages calls invoke with clear_chat_messages", async () => {
    await clearChatMessages("w1");
    expect(invoke).toHaveBeenCalledWith("clear_chat_messages", { workspaceId: "w1" });
  });
});

// ─── Agent commands ─────────────────────────────────────────────────────────

describe("Agent commands", () => {
  it("sendMessage calls invoke with send_message", async () => {
    const request = { workspaceId: "w1", repoId: null, message: "hello", model: null, disableThinking: null, disablePlanMode: null };
    await sendMessage(request);
    expect(invoke).toHaveBeenCalledWith("send_message", { request });
  });

  it("stopAgent calls invoke with stop_agent", async () => {
    await stopAgent("w1");
    expect(invoke).toHaveBeenCalledWith("stop_agent", { workspaceId: "w1" });
  });

  it("getAgentStatus calls invoke with get_agent_status", async () => {
    const info = { workspaceId: "w1", sessionId: null, status: "Idle" as const, startedAt: null };
    (invoke as any).mockResolvedValueOnce(info);
    const result = await getAgentStatus("w1");
    expect(invoke).toHaveBeenCalledWith("get_agent_status", { workspaceId: "w1" });
    expect(result).toEqual(info);
  });

  it("clearSession calls invoke with clear_session", async () => {
    await clearSession("w1");
    expect(invoke).toHaveBeenCalledWith("clear_session", { workspaceId: "w1" });
  });
});

// ─── Checkpoint commands ────────────────────────────────────────────────────

describe("Checkpoint commands", () => {
  it("listCheckpoints calls invoke with list_checkpoints", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listCheckpoints("w1");
    expect(invoke).toHaveBeenCalledWith("list_checkpoints", { workspaceId: "w1" });
    expect(result).toEqual([]);
  });

  it("revertToCheckpoint calls invoke with revert_to_checkpoint", async () => {
    await revertToCheckpoint("w1", "cp1");
    expect(invoke).toHaveBeenCalledWith("revert_to_checkpoint", { workspaceId: "w1", checkpointId: "cp1" });
  });
});

// ─── Diff commands ──────────────────────────────────────────────────────────

describe("Diff commands", () => {
  it("getDiff calls invoke with get_diff", async () => {
    const diff = { files: [], totalAdditions: 0, totalDeletions: 0 };
    (invoke as any).mockResolvedValueOnce(diff);
    const result = await getDiff("w1");
    expect(invoke).toHaveBeenCalledWith("get_diff", { workspaceId: "w1" });
    expect(result).toEqual(diff);
  });

  it("getFileDiff calls invoke with get_file_diff", async () => {
    const fileDiff = { path: "file.ts", original: "a", modified: "b", language: "typescript" };
    (invoke as any).mockResolvedValueOnce(fileDiff);
    const result = await getFileDiff("w1", "file.ts");
    expect(invoke).toHaveBeenCalledWith("get_file_diff", { workspaceId: "w1", filePath: "file.ts" });
    expect(result).toEqual(fileDiff);
  });

  it("listWorkspaceFiles calls invoke with list_workspace_files", async () => {
    (invoke as any).mockResolvedValueOnce(["a.ts", "b.ts"]);
    const result = await listWorkspaceFiles("w1");
    expect(invoke).toHaveBeenCalledWith("list_workspace_files", { workspaceId: "w1" });
    expect(result).toEqual(["a.ts", "b.ts"]);
  });

  it("getRepoDiff calls invoke with get_repo_diff", async () => {
    const diff = { files: [], totalAdditions: 5, totalDeletions: 3 };
    (invoke as any).mockResolvedValueOnce(diff);
    const result = await getRepoDiff("r1");
    expect(invoke).toHaveBeenCalledWith("get_repo_diff", { repoId: "r1" });
    expect(result).toEqual(diff);
  });

  it("getRepoFileDiff calls invoke with get_repo_file_diff", async () => {
    const fileDiff = { path: "src/main.rs", original: "", modified: "fn main() {}", language: "rust" };
    (invoke as any).mockResolvedValueOnce(fileDiff);
    const result = await getRepoFileDiff("r1", "src/main.rs");
    expect(invoke).toHaveBeenCalledWith("get_repo_file_diff", { repoId: "r1", filePath: "src/main.rs" });
    expect(result).toEqual(fileDiff);
  });

  it("getFilePatch calls invoke with get_file_patch", async () => {
    const preview = { path: "file.ts", language: "typescript", patch: "+line", truncated: false };
    (invoke as any).mockResolvedValueOnce(preview);
    const result = await getFilePatch("w1", "file.ts", false);
    expect(invoke).toHaveBeenCalledWith("get_file_patch", { workspaceId: "w1", filePath: "file.ts", isUntracked: false });
    expect(result).toEqual(preview);
  });

  it("getRepoFilePatch calls invoke with get_repo_file_patch", async () => {
    const preview = { path: "main.rs", language: "rust", patch: "-old\n+new", truncated: false };
    (invoke as any).mockResolvedValueOnce(preview);
    const result = await getRepoFilePatch("r1", "main.rs", true);
    expect(invoke).toHaveBeenCalledWith("get_repo_file_patch", { repoId: "r1", filePath: "main.rs", isUntracked: true });
    expect(result).toEqual(preview);
  });
});

// ─── File content reading ───────────────────────────────────────────────────

describe("File content reading", () => {
  it("readWorkspaceFile calls invoke with read_workspace_file", async () => {
    const content = { content: "hello", language: "text" };
    (invoke as any).mockResolvedValueOnce(content);
    const result = await readWorkspaceFile("w1", "readme.md");
    expect(invoke).toHaveBeenCalledWith("read_workspace_file", { workspaceId: "w1", filePath: "readme.md" });
    expect(result).toEqual(content);
  });

  it("readRepoFile calls invoke with read_repo_file", async () => {
    const content = { content: "fn main() {}", language: "rust" };
    (invoke as any).mockResolvedValueOnce(content);
    const result = await readRepoFile("r1", "src/main.rs");
    expect(invoke).toHaveBeenCalledWith("read_repo_file", { repoId: "r1", filePath: "src/main.rs" });
    expect(result).toEqual(content);
  });
});

// ─── Type definitions ───────────────────────────────────────────────────────

describe("Type definitions", () => {
  it("loadTypeDefinitions calls invoke with workspace context", async () => {
    const typeDefs = { tsconfig: null, libs: [] };
    (invoke as any).mockResolvedValueOnce(typeDefs);
    const result = await loadTypeDefinitions("w1", "workspace");
    expect(invoke).toHaveBeenCalledWith("load_type_definitions", { workspaceId: "w1", repoId: undefined });
    expect(result).toEqual(typeDefs);
  });

  it("loadTypeDefinitions calls invoke with repo context", async () => {
    const typeDefs = { tsconfig: "{}", libs: [{ filePath: "lib.d.ts", content: "declare module x {}" }] };
    (invoke as any).mockResolvedValueOnce(typeDefs);
    const result = await loadTypeDefinitions("r1", "repo");
    expect(invoke).toHaveBeenCalledWith("load_type_definitions", { workspaceId: undefined, repoId: "r1" });
    expect(result).toEqual(typeDefs);
  });
});

// ─── File content writing ───────────────────────────────────────────────────

describe("File content writing", () => {
  it("writeWorkspaceFile calls invoke with write_workspace_file", async () => {
    const writeResult = { content: "formatted", language: "typescript", formatted: true };
    (invoke as any).mockResolvedValueOnce(writeResult);
    const result = await writeWorkspaceFile("w1", "src/index.ts", "const x = 1;");
    expect(invoke).toHaveBeenCalledWith("write_workspace_file", {
      workspaceId: "w1",
      filePath: "src/index.ts",
      content: "const x = 1;",
      formatOnSave: true,
    });
    expect(result).toEqual(writeResult);
  });

  it("writeWorkspaceFile passes formatOnSave=false when specified", async () => {
    const writeResult = { content: "unformatted", language: "typescript", formatted: false };
    (invoke as any).mockResolvedValueOnce(writeResult);
    await writeWorkspaceFile("w1", "src/index.ts", "const x=1;", false);
    expect(invoke).toHaveBeenCalledWith("write_workspace_file", {
      workspaceId: "w1",
      filePath: "src/index.ts",
      content: "const x=1;",
      formatOnSave: false,
    });
  });

  it("writeRepoFile calls invoke with write_repo_file", async () => {
    const writeResult = { content: "formatted", language: "rust", formatted: true };
    (invoke as any).mockResolvedValueOnce(writeResult);
    const result = await writeRepoFile("r1", "src/main.rs", "fn main() {}");
    expect(invoke).toHaveBeenCalledWith("write_repo_file", {
      repoId: "r1",
      filePath: "src/main.rs",
      content: "fn main() {}",
      formatOnSave: true,
    });
    expect(result).toEqual(writeResult);
  });

  it("writeRepoFile passes formatOnSave=false when specified", async () => {
    const writeResult = { content: "raw", language: "rust", formatted: false };
    (invoke as any).mockResolvedValueOnce(writeResult);
    await writeRepoFile("r1", "src/main.rs", "fn main(){}", false);
    expect(invoke).toHaveBeenCalledWith("write_repo_file", {
      repoId: "r1",
      filePath: "src/main.rs",
      content: "fn main(){}",
      formatOnSave: false,
    });
  });
});

// ─── Repo file listing ──────────────────────────────────────────────────────

describe("Repo file listing", () => {
  it("listRepoFiles calls invoke with list_repo_files", async () => {
    (invoke as any).mockResolvedValueOnce(["Cargo.toml", "src/main.rs"]);
    const result = await listRepoFiles("r1");
    expect(invoke).toHaveBeenCalledWith("list_repo_files", { repoId: "r1" });
    expect(result).toEqual(["Cargo.toml", "src/main.rs"]);
  });
});

// ─── Script commands ────────────────────────────────────────────────────────

describe("Script commands", () => {
  it("runScript calls invoke with run_script", async () => {
    await runScript("w1", "setup");
    expect(invoke).toHaveBeenCalledWith("run_script", { workspaceId: "w1", scriptKind: "setup" });
  });

  it("stopScript calls invoke with stop_script", async () => {
    await stopScript("w1", "run");
    expect(invoke).toHaveBeenCalledWith("stop_script", { workspaceId: "w1", scriptKind: "run" });
  });

  it("runRepoScript calls invoke with run_repo_script", async () => {
    await runRepoScript("r1", "setup");
    expect(invoke).toHaveBeenCalledWith("run_repo_script", { repoId: "r1", scriptKind: "setup" });
  });

  it("stopRepoScript calls invoke with stop_repo_script", async () => {
    await stopRepoScript("r1", "archive");
    expect(invoke).toHaveBeenCalledWith("stop_repo_script", { repoId: "r1", scriptKind: "archive" });
  });

  it("getRepoSettings calls invoke with get_repo_settings", async () => {
    const settings = {
      setupScript: "npm install",
      runScript: "npm start",
      archiveScript: null,
      runScriptMode: "concurrent" as const,
      envVars: {},
      worktreeBasePath: null,
      providerOverride: null,
    };
    (invoke as any).mockResolvedValueOnce(settings);
    const result = await getRepoSettings("r1");
    expect(invoke).toHaveBeenCalledWith("get_repo_settings", { repoId: "r1" });
    expect(result).toEqual(settings);
  });

  it("updateRepoSettings calls invoke with update_repo_settings", async () => {
    const settings = {
      setupScript: "npm install",
      runScript: "npm start",
      archiveScript: null,
      runScriptMode: "nonconcurrent" as const,
      envVars: { NODE_ENV: "production" },
      worktreeBasePath: "/base",
      providerOverride: null,
    };
    await updateRepoSettings("r1", settings);
    expect(invoke).toHaveBeenCalledWith("update_repo_settings", { repoId: "r1", settings });
  });
});

// ─── Terminal commands ──────────────────────────────────────────────────────

describe("Terminal commands", () => {
  it("createTerminal calls invoke with create_terminal", async () => {
    (invoke as any).mockResolvedValueOnce("term-1");
    const result = await createTerminal("w1", 80, 24);
    expect(invoke).toHaveBeenCalledWith("create_terminal", { workspaceId: "w1", cols: 80, rows: 24 });
    expect(result).toBe("term-1");
  });

  it("createRepoTerminal calls invoke with create_repo_terminal", async () => {
    (invoke as any).mockResolvedValueOnce("term-2");
    const result = await createRepoTerminal("r1", 120, 40);
    expect(invoke).toHaveBeenCalledWith("create_repo_terminal", { repoId: "r1", cols: 120, rows: 40 });
    expect(result).toBe("term-2");
  });

  it("writeTerminal calls invoke with write_terminal", async () => {
    await writeTerminal("term-1", "ls -la\n");
    expect(invoke).toHaveBeenCalledWith("write_terminal", { terminalId: "term-1", data: "ls -la\n" });
  });

  it("resizeTerminal calls invoke with resize_terminal", async () => {
    await resizeTerminal("term-1", 100, 50);
    expect(invoke).toHaveBeenCalledWith("resize_terminal", { terminalId: "term-1", cols: 100, rows: 50 });
  });

  it("closeTerminal calls invoke with close_terminal", async () => {
    await closeTerminal("term-1");
    expect(invoke).toHaveBeenCalledWith("close_terminal", { terminalId: "term-1" });
  });
});

// ─── PR commands ────────────────────────────────────────────────────────────

describe("PR commands", () => {
  it("createPr calls invoke with create_pr", async () => {
    const request = { workspaceId: "w1", title: "Fix bug", body: "Fixes #123", draft: false };
    const prInfo = {
      workspaceId: "w1",
      prNumber: 42,
      prUrl: "https://github.com/test/repo/pull/42",
      title: "Fix bug",
      state: "open",
      checks: [],
      mergeable: "MERGEABLE",
    };
    (invoke as any).mockResolvedValueOnce(prInfo);
    const result = await createPr(request);
    expect(invoke).toHaveBeenCalledWith("create_pr", { request });
    expect(result).toEqual(prInfo);
  });

  it("getPrInfo calls invoke with get_pr_info", async () => {
    const prInfo = {
      workspaceId: "w1",
      prNumber: 10,
      prUrl: null,
      title: null,
      state: null,
      checks: [],
      mergeable: null,
    };
    (invoke as any).mockResolvedValueOnce(prInfo);
    const result = await getPrInfo("w1");
    expect(invoke).toHaveBeenCalledWith("get_pr_info", { workspaceId: "w1" });
    expect(result).toEqual(prInfo);
  });

  it("getPrChecks calls invoke with get_pr_checks", async () => {
    const checks = [{ name: "CI", status: "completed", conclusion: "success", detailsUrl: null, description: null }];
    (invoke as any).mockResolvedValueOnce(checks);
    const result = await getPrChecks("w1");
    expect(invoke).toHaveBeenCalledWith("get_pr_checks", { workspaceId: "w1" });
    expect(result).toEqual(checks);
  });

  it("pushChanges calls invoke with push_changes", async () => {
    await pushChanges("w1");
    expect(invoke).toHaveBeenCalledWith("push_changes", { workspaceId: "w1" });
  });

  it("fixFailingChecks calls invoke with fix_failing_checks", async () => {
    (invoke as any).mockResolvedValueOnce("Fixed 2 checks");
    const result = await fixFailingChecks("w1");
    expect(invoke).toHaveBeenCalledWith("fix_failing_checks", { workspaceId: "w1" });
    expect(result).toBe("Fixed 2 checks");
  });

  it("mergePr calls invoke with merge_pr", async () => {
    const mergeResult = { success: true, message: "Merged", mergeMethod: "squash" };
    (invoke as any).mockResolvedValueOnce(mergeResult);
    const result = await mergePr("w1", "squash");
    expect(invoke).toHaveBeenCalledWith("merge_pr", { workspaceId: "w1", mergeMethod: "squash" });
    expect(result).toEqual(mergeResult);
  });

  it("mergePr calls invoke without mergeMethod when not specified", async () => {
    const mergeResult = { success: true, message: "Merged", mergeMethod: "merge" };
    (invoke as any).mockResolvedValueOnce(mergeResult);
    await mergePr("w1");
    expect(invoke).toHaveBeenCalledWith("merge_pr", { workspaceId: "w1", mergeMethod: undefined });
  });
});

// ─── Todo commands ──────────────────────────────────────────────────────────

describe("Todo commands", () => {
  it("addTodo calls invoke with add_todo", async () => {
    const request = { workspaceId: "w1", text: "Fix bug" };
    const todo = { id: "t1", workspaceId: "w1", text: "Fix bug", completed: false, sortOrder: 0 };
    (invoke as any).mockResolvedValueOnce(todo);
    const result = await addTodo(request);
    expect(invoke).toHaveBeenCalledWith("add_todo", { request });
    expect(result).toEqual(todo);
  });

  it("updateTodo calls invoke with update_todo", async () => {
    const request = { id: "t1", workspaceId: "w1", text: "Updated text", completed: null };
    await updateTodo(request);
    expect(invoke).toHaveBeenCalledWith("update_todo", { request });
  });

  it("deleteTodo calls invoke with delete_todo", async () => {
    await deleteTodo("t1");
    expect(invoke).toHaveBeenCalledWith("delete_todo", { todoId: "t1" });
  });

  it("listTodos calls invoke with list_todos", async () => {
    const todos = [{ id: "t1", workspaceId: "w1", text: "Task", completed: false, sortOrder: 0 }];
    (invoke as any).mockResolvedValueOnce(todos);
    const result = await listTodos("w1");
    expect(invoke).toHaveBeenCalledWith("list_todos", { workspaceId: "w1" });
    expect(result).toEqual(todos);
  });

  it("toggleTodo calls invoke with toggle_todo", async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const result = await toggleTodo("t1");
    expect(invoke).toHaveBeenCalledWith("toggle_todo", { todoId: "t1" });
    expect(result).toBe(true);
  });

  it("reorderTodos calls invoke with reorder_todos", async () => {
    const request = { workspaceId: "w1", todoIds: ["t2", "t1", "t3"] };
    await reorderTodos(request);
    expect(invoke).toHaveBeenCalledWith("reorder_todos", { request });
  });

  it("getTodoSummary calls invoke with get_todo_summary", async () => {
    const summary = { total: 3, completed: 1, allCompleted: false, items: [] };
    (invoke as any).mockResolvedValueOnce(summary);
    const result = await getTodoSummary("w1");
    expect(invoke).toHaveBeenCalledWith("get_todo_summary", { workspaceId: "w1" });
    expect(result).toEqual(summary);
  });
});

// ─── MCP commands ───────────────────────────────────────────────────────────

describe("MCP commands", () => {
  it("listMcpServers calls invoke with list_mcp_servers", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listMcpServers("user");
    expect(invoke).toHaveBeenCalledWith("list_mcp_servers", { scope: "user" });
    expect(result).toEqual([]);
  });

  it("listMcpServers calls invoke without scope when not specified", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await listMcpServers();
    expect(invoke).toHaveBeenCalledWith("list_mcp_servers", { scope: undefined });
  });

  it("addMcpServer calls invoke with add_mcp_server", async () => {
    const request = { name: "test-server", command: "node", args: ["server.js"], env: {}, scope: "user" as const };
    await addMcpServer(request);
    expect(invoke).toHaveBeenCalledWith("add_mcp_server", { request });
  });

  it("removeMcpServer calls invoke with remove_mcp_server", async () => {
    const request = { name: "test-server", scope: "project" as const };
    await removeMcpServer(request);
    expect(invoke).toHaveBeenCalledWith("remove_mcp_server", { request });
  });

  it("detectCursorConfig calls invoke with detect_cursor_config", async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const result = await detectCursorConfig();
    expect(invoke).toHaveBeenCalledWith("detect_cursor_config");
    expect(result).toBe(true);
  });

  it("importCursorConfig calls invoke with import_cursor_config", async () => {
    const migrationResult = { mcpServersFound: 2, mcpServersImported: 1, rulesFound: true };
    (invoke as any).mockResolvedValueOnce(migrationResult);
    const result = await importCursorConfig();
    expect(invoke).toHaveBeenCalledWith("import_cursor_config");
    expect(result).toEqual(migrationResult);
  });
});

// ─── App settings commands ──────────────────────────────────────────────────

describe("App settings commands", () => {
  it("getAppSettings calls invoke with get_app_settings", async () => {
    const settings = {
      theme: "midnight" as const,
      provider: { providerType: "Anthropic" as const, envVars: {} },
      systemPromptAdditions: null,
      analyticsEnabled: true,
      experimental: { spotlightTesting: false, agentTeams: false, persistentProcesses: false, safeMode: false },
      copilot: { enabled: false },
    };
    (invoke as any).mockResolvedValueOnce(settings);
    const result = await getAppSettings();
    expect(invoke).toHaveBeenCalledWith("get_app_settings");
    expect(result).toEqual(settings);
  });

  it("updateAppSettings calls invoke with update_app_settings", async () => {
    const settings = {
      agentType: "claude_code" as const,
      theme: "blend" as const,
      provider: { providerType: "Anthropic" as const, envVars: { ANTHROPIC_API_KEY: "key" } },
      systemPromptAdditions: "Be helpful",
      analyticsEnabled: false,
      experimental: { spotlightTesting: true, agentTeams: false, persistentProcesses: false, safeMode: false },
      copilot: { enabled: true },
      linear: { apiKey: null },
      claudeContext: { enabled: false, openaiApiKey: null, zillizUri: null, zillizToken: null },
      azureDevops: { pat: null, defaultOrg: null },
    };
    await updateAppSettings(settings);
    expect(invoke).toHaveBeenCalledWith("update_app_settings", { settings });
  });
});

// ─── Sparse checkout commands ───────────────────────────────────────────────

describe("Sparse checkout commands", () => {
  it("listRepoDirectories calls invoke with list_repo_directories", async () => {
    (invoke as any).mockResolvedValueOnce(["src/", "tests/"]);
    const result = await listRepoDirectories("r1", 2);
    expect(invoke).toHaveBeenCalledWith("list_repo_directories", { repoId: "r1", depth: 2 });
    expect(result).toEqual(["src/", "tests/"]);
  });

  it("listRepoDirectories calls invoke without depth when not specified", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await listRepoDirectories("r1");
    expect(invoke).toHaveBeenCalledWith("list_repo_directories", { repoId: "r1", depth: undefined });
  });

  it("updateSparseDirs calls invoke with update_sparse_dirs", async () => {
    await updateSparseDirs("w1", ["src/", "lib/"]);
    expect(invoke).toHaveBeenCalledWith("update_sparse_dirs", { workspaceId: "w1", dirs: ["src/", "lib/"] });
  });
});

// ─── Workspace linking commands ─────────────────────────────────────────────

describe("Workspace linking commands", () => {
  it("linkWorkspaces calls invoke with link_workspaces", async () => {
    await linkWorkspaces("w1", "w2");
    expect(invoke).toHaveBeenCalledWith("link_workspaces", { workspaceId: "w1", linkedWorkspaceId: "w2" });
  });

  it("unlinkWorkspaces calls invoke with unlink_workspaces", async () => {
    await unlinkWorkspaces("w1", "w2");
    expect(invoke).toHaveBeenCalledWith("unlink_workspaces", { workspaceId: "w1", linkedWorkspaceId: "w2" });
  });

  it("getLinkedWorkspaces calls invoke with get_linked_workspaces", async () => {
    (invoke as any).mockResolvedValueOnce(["w2", "w3"]);
    const result = await getLinkedWorkspaces("w1");
    expect(invoke).toHaveBeenCalledWith("get_linked_workspaces", { workspaceId: "w1" });
    expect(result).toEqual(["w2", "w3"]);
  });
});

// ─── Spotlight commands ─────────────────────────────────────────────────────

describe("Spotlight commands", () => {
  it("startSpotlight calls invoke with start_spotlight", async () => {
    await startSpotlight("w1");
    expect(invoke).toHaveBeenCalledWith("start_spotlight", { workspaceId: "w1" });
  });

  it("stopSpotlight calls invoke with stop_spotlight", async () => {
    await stopSpotlight("w1");
    expect(invoke).toHaveBeenCalledWith("stop_spotlight", { workspaceId: "w1" });
  });
});

// ─── Slash command commands ─────────────────────────────────────────────────

describe("Slash command commands", () => {
  it("listSlashCommands calls invoke with list_slash_commands for workspace", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listSlashCommands("w1", "workspace");
    expect(invoke).toHaveBeenCalledWith("list_slash_commands", { contextId: "w1", contextType: "workspace" });
    expect(result).toEqual([]);
  });

  it("listSlashCommands calls invoke with list_slash_commands for repo", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listSlashCommands("r1", "repo");
    expect(invoke).toHaveBeenCalledWith("list_slash_commands", { contextId: "r1", contextType: "repo" });
    expect(result).toEqual([]);
  });

  it("listSlashCommands defaults to workspace contextType", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await listSlashCommands("w1");
    expect(invoke).toHaveBeenCalledWith("list_slash_commands", { contextId: "w1", contextType: "workspace" });
  });

  it("getSlashCommandContent calls invoke with get_slash_command_content", async () => {
    const command = { name: "test", source: "global" as const, description: "Test command", content: "test content" };
    (invoke as any).mockResolvedValueOnce(command);
    const result = await getSlashCommandContent("w1", "test");
    expect(invoke).toHaveBeenCalledWith("get_slash_command_content", { workspaceId: "w1", name: "test" });
    expect(result).toEqual(command);
  });

  it("getSlashCommandContent returns null when command not found", async () => {
    (invoke as any).mockResolvedValueOnce(null);
    const result = await getSlashCommandContent("w1", "nonexistent");
    expect(invoke).toHaveBeenCalledWith("get_slash_command_content", { workspaceId: "w1", name: "nonexistent" });
    expect(result).toBeNull();
  });
});

// ─── Archived workspace commands ────────────────────────────────────────────

describe("Archived workspace commands", () => {
  it("listArchivedWorkspaces calls invoke with list_archived_workspaces", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listArchivedWorkspaces();
    expect(invoke).toHaveBeenCalledWith("list_archived_workspaces");
    expect(result).toEqual([]);
  });

  it("restoreWorkspace calls invoke with restore_workspace", async () => {
    const ws = { id: "w1", repoId: "r1", name: "ws", branch: "main", status: "Active" as const, portBase: 3000, autoCommit: false, createdAt: "2024-01-01", archivedAt: null };
    (invoke as any).mockResolvedValueOnce(ws);
    const result = await restoreWorkspace("w1");
    expect(invoke).toHaveBeenCalledWith("restore_workspace", { workspaceId: "w1" });
    expect(result).toEqual(ws);
  });
});

// ─── Workspace notes and rename commands ────────────────────────────────────

describe("Workspace notes and rename commands", () => {
  it("updateWorkspaceNotes calls invoke with update_workspace_notes", async () => {
    await updateWorkspaceNotes("w1", "These are my notes");
    expect(invoke).toHaveBeenCalledWith("update_workspace_notes", { workspaceId: "w1", notes: "These are my notes" });
  });

  it("renameWorkspace calls invoke with rename_workspace", async () => {
    await renameWorkspace("w1", "New Name");
    expect(invoke).toHaveBeenCalledWith("rename_workspace", { workspaceId: "w1", name: "New Name" });
  });
});

// ─── Cursorrules commands ───────────────────────────────────────────────────

describe("Cursorrules commands", () => {
  it("detectCursorrules calls invoke with detect_cursorrules", async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const result = await detectCursorrules("r1");
    expect(invoke).toHaveBeenCalledWith("detect_cursorrules", { repoId: "r1" });
    expect(result).toBe(true);
  });

  it("importCursorrules calls invoke with import_cursorrules", async () => {
    const importResult = { rulesFound: true, claudeMdExisted: false, written: true, claudeMdPath: "/path/.claude.md" };
    (invoke as any).mockResolvedValueOnce(importResult);
    const result = await importCursorrules("r1", false);
    expect(invoke).toHaveBeenCalledWith("import_cursorrules", { repoId: "r1", overwrite: false });
    expect(result).toEqual(importResult);
  });

  it("importCursorrules calls invoke with overwrite=true", async () => {
    const importResult = { rulesFound: true, claudeMdExisted: true, written: true, claudeMdPath: "/path/.claude.md" };
    (invoke as any).mockResolvedValueOnce(importResult);
    await importCursorrules("r1", true);
    expect(invoke).toHaveBeenCalledWith("import_cursorrules", { repoId: "r1", overwrite: true });
  });
});

// ─── Git log command ────────────────────────────────────────────────────────

describe("Git log command", () => {
  it("getGitLog calls invoke with get_git_log", async () => {
    const entries = [
      { hash: "abc1234", fullHash: "abc1234def5678", message: "Initial commit", author: "Test", timestamp: "2024-01-01T00:00:00Z" },
    ];
    (invoke as any).mockResolvedValueOnce(entries);
    const result = await getGitLog("w1", 10);
    expect(invoke).toHaveBeenCalledWith("get_git_log", { workspaceId: "w1", maxCount: 10 });
    expect(result).toEqual(entries);
  });

  it("getGitLog calls invoke without maxCount when not specified", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await getGitLog("w1");
    expect(invoke).toHaveBeenCalledWith("get_git_log", { workspaceId: "w1", maxCount: undefined });
  });
});

// ─── Merge/branch commands ──────────────────────────────────────────────────

describe("Merge/branch commands", () => {
  it("getBranchStatus calls invoke with get_branch_status", async () => {
    const status = { branch: "feature", defaultBranch: "main", ahead: 2, behind: 1, hasUpstream: true };
    (invoke as any).mockResolvedValueOnce(status);
    const result = await getBranchStatus("w1");
    expect(invoke).toHaveBeenCalledWith("get_branch_status", { workspaceId: "w1" });
    expect(result).toEqual(status);
  });

  it("fetchUpstream calls invoke with fetch_upstream", async () => {
    await fetchUpstream("w1");
    expect(invoke).toHaveBeenCalledWith("fetch_upstream", { workspaceId: "w1" });
  });

  it("pullRebase calls invoke with pull_rebase", async () => {
    const pullResult = { success: true, message: "Rebased", hasConflicts: false, conflictedFiles: [] };
    (invoke as any).mockResolvedValueOnce(pullResult);
    const result = await pullRebase("w1");
    expect(invoke).toHaveBeenCalledWith("pull_rebase", { workspaceId: "w1" });
    expect(result).toEqual(pullResult);
  });

  it("pullMerge calls invoke with pull_merge", async () => {
    const pullResult = { success: true, message: "Merged", hasConflicts: false, conflictedFiles: [] };
    (invoke as any).mockResolvedValueOnce(pullResult);
    const result = await pullMerge("w1");
    expect(invoke).toHaveBeenCalledWith("pull_merge", { workspaceId: "w1" });
    expect(result).toEqual(pullResult);
  });

  it("pushWorkspace calls invoke with push_workspace", async () => {
    await pushWorkspace("w1");
    expect(invoke).toHaveBeenCalledWith("push_workspace", { workspaceId: "w1" });
  });

  it("getConflictedFiles calls invoke with get_conflicted_files", async () => {
    const files = [{ path: "src/main.ts", conflictType: "bothModified" as const }];
    (invoke as any).mockResolvedValueOnce(files);
    const result = await getConflictedFiles("w1");
    expect(invoke).toHaveBeenCalledWith("get_conflicted_files", { workspaceId: "w1" });
    expect(result).toEqual(files);
  });

  it("getConflictContent calls invoke with get_conflict_content", async () => {
    const content = { path: "src/main.ts", base: "a", ours: "b", theirs: "c", merged: "d", language: "typescript" };
    (invoke as any).mockResolvedValueOnce(content);
    const result = await getConflictContent("w1", "src/main.ts");
    expect(invoke).toHaveBeenCalledWith("get_conflict_content", { workspaceId: "w1", filePath: "src/main.ts" });
    expect(result).toEqual(content);
  });

  it("resolveConflict calls invoke with resolve_conflict", async () => {
    await resolveConflict("w1", "src/main.ts", "ours");
    expect(invoke).toHaveBeenCalledWith("resolve_conflict", { workspaceId: "w1", filePath: "src/main.ts", strategy: "ours" });
  });

  it("abortMerge calls invoke with abort_merge_cmd", async () => {
    await abortMerge("w1");
    expect(invoke).toHaveBeenCalledWith("abort_merge_cmd", { workspaceId: "w1" });
  });

  it("continueMerge calls invoke with continue_merge", async () => {
    await continueMerge("w1");
    expect(invoke).toHaveBeenCalledWith("continue_merge", { workspaceId: "w1" });
  });

  it("crossWorktreeDiff calls invoke with cross_worktree_diff", async () => {
    const diff = { files: [], totalAdditions: 0, totalDeletions: 0 };
    (invoke as any).mockResolvedValueOnce(diff);
    const result = await crossWorktreeDiff("w1", "w2");
    expect(invoke).toHaveBeenCalledWith("cross_worktree_diff", { workspaceId: "w1", linkedWorkspaceId: "w2" });
    expect(result).toEqual(diff);
  });

  it("getCrossWorktreeFileDiff calls invoke with get_cross_worktree_file_diff", async () => {
    const fileDiff = { path: "shared.ts", original: "old", modified: "new", language: "typescript" };
    (invoke as any).mockResolvedValueOnce(fileDiff);
    const result = await getCrossWorktreeFileDiff("w1", "w2", "shared.ts");
    expect(invoke).toHaveBeenCalledWith("get_cross_worktree_file_diff", {
      workspaceId: "w1",
      linkedWorkspaceId: "w2",
      filePath: "shared.ts",
    });
    expect(result).toEqual(fileDiff);
  });
});

// ─── Permission commands ────────────────────────────────────────────────────

describe("Permission commands", () => {
  it("respondToPermission calls invoke with respond_to_permission", async () => {
    await respondToPermission("w1", true);
    expect(invoke).toHaveBeenCalledWith("respond_to_permission", { workspaceId: "w1", approved: true, updatedPermissions: null, decisionClassification: null });
  });

  it("respondToPermission passes approved=false", async () => {
    await respondToPermission("w1", false);
    expect(invoke).toHaveBeenCalledWith("respond_to_permission", { workspaceId: "w1", approved: false, updatedPermissions: null, decisionClassification: null });
  });
});

// ─── File content reading (additional) ──────────────────────────────────────

describe("File content reading (additional)", () => {
  it("readFileBase64 calls invoke with read_file_base64", async () => {
    (invoke as any).mockResolvedValueOnce("base64data==");
    const result = await readFileBase64("/path/to/image.png");
    expect(invoke).toHaveBeenCalledWith("read_file_base64", { filePath: "/path/to/image.png" });
    expect(result).toBe("base64data==");
  });
});

// ─── PR review commands ─────────────────────────────────────────────────────

describe("PR review commands", () => {
  it("getPrReviews calls invoke with get_pr_reviews", async () => {
    const reviews = [{ id: 1, author: "bob", state: "APPROVED", body: "LGTM", submittedAt: "2024-01-01" }];
    (invoke as any).mockResolvedValueOnce(reviews);
    const result = await getPrReviews("w1");
    expect(invoke).toHaveBeenCalledWith("get_pr_reviews", { workspaceId: "w1" });
    expect(result).toEqual(reviews);
  });

  it("getPrReviewComments calls invoke with get_pr_review_comments", async () => {
    const comments = [{ id: 1, author: "bob", body: "Fix this", createdAt: "2024-01-01", path: "src/a.ts", line: 10 }];
    (invoke as any).mockResolvedValueOnce(comments);
    const result = await getPrReviewComments("w1");
    expect(invoke).toHaveBeenCalledWith("get_pr_review_comments", { workspaceId: "w1" });
    expect(result).toEqual(comments);
  });
});

// ─── Workflow commands ──────────────────────────────────────────────────────

describe("Workflow commands", () => {
  it("getWorkflowRuns calls invoke with get_workflow_runs", async () => {
    const runs = [{ id: 1, name: "CI", workflowName: "ci.yml", status: "completed", conclusion: "success", event: "push", createdAt: "2024-01-01" }];
    (invoke as any).mockResolvedValueOnce(runs);
    const result = await getWorkflowRuns("w1");
    expect(invoke).toHaveBeenCalledWith("get_workflow_runs", { workspaceId: "w1" });
    expect(result).toEqual(runs);
  });

  it("getRunJobs calls invoke with get_run_jobs", async () => {
    const jobs = [{ id: 1, name: "build", status: "completed", conclusion: "success", steps: [] }];
    (invoke as any).mockResolvedValueOnce(jobs);
    const result = await getRunJobs("w1", 123);
    expect(invoke).toHaveBeenCalledWith("get_run_jobs", { workspaceId: "w1", runId: 123 });
    expect(result).toEqual(jobs);
  });

  it("getRunLogs calls invoke with get_run_logs", async () => {
    const logs = { logs: "build output...", truncated: false };
    (invoke as any).mockResolvedValueOnce(logs);
    const result = await getRunLogs("w1", 123, true);
    expect(invoke).toHaveBeenCalledWith("get_run_logs", { workspaceId: "w1", runId: 123, failedOnly: true });
    expect(result).toEqual(logs);
  });

  it("rerunWorkflow calls invoke with rerun_workflow", async () => {
    await rerunWorkflow("w1", 123, false);
    expect(invoke).toHaveBeenCalledWith("rerun_workflow", { workspaceId: "w1", runId: 123, failedOnly: false });
  });
});

// ─── Claude Context indexing commands ───────────────────────────────────────

describe("Claude Context indexing commands", () => {
  it("indexRepository calls invoke with index_repository", async () => {
    await indexRepository("r1");
    expect(invoke).toHaveBeenCalledWith("index_repository", { repoId: "r1" });
  });

  it("getIndexingStatus calls invoke with get_indexing_status", async () => {
    const status = { repoId: "r1", repoPath: "/path", status: "indexed" as const, error: null, lastIndexedAt: "2024-01-01" };
    (invoke as any).mockResolvedValueOnce(status);
    const result = await getIndexingStatus("r1");
    expect(invoke).toHaveBeenCalledWith("get_indexing_status", { repoId: "r1" });
    expect(result).toEqual(status);
  });

  it("listIndexingStatuses calls invoke with list_indexing_statuses", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    const result = await listIndexingStatuses();
    expect(invoke).toHaveBeenCalledWith("list_indexing_statuses");
    expect(result).toEqual([]);
  });
});

// ─── Workspace pinning commands ─────────────────────────────────────────────

describe("Workspace pinning commands", () => {
  it("setWorkspacePinned calls invoke with set_workspace_pinned", async () => {
    await setWorkspacePinned("w1", true);
    expect(invoke).toHaveBeenCalledWith("set_workspace_pinned", { workspaceId: "w1", pinned: true });
  });

  it("setWorkspacePinned calls invoke with pinned=false", async () => {
    await setWorkspacePinned("w1", false);
    expect(invoke).toHaveBeenCalledWith("set_workspace_pinned", { workspaceId: "w1", pinned: false });
  });
});

// ─── PR/Issue list commands ─────────────────────────────────────────────────

describe("PR/Issue list commands", () => {
  it("listRepoPrs calls invoke with list_repo_prs", async () => {
    const prs = [{ number: 1, title: "PR 1", headBranch: "feature", baseBranch: "main", state: "open", author: "bob", url: "https://github.com/test/repo/pull/1" }];
    (invoke as any).mockResolvedValueOnce(prs);
    const result = await listRepoPrs("r1");
    expect(invoke).toHaveBeenCalledWith("list_repo_prs", { repoId: "r1" });
    expect(result).toEqual(prs);
  });

  it("listRepoIssues calls invoke with list_repo_issues", async () => {
    const issues = [{ number: 1, title: "Bug", body: "Fix it", state: "open", labels: ["bug"] }];
    (invoke as any).mockResolvedValueOnce(issues);
    const result = await listRepoIssues("r1");
    expect(invoke).toHaveBeenCalledWith("list_repo_issues", { repoId: "r1" });
    expect(result).toEqual(issues);
  });

  it("getPrDetails calls invoke with get_pr_details", async () => {
    const detail = { number: 1, title: "PR 1", headBranch: "feature", baseBranch: "main", body: "Details", state: "open", url: "https://github.com/test/repo/pull/1" };
    (invoke as any).mockResolvedValueOnce(detail);
    const result = await getPrDetails("r1", 1);
    expect(invoke).toHaveBeenCalledWith("get_pr_details", { repoId: "r1", prNumber: 1 });
    expect(result).toEqual(detail);
  });

  it("getIssueDetails calls invoke with get_issue_details", async () => {
    const detail = { number: 42, title: "Bug", body: "Something broke", state: "open", labels: ["bug"] };
    (invoke as any).mockResolvedValueOnce(detail);
    const result = await getIssueDetails("r1", 42);
    expect(invoke).toHaveBeenCalledWith("get_issue_details", { repoId: "r1", issueNumber: 42 });
    expect(result).toEqual(detail);
  });
});

// ─── Linear commands ────────────────────────────────────────────────────────

describe("Linear commands", () => {
  it("searchLinearIssues calls invoke with search_linear_issues", async () => {
    const issues = [{ id: "i1", identifier: "ENG-1", title: "Bug", url: "u", stateName: null, priority: null, teamName: null, description: null }];
    (invoke as any).mockResolvedValueOnce(issues);
    const result = await searchLinearIssues("bug fix");
    expect(invoke).toHaveBeenCalledWith("search_linear_issues", { query: "bug fix" });
    expect(result).toEqual(issues);
  });

  it("linkIssueToWorkspace calls invoke with link_issue_to_workspace", async () => {
    const request = { workspaceId: "w1", issueId: "i1", identifier: "ENG-1", title: "Bug", url: "u" };
    await linkIssueToWorkspace(request);
    expect(invoke).toHaveBeenCalledWith("link_issue_to_workspace", { request });
  });

  it("unlinkIssueFromWorkspace calls invoke with unlink_issue_from_workspace", async () => {
    const request = { workspaceId: "w1", issueId: "i1" };
    await unlinkIssueFromWorkspace(request);
    expect(invoke).toHaveBeenCalledWith("unlink_issue_from_workspace", { request });
  });

  it("getWorkspaceIssues calls invoke with get_workspace_issues", async () => {
    const issues = [{ issueId: "i1", workspaceId: "w1", identifier: "ENG-1", title: "Bug", url: "u", linkedAt: "2024-01-01" }];
    (invoke as any).mockResolvedValueOnce(issues);
    const result = await getWorkspaceIssues("w1");
    expect(invoke).toHaveBeenCalledWith("get_workspace_issues", { workspaceId: "w1" });
    expect(result).toEqual(issues);
  });
});

// ─── Chat search commands ───────────────────────────────────────────────────

describe("Chat search commands", () => {
  it("searchChatMessages calls invoke with search_chat_messages", async () => {
    const results = [{ messageId: "m1", workspaceId: "w1", workspaceName: "ws", role: "user" as const, matchedText: "hello", timestamp: "2024-01-01" }];
    (invoke as any).mockResolvedValueOnce(results);
    const result = await searchChatMessages("hello", "w1");
    expect(invoke).toHaveBeenCalledWith("search_chat_messages", { query: "hello", workspaceId: "w1" });
    expect(result).toEqual(results);
  });

  it("searchChatMessages calls invoke without workspaceId when not specified", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await searchChatMessages("test");
    expect(invoke).toHaveBeenCalledWith("search_chat_messages", { query: "test", workspaceId: undefined });
  });
});

// ─── Stash commands ─────────────────────────────────────────────────────────

describe("Stash commands", () => {
  it("listStashes calls invoke with list_stashes", async () => {
    const stashes = [{ index: 0, message: "wip", branch: "main", timestamp: "2024-01-01T00:00:00Z" }];
    (invoke as any).mockResolvedValueOnce(stashes);
    const result = await listStashes("w1");
    expect(invoke).toHaveBeenCalledWith("list_stashes", { workspaceId: "w1" });
    expect(result).toEqual(stashes);
  });

  it("createStash calls invoke with create_stash", async () => {
    const entry = { index: 0, message: "my stash", branch: "main", timestamp: "2024-01-01T00:00:00Z" };
    (invoke as any).mockResolvedValueOnce(entry);
    const result = await createStash("w1", "my stash", true);
    expect(invoke).toHaveBeenCalledWith("create_stash", { workspaceId: "w1", message: "my stash", includeUntracked: true });
    expect(result).toEqual(entry);
  });

  it("createStash calls invoke without optional params", async () => {
    const entry = { index: 0, message: "", branch: "main", timestamp: "2024-01-01T00:00:00Z" };
    (invoke as any).mockResolvedValueOnce(entry);
    await createStash("w1");
    expect(invoke).toHaveBeenCalledWith("create_stash", { workspaceId: "w1", message: undefined, includeUntracked: undefined });
  });

  it("applyStash calls invoke with apply_stash", async () => {
    await applyStash("w1", 0);
    expect(invoke).toHaveBeenCalledWith("apply_stash", { workspaceId: "w1", index: 0 });
  });

  it("popStash calls invoke with pop_stash", async () => {
    await popStash("w1", 1);
    expect(invoke).toHaveBeenCalledWith("pop_stash", { workspaceId: "w1", index: 1 });
  });

  it("dropStash calls invoke with drop_stash", async () => {
    await dropStash("w1", 2);
    expect(invoke).toHaveBeenCalledWith("drop_stash", { workspaceId: "w1", index: 2 });
  });

  it("showStash calls invoke with show_stash", async () => {
    const detail = { index: 0, message: "stash", files: [{ path: "a.ts", additions: 5, deletions: 2 }], patch: "diff..." };
    (invoke as any).mockResolvedValueOnce(detail);
    const result = await showStash("w1", 0);
    expect(invoke).toHaveBeenCalledWith("show_stash", { workspaceId: "w1", index: 0 });
    expect(result).toEqual(detail);
  });
});

// ─── toPersisted/fromPersisted with optional fields ─────────────────────────

describe("toPersisted/fromPersisted with optional fields", () => {
  it("toPersisted includes displayText when present", () => {
    const msg: ChatMessage = {
      id: "msg-dt",
      workspaceId: "ws-1",
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      timestamp: "2024-01-01T00:00:00.000Z",
      displayText: "Hello!",
    };
    const result = toPersisted(msg, "ws-1");
    expect(result.displayText).toBe("Hello!");
  });

  it("toPersisted omits displayText when not present", () => {
    const msg: ChatMessage = {
      id: "msg-nd",
      workspaceId: "ws-1",
      role: "user",
      content: [{ type: "text", text: "hi" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = toPersisted(msg, "ws-1");
    expect(result).not.toHaveProperty("displayText");
  });

  it("toPersisted includes metadata when present", () => {
    const msg: ChatMessage = {
      id: "msg-m",
      workspaceId: "ws-1",
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      timestamp: "2024-01-01T00:00:00.000Z",
      metadata: { totalCostUsd: 0.01, inputTokens: 100, outputTokens: 50 },
    };
    const result = toPersisted(msg, "ws-1");
    expect(result.metadata).toEqual({ totalCostUsd: 0.01, inputTokens: 100, outputTokens: 50 });
  });

  it("fromPersisted includes displayText when present", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-dt",
      workspaceId: "ws-1",
      role: "assistant",
      content: [],
      timestamp: "2024-01-01T00:00:00.000Z",
      displayText: "Hello!",
    };
    const result = fromPersisted(persisted);
    expect(result.displayText).toBe("Hello!");
  });

  it("fromPersisted includes metadata when present", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-m",
      workspaceId: "ws-1",
      role: "assistant",
      content: [],
      timestamp: "2024-01-01T00:00:00.000Z",
      metadata: { durationMs: 1000 },
    };
    const result = fromPersisted(persisted);
    expect(result.metadata).toEqual({ durationMs: 1000 });
  });
});

// ─── Followup message command ────────────────────────────────────────────────

describe("Followup message command", () => {
  it("sendFollowupMessage calls invoke with send_followup_message", async () => {
    await sendFollowupMessage("w1", "follow up text");
    expect(invoke).toHaveBeenCalledWith("send_followup_message", { workspaceId: "w1", message: "follow up text" });
  });
});

// ─── Diff watcher commands ───────────────────────────────────────────────────

describe("Diff watcher commands", () => {
  it("startDiffWatcher calls invoke with start_diff_watcher", async () => {
    await startDiffWatcher("ctx1", "workspace");
    expect(invoke).toHaveBeenCalledWith("start_diff_watcher", { contextId: "ctx1", contextType: "workspace" });
  });

  it("startDiffWatcher works with repo context type", async () => {
    await startDiffWatcher("ctx1", "repo");
    expect(invoke).toHaveBeenCalledWith("start_diff_watcher", { contextId: "ctx1", contextType: "repo" });
  });

  it("stopDiffWatcher calls invoke with stop_diff_watcher", async () => {
    await stopDiffWatcher("ctx1");
    expect(invoke).toHaveBeenCalledWith("stop_diff_watcher", { contextId: "ctx1" });
  });
});

// ─── Clipboard commands ─────────────────────────────────────────────────────

describe("Clipboard commands", () => {
  it("saveClipboardImage calls invoke with save_clipboard_image", async () => {
    (invoke as any).mockResolvedValueOnce("/tmp/image.png");
    const result = await saveClipboardImage("base64data", "image/png");
    expect(invoke).toHaveBeenCalledWith("save_clipboard_image", { data: "base64data", mimeType: "image/png" });
    expect(result).toBe("/tmp/image.png");
  });
});

// ─── PR full data commands ──────────────────────────────────────────────────

describe("PR full data commands", () => {
  it("getPrFullData calls invoke with get_pr_full_data", async () => {
    const data = { pr: {}, reviews: [], checks: [] };
    (invoke as any).mockResolvedValueOnce(data);
    const result = await getPrFullData("w1");
    expect(invoke).toHaveBeenCalledWith("get_pr_full_data", { workspaceId: "w1" });
    expect(result).toEqual(data);
  });

  it("getReviewsAndComments calls invoke with get_reviews_and_comments", async () => {
    const data = { reviews: [], comments: [] };
    (invoke as any).mockResolvedValueOnce(data);
    const result = await getReviewsAndComments("w1");
    expect(invoke).toHaveBeenCalledWith("get_reviews_and_comments", { workspaceId: "w1" });
    expect(result).toEqual(data);
  });
});

// ─── LSP commands ────────────────────────────────────────────────────────────

describe("LSP commands", () => {
  it("getLspCatalog calls invoke with get_lsp_catalog", async () => {
    const catalog = [{ name: "typescript", description: "TS support" }];
    (invoke as any).mockResolvedValueOnce(catalog);
    const result = await getLspCatalog();
    expect(invoke).toHaveBeenCalledWith("get_lsp_catalog");
    expect(result).toEqual(catalog);
  });

  it("listLspPlugins calls invoke with list_lsp_plugins", async () => {
    const plugins = [{ name: "typescript", enabled: true }];
    (invoke as any).mockResolvedValueOnce(plugins);
    const result = await listLspPlugins();
    expect(invoke).toHaveBeenCalledWith("list_lsp_plugins");
    expect(result).toEqual(plugins);
  });

  it("installLspPlugin calls invoke with install_lsp_plugin", async () => {
    const request = { repoPath: "/path", pluginName: "typescript" };
    await installLspPlugin(request as any);
    expect(invoke).toHaveBeenCalledWith("install_lsp_plugin", { request });
  });

  it("uninstallLspPlugin calls invoke with uninstall_lsp_plugin", async () => {
    const request = { repoPath: "/path", pluginName: "typescript" };
    await uninstallLspPlugin(request as any);
    expect(invoke).toHaveBeenCalledWith("uninstall_lsp_plugin", { request });
  });

  it("detectLspSuggestions calls invoke with detect_lsp_suggestions", async () => {
    const suggestions = [{ name: "typescript", installCmd: "npm i" }];
    (invoke as any).mockResolvedValueOnce(suggestions);
    const result = await detectLspSuggestions("/path/to/repo");
    expect(invoke).toHaveBeenCalledWith("detect_lsp_suggestions", { repoPath: "/path/to/repo" });
    expect(result).toEqual(suggestions);
  });
});

// ─── Workspace template commands ─────────────────────────────────────────────

describe("Workspace template commands", () => {
  it("createWorkspaceTemplate calls invoke with create_workspace_template", async () => {
    const request = { repoId: "r1", name: "template1", description: null, setupScript: null, runScript: null, archiveScript: null, runScriptMode: null, envVars: null, sparseDirs: null, autoCommit: null };
    const template = { id: "t1", repoId: "r1", name: "template1", description: null, setupScript: null, runScript: null, archiveScript: null, runScriptMode: "parallel", envVars: {}, sparseDirs: null, autoCommit: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
    (invoke as any).mockResolvedValueOnce(template);
    const result = await createWorkspaceTemplate(request);
    expect(invoke).toHaveBeenCalledWith("create_workspace_template", { request });
    expect(result).toEqual(template);
  });

  it("listWorkspaceTemplates calls invoke with list_workspace_templates", async () => {
    const templates = [{ id: "t1", name: "tmpl" }];
    (invoke as any).mockResolvedValueOnce(templates);
    const result = await listWorkspaceTemplates("r1");
    expect(invoke).toHaveBeenCalledWith("list_workspace_templates", { repoId: "r1" });
    expect(result).toEqual(templates);
  });

  it("updateWorkspaceTemplate calls invoke with update_workspace_template", async () => {
    const request = { name: "updated", description: null, setupScript: null, runScript: null, archiveScript: null, runScriptMode: null, envVars: null, sparseDirs: null, autoCommit: null };
    const template = { id: "t1", name: "updated" };
    (invoke as any).mockResolvedValueOnce(template);
    const result = await updateWorkspaceTemplate("t1", request);
    expect(invoke).toHaveBeenCalledWith("update_workspace_template", { templateId: "t1", request });
    expect(result).toEqual(template);
  });

  it("deleteWorkspaceTemplate calls invoke with delete_workspace_template", async () => {
    await deleteWorkspaceTemplate("t1");
    expect(invoke).toHaveBeenCalledWith("delete_workspace_template", { templateId: "t1" });
  });
});

// ─── File bookmark commands ──────────────────────────────────────────────────

describe("File bookmark commands", () => {
  it("createBookmark calls invoke with create_bookmark", async () => {
    const request = { repoId: "r1", filePath: "src/main.ts", lineNumber: 10, note: null, color: null };
    const bookmark = { id: "b1", ...request, note: null, color: null, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
    (invoke as any).mockResolvedValueOnce(bookmark);
    const result = await createBookmark(request);
    expect(invoke).toHaveBeenCalledWith("create_bookmark", { request });
    expect(result).toEqual(bookmark);
  });

  it("listBookmarks calls invoke with list_bookmarks", async () => {
    const bookmarks = [{ id: "b1", filePath: "a.ts" }];
    (invoke as any).mockResolvedValueOnce(bookmarks);
    const result = await listBookmarks("r1");
    expect(invoke).toHaveBeenCalledWith("list_bookmarks", { repoId: "r1" });
    expect(result).toEqual(bookmarks);
  });

  it("updateBookmark calls invoke with update_bookmark", async () => {
    const request = { note: "updated note", color: null, lineNumber: null };
    const bookmark = { id: "b1", note: "updated note" };
    (invoke as any).mockResolvedValueOnce(bookmark);
    const result = await updateBookmark("b1", request);
    expect(invoke).toHaveBeenCalledWith("update_bookmark", { bookmarkId: "b1", request });
    expect(result).toEqual(bookmark);
  });

  it("deleteBookmark calls invoke with delete_bookmark", async () => {
    await deleteBookmark("b1");
    expect(invoke).toHaveBeenCalledWith("delete_bookmark", { bookmarkId: "b1" });
  });

  it("toggleBookmark calls invoke with toggle_bookmark", async () => {
    const bookmark = { id: "b1", repoId: "r1", filePath: "a.ts", lineNumber: 5, note: null, color: null, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
    (invoke as any).mockResolvedValueOnce(bookmark);
    const result = await toggleBookmark("r1", "a.ts", 5);
    expect(invoke).toHaveBeenCalledWith("toggle_bookmark", { repoId: "r1", filePath: "a.ts", lineNumber: 5 });
    expect(result).toEqual(bookmark);
  });

  it("toggleBookmark returns null when bookmark is removed", async () => {
    (invoke as any).mockResolvedValueOnce(null);
    const result = await toggleBookmark("r1", "a.ts", 5);
    expect(invoke).toHaveBeenCalledWith("toggle_bookmark", { repoId: "r1", filePath: "a.ts", lineNumber: 5 });
    expect(result).toBeNull();
  });
});

// ─── Prompt library commands ─────────────────────────────────────────────────

describe("Prompt library commands", () => {
  it("createPrompt calls invoke with create_prompt", async () => {
    const request = { name: "My Prompt", content: "Do something", description: null, category: null, tags: null };
    const prompt = { id: "p1", name: "My Prompt", content: "Do something", description: null, category: null, tags: [], sortOrder: 0, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
    (invoke as any).mockResolvedValueOnce(prompt);
    const result = await createPrompt(request);
    expect(invoke).toHaveBeenCalledWith("create_prompt", { request });
    expect(result).toEqual(prompt);
  });

  it("listPrompts calls invoke with list_prompts", async () => {
    const prompts = [{ id: "p1", name: "prompt" }];
    (invoke as any).mockResolvedValueOnce(prompts);
    const result = await listPrompts();
    expect(invoke).toHaveBeenCalledWith("list_prompts");
    expect(result).toEqual(prompts);
  });

  it("updatePrompt calls invoke with update_prompt", async () => {
    const request = { name: "Updated", content: null, description: null, category: null, tags: null };
    const prompt = { id: "p1", name: "Updated" };
    (invoke as any).mockResolvedValueOnce(prompt);
    const result = await updatePrompt("p1", request);
    expect(invoke).toHaveBeenCalledWith("update_prompt", { promptId: "p1", request });
    expect(result).toEqual(prompt);
  });

  it("deletePrompt calls invoke with delete_prompt", async () => {
    await deletePrompt("p1");
    expect(invoke).toHaveBeenCalledWith("delete_prompt", { promptId: "p1" });
  });
});

// ─── Snippet manager commands ────────────────────────────────────────────────

describe("Snippet manager commands", () => {
  it("createSnippet calls invoke with create_snippet", async () => {
    const request = { title: "My Snippet", content: "code here", language: null, description: null, tags: null, source: null };
    const snippet = { id: "s1", title: "My Snippet", content: "code here", language: null, description: null, tags: [], source: null, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
    (invoke as any).mockResolvedValueOnce(snippet);
    const result = await createSnippet(request);
    expect(invoke).toHaveBeenCalledWith("create_snippet", { request });
    expect(result).toEqual(snippet);
  });

  it("listSnippets calls invoke with list_snippets", async () => {
    const snippets = [{ id: "s1", title: "snippet" }];
    (invoke as any).mockResolvedValueOnce(snippets);
    const result = await listSnippets();
    expect(invoke).toHaveBeenCalledWith("list_snippets");
    expect(result).toEqual(snippets);
  });

  it("updateSnippet calls invoke with update_snippet", async () => {
    const request = { title: "Updated", content: null, language: null, description: null, tags: null, source: null };
    const snippet = { id: "s1", title: "Updated" };
    (invoke as any).mockResolvedValueOnce(snippet);
    const result = await updateSnippet("s1", request);
    expect(invoke).toHaveBeenCalledWith("update_snippet", { snippetId: "s1", request });
    expect(result).toEqual(snippet);
  });

  it("deleteSnippet calls invoke with delete_snippet", async () => {
    await deleteSnippet("s1");
    expect(invoke).toHaveBeenCalledWith("delete_snippet", { snippetId: "s1" });
  });
});

// ─── Test runner commands ────────────────────────────────────────────────────

describe("Test runner commands", () => {
  it("detectTestFramework calls invoke with detect_test_framework", async () => {
    const config = { framework: "vitest", testCommand: "npx vitest", testFileCommand: null, workingDir: null, coverageCommand: null };
    (invoke as any).mockResolvedValueOnce(config);
    const result = await detectTestFramework("r1");
    expect(invoke).toHaveBeenCalledWith("detect_test_framework", { repoId: "r1" });
    expect(result).toEqual(config);
  });

  it("getTestRunnerConfig calls invoke with get_test_runner_config", async () => {
    const config = { framework: "jest", testCommand: "npx jest", testFileCommand: null, workingDir: null, coverageCommand: null };
    (invoke as any).mockResolvedValueOnce(config);
    const result = await getTestRunnerConfig("r1");
    expect(invoke).toHaveBeenCalledWith("get_test_runner_config", { repoId: "r1" });
    expect(result).toEqual(config);
  });

  it("saveTestRunnerConfig calls invoke with save_test_runner_config", async () => {
    const config = { framework: "vitest" as const, testCommand: "npx vitest", testFileCommand: null, workingDir: null, coverageCommand: null };
    await saveTestRunnerConfig("r1", config);
    expect(invoke).toHaveBeenCalledWith("save_test_runner_config", { repoId: "r1", config });
  });

  it("runTests calls invoke with run_tests", async () => {
    await runTests("ctx1", "workspace");
    expect(invoke).toHaveBeenCalledWith("run_tests", { contextId: "ctx1", contextType: "workspace", fileFilter: undefined });
  });

  it("runTests calls invoke with fileFilter", async () => {
    await runTests("ctx1", "workspace", "src/foo.test.ts");
    expect(invoke).toHaveBeenCalledWith("run_tests", { contextId: "ctx1", contextType: "workspace", fileFilter: "src/foo.test.ts" });
  });

  it("stopTests calls invoke with stop_tests", async () => {
    await stopTests("ctx1");
    expect(invoke).toHaveBeenCalledWith("stop_tests", { contextId: "ctx1" });
  });

  it("startTestWatch calls invoke with start_test_watch", async () => {
    await startTestWatch("ctx1", "repo");
    expect(invoke).toHaveBeenCalledWith("start_test_watch", { contextId: "ctx1", contextType: "repo" });
  });

  it("stopTestWatch calls invoke with stop_test_watch", async () => {
    await stopTestWatch("ctx1");
    expect(invoke).toHaveBeenCalledWith("stop_test_watch", { contextId: "ctx1" });
  });

  it("listTestHistory calls invoke with list_test_history", async () => {
    const history = [{ id: "h1", repoId: "r1", ranAt: "2024-01-01", total: 10, passed: 9, failed: 1, skipped: 0, durationMs: 5000 }];
    (invoke as any).mockResolvedValueOnce(history);
    const result = await listTestHistory("r1");
    expect(invoke).toHaveBeenCalledWith("list_test_history", { repoId: "r1", limit: undefined });
    expect(result).toEqual(history);
  });

  it("listTestHistory calls invoke with limit", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await listTestHistory("r1", 5);
    expect(invoke).toHaveBeenCalledWith("list_test_history", { repoId: "r1", limit: 5 });
  });

  it("runCoverage calls invoke with run_coverage", async () => {
    await runCoverage("ctx1", "workspace");
    expect(invoke).toHaveBeenCalledWith("run_coverage", { contextId: "ctx1", contextType: "workspace" });
  });
});

// ─── Usage dashboard commands ────────────────────────────────────────────────

describe("Usage dashboard commands", () => {
  it("getUsageData calls invoke with get_usage_data", async () => {
    const data = [{ workspaceId: "w1", workspaceName: "ws", timestamp: "2024-01-01", totalCostUsd: 0.5, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, numTurns: 3, durationMs: 10000 }];
    (invoke as any).mockResolvedValueOnce(data);
    const result = await getUsageData();
    expect(invoke).toHaveBeenCalledWith("get_usage_data", { workspaceId: undefined, since: undefined });
    expect(result).toEqual(data);
  });

  it("getUsageData calls invoke with workspaceId and since", async () => {
    (invoke as any).mockResolvedValueOnce([]);
    await getUsageData("w1", "2024-01-01");
    expect(invoke).toHaveBeenCalledWith("get_usage_data", { workspaceId: "w1", since: "2024-01-01" });
  });
});

// ─── Export commands ─────────────────────────────────────────────────────────

describe("Export commands", () => {
  it("exportWorkspace calls invoke with export_workspace", async () => {
    const options = { workspaceId: "w1", includeChat: true, includeTodos: true, includeRepoSettings: false, includeEnvVars: false, includeBookmarks: true, includeSnippets: false };
    (invoke as any).mockResolvedValueOnce("exported-json-string");
    const result = await exportWorkspace(options);
    expect(invoke).toHaveBeenCalledWith("export_workspace", { options });
    expect(result).toBe("exported-json-string");
  });
});

// ─── Dev container commands ──────────────────────────────────────────────────

describe("Dev container commands", () => {
  it("startContainer calls invoke with start_container", async () => {
    const state = { workspaceId: "w1", status: "running", containerId: "c1", containerName: "fury-w1", logTail: [] };
    (invoke as any).mockResolvedValueOnce(state);
    const result = await startContainer("w1");
    expect(invoke).toHaveBeenCalledWith("start_container", { workspaceId: "w1" });
    expect(result).toEqual(state);
  });

  it("stopContainer calls invoke with stop_container", async () => {
    await stopContainer("w1");
    expect(invoke).toHaveBeenCalledWith("stop_container", { workspaceId: "w1" });
  });

  it("rebuildContainer calls invoke with rebuild_container", async () => {
    const state = { workspaceId: "w1", status: "running", containerId: "c2", containerName: "fury-w1", logTail: [] };
    (invoke as any).mockResolvedValueOnce(state);
    const result = await rebuildContainer("w1");
    expect(invoke).toHaveBeenCalledWith("rebuild_container", { workspaceId: "w1" });
    expect(result).toEqual(state);
  });

  it("getContainerStatus calls invoke with get_container_status", async () => {
    const state = { workspaceId: "w1", status: "stopped", containerId: null, containerName: null, logTail: [] };
    (invoke as any).mockResolvedValueOnce(state);
    const result = await getContainerStatus("w1");
    expect(invoke).toHaveBeenCalledWith("get_container_status", { workspaceId: "w1" });
    expect(result).toEqual(state);
  });

  it("updateDevcontainerConfig calls invoke with update_devcontainer_config", async () => {
    const config = { enabled: true, backend: "devcontainerCli" as const, agentExecMode: "container" as const, image: null, composeFile: null, composeService: null, devcontainerPath: ".devcontainer", containerWorkspacePath: null, extraDockerArgs: [], containerEnvVars: {} };
    await updateDevcontainerConfig("w1", config);
    expect(invoke).toHaveBeenCalledWith("update_devcontainer_config", { workspaceId: "w1", config });
  });

  it("detectDevcontainer calls invoke with detect_devcontainer", async () => {
    (invoke as any).mockResolvedValueOnce(".devcontainer/devcontainer.json");
    const result = await detectDevcontainer("r1");
    expect(invoke).toHaveBeenCalledWith("detect_devcontainer", { repoId: "r1" });
    expect(result).toBe(".devcontainer/devcontainer.json");
  });

  it("detectDevcontainer returns null when no config found", async () => {
    (invoke as any).mockResolvedValueOnce(null);
    const result = await detectDevcontainer("r1");
    expect(invoke).toHaveBeenCalledWith("detect_devcontainer", { repoId: "r1" });
    expect(result).toBeNull();
  });
});
