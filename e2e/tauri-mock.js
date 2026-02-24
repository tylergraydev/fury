// e2e/tauri-mock.js
// Injected into the browser via page.addInitScript before the app loads.
// Provides a complete mock of Tauri's IPC layer so the React frontend
// works in a regular Chromium browser without the Rust backend.

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════
  // Mock Data
  // ═══════════════════════════════════════════════════

  const REPOS = [
    {
      id: "repo-fury",
      name: "fury",
      path: "/Users/demo/Code/fury",
      defaultBranch: "main",
      currentBranch: "main",
    },
    {
      id: "repo-api",
      name: "acme-api",
      path: "/Users/demo/Code/acme-api",
      defaultBranch: "main",
      currentBranch: "develop",
    },
  ];

  const WORKSPACES = [
    {
      id: "ws-auth",
      repoId: "repo-fury",
      name: "add-auth",
      branch: "feature/add-auth",
      status: "Active",
      portBase: 3000,
      autoCommit: false,
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
      archivedAt: null,
    },
    {
      id: "ws-ui",
      repoId: "repo-fury",
      name: "redesign-sidebar",
      branch: "feature/redesign-sidebar",
      status: "Active",
      portBase: 3010,
      autoCommit: false,
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
      archivedAt: null,
    },
    {
      id: "ws-fix",
      repoId: "repo-api",
      name: "fix-pagination",
      branch: "fix/pagination-bug",
      status: "Active",
      portBase: 3020,
      autoCommit: true,
      createdAt: new Date(Date.now() - 1800_000).toISOString(),
      archivedAt: null,
    },
  ];

  const MESSAGES = {
    "ws-auth": [
      {
        id: "msg-1",
        workspaceId: "ws-auth",
        role: "user",
        content: [
          { type: "text", text: "Add JWT authentication to the API routes" },
        ],
        timestamp: Date.now() - 300_000,
      },
      {
        id: "msg-2",
        workspaceId: "ws-auth",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I'll add JWT authentication. Let me start by examining the current route structure.",
          },
          {
            type: "toolUse",
            id: "t1",
            name: "Read",
            input: { file_path: "/src/routes/index.ts" },
          },
          {
            type: "toolResult",
            toolUseId: "t1",
            content:
              'import express from "express";\nconst router = express.Router();\n\nrouter.get("/users", getUsers);\nrouter.post("/users", createUser);\n\nexport default router;',
          },
          {
            type: "text",
            text: "Now I'll create the auth middleware and update the routes to use it.",
          },
          {
            type: "toolUse",
            id: "t2",
            name: "Write",
            input: {
              file_path: "/src/middleware/auth.ts",
              content: "// JWT auth middleware",
            },
          },
          {
            type: "toolResult",
            toolUseId: "t2",
            content: "File written successfully",
          },
        ],
        timestamp: Date.now() - 240_000,
      },
    ],
  };

  const FILES = {
    "ws-auth": [
      "src/App.tsx",
      "src/main.tsx",
      "src/components/Header.tsx",
      "src/components/Sidebar.tsx",
      "src/lib/api.ts",
      "src/lib/auth.ts",
      "src/middleware/auth.ts",
      "src/routes/index.ts",
      "package.json",
      "tsconfig.json",
      "README.md",
    ],
    "ws-ui": [
      "src/App.tsx",
      "src/main.tsx",
      "src/components/Sidebar.tsx",
      "src/components/TopBar.tsx",
      "src/styles/sidebar.css",
      "package.json",
    ],
    "ws-fix": [
      "src/api/pagination.ts",
      "src/api/users.ts",
      "src/lib/db.ts",
      "tests/pagination.test.ts",
      "package.json",
    ],
  };

  const DIFFS = {
    "ws-auth": {
      files: [
        { path: "src/middleware/auth.ts", status: "Added", additions: 45, deletions: 0 },
        { path: "src/routes/index.ts", status: "Modified", additions: 12, deletions: 3 },
        { path: "src/lib/auth.ts", status: "Modified", additions: 8, deletions: 2 },
      ],
      totalAdditions: 65,
      totalDeletions: 5,
    },
  };

  const APP_SETTINGS = {
    agentType: "claude_code",
    theme: "blend",
    provider: { providerType: "Anthropic", envVars: {} },
    systemPromptAdditions: null,
    analyticsEnabled: false,
    experimental: { spotlightTesting: false, agentTeams: false },
    copilot: { enabled: false },
  };

  const REPO_SETTINGS = {
    setupScript: null,
    runScript: null,
    archiveScript: null,
    runScriptMode: "concurrent",
    envVars: {},
    worktreeBasePath: null,
  };

  // ═══════════════════════════════════════════════════
  // Callback System (mirrors Tauri's transformCallback)
  // ═══════════════════════════════════════════════════

  let nextCallbackId = 1;
  const callbacks = new Map();

  function transformCallback(callback, once) {
    const id = nextCallbackId++;
    callbacks.set(id, function (data) {
      if (once) callbacks.delete(id);
      return callback(data);
    });
    return id;
  }

  function unregisterCallback(id) {
    callbacks.delete(id);
  }

  function runCallback(id, data) {
    const cb = callbacks.get(id);
    if (cb) cb(data);
  }

  // ═══════════════════════════════════════════════════
  // Event Listener Registry
  // ═══════════════════════════════════════════════════

  // Maps event name → Set of callback IDs
  const eventListeners = new Map();

  // ═══════════════════════════════════════════════════
  // IPC Handler
  // ═══════════════════════════════════════════════════

  async function invoke(cmd, args) {
    // --- Event plugin ---
    if (cmd === "plugin:event|listen") {
      const { event, handler } = args;
      if (!eventListeners.has(event)) eventListeners.set(event, new Set());
      eventListeners.get(event).add(handler);
      // Return a listener ID (the handler callback ID serves this purpose)
      return handler;
    }
    if (cmd === "plugin:event|emit") {
      const { event: eventName, payload } = args;
      const listeners = eventListeners.get(eventName);
      if (listeners) {
        for (const handlerId of listeners) {
          runCallback(handlerId, { event: eventName, payload });
        }
      }
      return null;
    }
    if (cmd === "plugin:event|unlisten") {
      const { event, eventId } = args;
      const listeners = eventListeners.get(event);
      if (listeners) {
        listeners.delete(eventId);
        unregisterCallback(eventId);
      }
      return;
    }

    // --- Dialog plugin ---
    if (cmd === "plugin:dialog|open") return "/Users/demo/Code/fury";
    if (cmd === "plugin:dialog|save") return null;
    if (cmd === "plugin:dialog|message") return undefined;
    if (cmd === "plugin:dialog|ask") return false;
    if (cmd === "plugin:dialog|confirm") return false;

    // --- FS plugin ---
    if (cmd === "plugin:fs|read_text_file") return "";
    if (cmd === "plugin:fs|write_text_file") return undefined;

    // --- Path plugin ---
    if (cmd === "plugin:path|resolve_directory") return "/Users/demo/";
    if (cmd === "plugin:path|resolve") return "/Users/demo/Code";
    if (cmd === "plugin:path|join") return args.paths ? args.paths.join("/") : "";

    // --- Process plugin ---
    if (cmd === "plugin:process|exit") return;
    if (cmd === "plugin:process|relaunch") return;

    // --- App plugin ---
    if (cmd === "plugin:app|version") return "1.4.1";

    // --- Updater plugin ---
    if (cmd === "plugin:updater|check") return null;

    // --- App commands ---
    switch (cmd) {
      // Repositories
      case "list_repositories":
        return [...REPOS];
      case "add_repository":
        return { id: "repo-new", name: "new-repo", path: args.path, defaultBranch: "main", currentBranch: "main" };
      case "remove_repository":
        return;
      case "clone_repository":
        return { id: "repo-cloned", name: "cloned", path: args.path, defaultBranch: "main", currentBranch: "main" };
      case "init_repository":
        return { id: "repo-init", name: args.name, path: args.path, defaultBranch: "main", currentBranch: "main" };
      case "list_branches":
        return ["main", "develop", "feature/add-auth", "feature/redesign-sidebar"];

      // Workspaces
      case "list_workspaces":
        return [...WORKSPACES];
      case "list_archived_workspaces":
        return [];
      case "create_workspace":
        return { id: "ws-new", ...args.request, status: "Active", createdAt: new Date().toISOString(), archivedAt: null };
      case "archive_workspace":
      case "delete_workspace":
      case "rename_workspace":
      case "update_workspace_notes":
        return;
      case "restore_workspace":
        return { id: args.workspaceId, name: "restored", status: "Active", createdAt: new Date().toISOString(), archivedAt: null };

      // Agent
      case "send_message":
        return;
      case "stop_agent":
        return;
      case "get_agent_status":
        return { workspaceId: args.workspaceId, sessionId: null, status: "Idle", startedAt: null };
      case "clear_session":
        return;

      // Chat persistence
      case "save_chat_message":
        return;
      case "list_chat_messages":
        return MESSAGES[args.workspaceId] || [];
      case "clear_chat_messages":
        return;

      // Files
      case "list_workspace_files":
        return FILES[args.workspaceId] || [];
      case "list_repo_files":
        return FILES[args.repoId] || ["src/index.ts", "package.json", "README.md"];
      case "read_workspace_file":
      case "read_repo_file": {
        const fp = args.filePath || "unknown";
        const ext = fp.split(".").pop() || "";
        const langMap = { ts: "typescript", tsx: "typescript", js: "javascript", json: "json", md: "markdown", css: "css" };
        const lang = langMap[ext] || "plaintext";
        const contentMap = {
          "src/App.tsx": 'import React from "react";\n\nexport function App() {\n  return <div>Hello World</div>;\n}\n',
          "src/routes/index.ts": 'import express from "express";\nconst router = express.Router();\n\nrouter.get("/users", getUsers);\n\nexport default router;\n',
          "package.json": '{\n  "name": "mock-project",\n  "version": "1.0.0"\n}\n',
        };
        return { content: contentMap[fp] || ("// File content for " + fp + "\n"), language: lang };
      }
      case "write_workspace_file":
      case "write_repo_file":
        return { content: args.content || "", language: "typescript", formatted: true };
      case "list_repo_directories":
        return ["src", "src/components", "src/lib", "tests"];

      // Diffs
      case "get_diff":
        return DIFFS[args.workspaceId] || { files: [], totalAdditions: 0, totalDeletions: 0 };
      case "get_repo_diff":
        return { files: [], totalAdditions: 0, totalDeletions: 0 };
      case "get_file_diff":
      case "get_repo_file_diff":
        return { path: args.filePath, original: "", modified: "", language: "typescript" };

      // Settings
      case "get_app_settings":
        return APP_SETTINGS;
      case "update_app_settings":
        return;
      case "get_repo_settings":
        return REPO_SETTINGS;
      case "update_repo_settings":
        return;

      // Checkpoints
      case "list_checkpoints":
        return [];
      case "revert_to_checkpoint":
        return;

      // Todos
      case "list_todos":
        return [];
      case "get_todo_summary":
        return { total: 0, completed: 0, allCompleted: true, items: [] };
      case "add_todo":
        return { id: "todo-1", workspaceId: args.request?.workspaceId, text: args.request?.text, completed: false, sortOrder: 0 };
      case "update_todo":
      case "delete_todo":
      case "reorder_todos":
        return;
      case "toggle_todo":
        return true;

      // Slash commands
      case "list_slash_commands":
        return [];
      case "get_slash_command_content":
        return null;

      // PR
      case "get_pr_info":
        // ws-ui has an existing PR for testing PR status view
        if (args.workspaceId === "ws-ui") {
          return {
            workspaceId: "ws-ui",
            prNumber: 42,
            prUrl: "https://github.com/demo/fury/pull/42",
            title: "Redesign sidebar layout",
            state: "OPEN",
            checks: [
              { name: "build", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/demo/fury/actions/runs/1" },
              { name: "lint", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://github.com/demo/fury/actions/runs/2" },
              { name: "test", status: "IN_PROGRESS", conclusion: null, detailsUrl: null },
            ],
            mergeable: "MERGEABLE",
          };
        }
        return { workspaceId: args.workspaceId, prNumber: null, prUrl: null, title: null, state: null, checks: [], mergeable: null };
      case "get_pr_checks":
        return [];
      case "create_pr":
        return { workspaceId: args.request?.workspaceId, prNumber: 42, prUrl: "https://github.com/demo/fury/pull/42", title: args.request?.title, state: "OPEN", checks: [], mergeable: "MERGEABLE" };
      case "push_changes":
      case "fix_failing_checks":
        return;
      case "merge_pr":
        return { success: true, message: "Merged", mergeMethod: "squash" };

      // Git
      case "get_branch_status":
        return { branch: "feature/add-auth", defaultBranch: "main", ahead: 3, behind: 0, hasUpstream: true };
      case "get_git_log":
        return [];
      case "fetch_upstream":
      case "pull_rebase":
      case "pull_merge":
        return { success: true, message: "OK", hasConflicts: false, conflictedFiles: [] };
      case "get_conflicted_files":
        return [];
      case "get_conflict_content":
        return { path: "", base: "", ours: "", theirs: "", merged: "", language: "typescript" };
      case "resolve_conflict":
      case "abort_merge_cmd":
      case "continue_merge":
        return;
      case "cross_worktree_diff":
        return { files: [], totalAdditions: 0, totalDeletions: 0 };
      case "get_cross_worktree_file_diff":
        return { path: "", original: "", modified: "", language: "typescript" };

      // MCP
      case "list_mcp_servers":
        return [];
      case "add_mcp_server":
      case "remove_mcp_server":
        return;
      case "detect_cursor_config":
        return false;
      case "import_cursor_config":
        return { mcpServersFound: 0, mcpServersImported: 0, rulesFound: false };

      // Cursorrules
      case "detect_cursorrules":
        return false;
      case "import_cursorrules":
        return { rulesFound: false, claudeMdExisted: false, written: false, claudeMdPath: "" };

      // Sparse checkout
      case "update_sparse_dirs":
        return;

      // Linking
      case "link_workspaces":
      case "unlink_workspaces":
        return;
      case "get_linked_workspaces":
        return [];

      // Spotlight
      case "start_spotlight":
      case "stop_spotlight":
        return;

      // Terminal
      case "create_terminal":
      case "create_repo_terminal":
        return "terminal-mock-1";
      case "write_terminal":
      case "resize_terminal":
      case "close_terminal":
        return;

      // Scripts
      case "run_script":
      case "stop_script":
      case "run_repo_script":
      case "stop_repo_script":
        return;

      // Type definitions
      case "load_type_definitions":
        return { tsconfig: null, libs: [] };

      default:
        console.warn("[tauri-mock] Unhandled command:", cmd, args);
        return undefined;
    }
  }

  // ═══════════════════════════════════════════════════
  // Install on window
  // ═══════════════════════════════════════════════════

  window.__TAURI_INTERNALS__ = {
    invoke: invoke,
    transformCallback: transformCallback,
    convertFileSrc: function (filePath) {
      return "asset://localhost/" + encodeURIComponent(filePath);
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    plugins: {
      path: { sep: "/", delimiter: ":" },
    },
  };

  // The @tauri-apps/api/event module calls this in _unlisten() before
  // invoking plugin:event|unlisten. Without it, event cleanup crashes.
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: function (_event, _eventId) {
      // no-op — our mock handles cleanup in the plugin:event|unlisten handler
    },
  };

  // ═══════════════════════════════════════════════════
  // E2E Event Emitter Helper
  // ═══════════════════════════════════════════════════

  /**
   * Test helper to emit a Tauri event from Playwright.
   * Usage in tests:
   *   await page.evaluate(() => {
   *     window.__E2E_EMIT_EVENT__("agent-stream:ws-auth", { type: "assistantText", text: "Hello" });
   *   });
   */
  window.__E2E_EMIT_EVENT__ = function (eventName, payload) {
    const listeners = eventListeners.get(eventName);
    if (!listeners || listeners.size === 0) {
      console.warn("[tauri-mock] No listeners for event:", eventName);
      return;
    }
    for (const handlerId of listeners) {
      runCallback(handlerId, { event: eventName, payload: payload });
    }
  };
})();
