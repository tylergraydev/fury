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
  getConflictedFiles,
  getConflictContent,
  resolveConflict,
  abortMerge,
  continueMerge,
  crossWorktreeDiff,
  getCrossWorktreeFileDiff,
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
      role: "user",
      content: [{ type: "text", text: "Hello" }],
      timestamp: 1704067200000, // 2024-01-01T00:00:00.000Z
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
      role: "assistant",
      content: [
        { type: "text", text: "Let me help" },
        { type: "toolUse", id: "tu-1", name: "read", input: { path: "/foo" } },
        { type: "toolResult", toolUseId: "tu-1", content: "file contents" },
      ],
      timestamp: 1704067200000,
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
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      timestamp: 1704067200000,
    });
  });

  it("does not include workspaceId in the result", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-1",
      workspaceId: "ws-1",
      role: "user",
      content: [],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = fromPersisted(persisted);
    expect(result).not.toHaveProperty("workspaceId");
  });
});

describe("toPersisted/fromPersisted round-trip", () => {
  it("round-trips a message preserving all data", () => {
    const original: ChatMessage = {
      id: "msg-rt",
      role: "system",
      content: [{ type: "text", text: "System message" }],
      timestamp: 1704153600000, // 2024-01-02T00:00:00.000Z
    };
    const persisted = toPersisted(original, "ws-rt");
    const restored = fromPersisted(persisted);
    expect(restored).toEqual(original);
  });

  it("round-trips with complex content blocks", () => {
    const original: ChatMessage = {
      id: "msg-complex",
      role: "assistant",
      content: [
        { type: "text", text: "Working on it" },
        { type: "toolUse", id: "tu-1", name: "bash", input: { command: "ls" } },
        { type: "toolResult", toolUseId: "tu-1", content: "file1.ts\nfile2.ts" },
        { type: "text", text: "Done!" },
      ],
      timestamp: 1704240000000,
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
    const request = { repoId: "r1", workspaceName: "ws", branchName: "feature" };
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
    const request = { workspaceId: "w1", message: "hello" };
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
    const request = { id: "t1", workspaceId: "w1", text: "Updated text" };
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
      experimental: { spotlightTesting: false, agentTeams: false },
      copilot: { enabled: false },
    };
    (invoke as any).mockResolvedValueOnce(settings);
    const result = await getAppSettings();
    expect(invoke).toHaveBeenCalledWith("get_app_settings");
    expect(result).toEqual(settings);
  });

  it("updateAppSettings calls invoke with update_app_settings", async () => {
    const settings = {
      theme: "blend" as const,
      provider: { providerType: "Anthropic" as const, envVars: { ANTHROPIC_API_KEY: "key" } },
      systemPromptAdditions: "Be helpful",
      analyticsEnabled: false,
      experimental: { spotlightTesting: true, agentTeams: false },
      copilot: { enabled: true },
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

  it("getConflictedFiles calls invoke with get_conflicted_files", async () => {
    const files = [{ path: "src/main.ts", conflictType: "BothModified" as const }];
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
