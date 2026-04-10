# Fury Memory System — Architecture Design (v2)

> **Note:** This is an internal design document. For user-facing documentation, see [Memory](core/memory.mdx).
>
> **Update (v2.1):** Layer 3 now supports [MemPalace](https://github.com/milla-jovovich/mempalace) as an external MCP server for semantic search via ChromaDB. When MemPalace is available, it replaces the in-process MCP server with 19 tools including vector search, knowledge graph queries, and palace navigation. The in-process server remains as a fallback. MemPalace is enabled by default — see Settings > Memory.

## How Fury Talks to Claude

Fury uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) via a **Node.js sidecar process**. The flow is:

```
Fury UI (React) → Rust Backend (Tauri) → Node.js Sidecar → sdkQuery() → Claude API
```

The sidecar (`src-tauri/sidecar/src/index.ts`) calls `sdkQuery({ prompt, options })` which accepts:

- `mcpServers` — register MCP servers (stdio, SSE, HTTP, or **in-process SDK servers**)
- `hooks` — callbacks for `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `Stop`, etc.
- `systemPrompt` — string or `{ type: 'preset', preset: 'claude_code', append: '...' }`
- `settingSources` — controls loading of `CLAUDE.md` and `.claude/` settings
- `agents` — define subagents with their own tools, prompts, and MCP servers

This gives us **three first-class integration points** for memory:

1. **In-process MCP server** — runs inside the sidecar, no separate process needed
2. **SDK hooks** — tap every tool call and session lifecycle event
3. **System prompt injection** — prepend memory context before each session

---

## Three-Layer Architecture (Revised)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Sidecar Process                       │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  sdkQuery({ prompt, options: {                            │  │
│  │    systemPrompt: { preset: 'claude_code', append: L1 },  │  │  ← Layer 1
│  │    hooks: { PostToolUse: [L2], SessionEnd: [L2] },        │  │  ← Layer 2
│  │    mcpServers: { 'fury-memory': inProcessMcpServer },     │  │  ← Layer 3
│  │  }})                                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Layer 1: Context Injection (system prompt append)               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Before each query: read compressed memories from DB      │   │
│  │  → format as markdown → append to systemPrompt            │   │
│  │  Cost: ~2-4K tokens, fixed per session                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Layer 2: Observation Hooks (PostToolUse + SessionEnd)           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostToolUse hook: extract observations from tool results │   │
│  │  SessionEnd hook: compress & persist to SQLite            │   │
│  │  Cost: 0 tokens (runs in sidecar, not sent to API)        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Layer 3: On-Demand MCP Server (fury-memory)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  In-process MCP server via createSdkMcpServer()          │   │
│  │  Tools: search_memory, save_learning, get_context         │   │
│  │  Backed by SQLite + FTS5                                  │   │
│  │  Cost: ~200-500 tokens per query, only when Claude asks   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  SQLite (fury.db)    │
                    │  memory_observations │
                    │  memory_snapshots    │
                    │  + FTS5 index        │
                    └─────────────────────┘
```

---

## Layer 1: Context Injection via System Prompt

### What It Does
Before each `sdkQuery()` call, Fury reads compressed memory snapshots from SQLite and appends them to the system prompt. Claude starts every session already knowing the project context.

### Implementation

The sidecar already builds the `systemPrompt` option:

```typescript
// Current code (index.ts:101-107)
if (systemPrompt) {
  options.systemPrompt = {
    type: "preset",
    preset: "claude_code",
    append: systemPrompt,
  };
}
```

We extend this to prepend memory context:

```typescript
// NEW: Build memory context before query
const memoryContext = await memoryStore.getContextForWorkspace(id, cwd);

const fullSystemPrompt = [
  systemPrompt || '',
  '',
  '<!-- FURY:MEMORY:START -->',
  memoryContext,  // Compressed learnings, decisions, patterns
  '<!-- FURY:MEMORY:END -->',
].filter(Boolean).join('\n');

options.systemPrompt = {
  type: "preset",
  preset: "claude_code",
  append: fullSystemPrompt,
};
```

### What Gets Injected

The memory context is a markdown block with three sections:

```markdown
## Project Memory

### Key Decisions
- Chose Zustand over Redux for state management (workspace: auth-refactor, 2026-04-01)
- Using barrel exports for all component directories (repo-wide)

### Patterns & Conventions
- All IPC wrappers go in src/lib/tauri/*.ts
- Tests use vi.waitFor() for async assertions after rAF
- Mutex lock order: workspaces → repositories → container_states

### Recent Context
- Last session worked on: JWT token refresh logic in auth.rs
- Open issue: flaky test in workspaceStore.test.ts line 247
```

### Scoping: Per-Workspace + Per-Repo + Global

```typescript
async getContextForWorkspace(workspaceId: string, cwd: string): Promise<string> {
  const sections: string[] = [];

  // Global preferences (user-level, all projects)
  const global = await this.getSnapshots('global', null);
  if (global.length) sections.push('### User Preferences\n' + format(global));

  // Repo-level patterns (shared across branches)
  const repoId = await this.getRepoIdForWorkspace(workspaceId);
  const repo = await this.getSnapshots('repo', repoId);
  if (repo.length) sections.push('### Project Patterns\n' + format(repo));

  // Workspace-specific decisions & progress
  const ws = await this.getSnapshots('workspace', workspaceId);
  if (ws.length) sections.push('### Workspace Context\n' + format(ws));

  return sections.join('\n\n');
}
```

### Token Budget
- Global preferences: ~200-500 tokens
- Repo patterns: ~500-1K tokens
- Workspace context: ~500-1K tokens
- **Total: ~1.5-2.5K tokens per session** (fixed cost)

---

## Layer 2: Observation Extraction via SDK Hooks

### What It Does
Uses the SDK's `hooks` option to tap into tool calls and session lifecycle events. Extracts high-signal observations without sending any extra tokens to the API.

### Implementation

The SDK supports hooks directly in the `options` object:

```typescript
// In sidecar index.ts, add to the options object:
options.hooks = {
  PostToolUse: [{
    hooks: [async (input: PostToolUseHookInput) => {
      // Extract observations from tool results
      const observation = extractObservation(input);
      if (observation) {
        await memoryStore.saveObservation(id, observation);
      }
      return {};  // Don't modify tool behavior
    }],
  }],

  SessionEnd: [{
    hooks: [async (input: SessionEndHookInput) => {
      // Compress accumulated observations into snapshots
      await memoryStore.compressObservations(id);
      return {};
    }],
  }],

  SessionStart: [{
    hooks: [async (input: SessionStartHookInput) => {
      // Log session start for timeline tracking
      await memoryStore.recordSessionStart(id, input.session_id);
      return {};
    }],
  }],
};
```

### What Gets Extracted (PostToolUse)

```typescript
function extractObservation(input: PostToolUseHookInput): Observation | null {
  const { tool_name, tool_input, tool_response } = input;

  switch (tool_name) {
    case 'Write':
    case 'Edit':
      // File was modified — record what and why
      return {
        type: 'file_change',
        content: `Modified ${tool_input.file_path}`,
        filePaths: [tool_input.file_path],
        sourceTool: tool_name,
      };

    case 'Bash':
      // Check for errors in output
      const output = String(tool_response);
      if (output.includes('error') || output.includes('Error') || output.includes('FAILED')) {
        return {
          type: 'error',
          content: `Command failed: ${tool_input.command}\nOutput: ${output.slice(0, 500)}`,
          sourceTool: 'Bash',
        };
      }
      return null;  // Successful bash commands are low-signal

    case 'Read':
      // Don't record reads — too noisy
      return null;

    default:
      return null;
  }
}
```

### Compression (SessionEnd)

When a session ends, raw observations are compressed:

```typescript
async compressObservations(workspaceId: string): Promise<void> {
  const observations = await this.getUncompressedObservations(workspaceId);
  if (observations.length < 3) return;  // Not enough to compress

  // Rule-based compression (zero API cost):
  // 1. Deduplicate similar file_change observations
  // 2. Keep only the most recent error per file
  // 3. Extract decision-like patterns from assistant text
  // 4. Merge into existing snapshots

  const compressed = ruleBasedCompress(observations);
  await this.saveSnapshot({
    scope: 'workspace',
    scopeId: workspaceId,
    category: 'progress',
    content: compressed,
    observationIds: observations.map(o => o.id),
  });
}
```

### Token Cost: **Zero**
Hooks run in the sidecar process, not in the API context. They observe tool calls that already happened without adding any tokens to the conversation.

---

## Layer 3: In-Process MCP Server

### What It Does
Exposes memory as tools that Claude can call on-demand during a session. Uses the SDK's `createSdkMcpServer()` to run the MCP server **in the same Node.js process** as the sidecar — no separate process, no stdio pipes.

### Implementation

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const memoryServer = createSdkMcpServer({
  name: "fury-memory",
  version: "1.0.0",
  tools: [
    tool(
      "search_memory",
      "Search past observations and learnings from previous sessions. Use when you need context about past decisions, error patterns, or conventions in this project.",
      {
        query: z.string().describe("Natural language search query"),
        scope: z.enum(["workspace", "repo", "global"]).default("workspace"),
        limit: z.number().default(5),
      },
      async ({ query, scope, limit }) => {
        const results = await memoryStore.search(query, scope, limit);
        return {
          content: [{
            type: "text",
            text: results.length
              ? results.map(r => `[${r.category}] ${r.content}`).join('\n\n')
              : "No matching memories found.",
          }],
        };
      },
      { annotations: { readOnlyHint: true, openWorldHint: false } }
    ),

    tool(
      "save_learning",
      "Save an important learning, decision, or pattern for future sessions. Use when you discover something important about this project that should persist.",
      {
        content: z.string().describe("What was learned"),
        category: z.enum(["decision", "pattern", "preference", "error_fix"]),
        scope: z.enum(["workspace", "repo", "global"]).default("workspace"),
      },
      async ({ content, category, scope }) => {
        await memoryStore.saveLearning(content, category, scope);
        return {
          content: [{ type: "text", text: `Saved to ${scope} memory.` }],
        };
      },
      { annotations: { readOnlyHint: false, openWorldHint: false } }
    ),

    tool(
      "get_file_context",
      "Get memory context related to specific files — what was changed, why, and any known issues.",
      {
        filePaths: z.array(z.string()).describe("File paths to look up"),
      },
      async ({ filePaths }) => {
        const context = await memoryStore.getFileContext(filePaths);
        return {
          content: [{ type: "text", text: context || "No history for these files." }],
        };
      },
      { annotations: { readOnlyHint: true, openWorldHint: false } }
    ),
  ],
});
```

Then register it in the query options:

```typescript
options.mcpServers = {
  ...existingMcpServers,
  'fury-memory': memoryServer,  // In-process, no spawn overhead
};
```

### Why In-Process MCP?

The SDK supports `createSdkMcpServer()` which runs the MCP server in the same Node.js process. This means:

- **Zero startup latency** — no process spawn, no stdio handshake
- **Direct access to memoryStore** — shares the same SQLite connection
- **No extra dependencies** — just Zod for schema validation (already in the SDK)
- Claude discovers the tools automatically via MCP protocol

### Token Cost
- Tool definitions in context: ~500 tokens (fixed, loaded once)
- Per search query: ~200-400 tokens (query + results)
- Per save: ~100 tokens
- **Only costs tokens when Claude chooses to use the tools**

---

## Database Schema

### New Tables (add via migration)

```sql
-- Raw observations extracted from agent sessions via hooks
CREATE TABLE IF NOT EXISTS memory_observations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_id TEXT NOT NULL REFERENCES repositories(id),
    session_id TEXT,
    observation_type TEXT NOT NULL,     -- 'decision', 'error', 'pattern', 'file_change', 'preference'
    content TEXT NOT NULL,
    compressed_content TEXT,            -- Rule-based summary
    source_tool TEXT,                   -- 'Edit', 'Bash', 'Write', etc.
    file_paths TEXT,                    -- JSON array
    tokens_raw INTEGER,
    tokens_compressed INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    accessed_at TEXT
);

CREATE INDEX idx_obs_workspace ON memory_observations(workspace_id);
CREATE INDEX idx_obs_repo ON memory_observations(repo_id);
CREATE INDEX idx_obs_type ON memory_observations(observation_type);

-- FTS5 for fast text search
CREATE VIRTUAL TABLE memory_observations_fts USING fts5(
    content,
    compressed_content,
    content=memory_observations,
    content_rowid=rowid
);

-- Compressed snapshots used by Layer 1 (context injection)
CREATE TABLE IF NOT EXISTS memory_snapshots (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,                -- 'workspace', 'repo', 'global'
    scope_id TEXT,                      -- workspace_id, repo_id, or NULL
    category TEXT NOT NULL,             -- 'decisions', 'patterns', 'progress', 'preferences'
    content TEXT NOT NULL,              -- Markdown for system prompt
    observation_ids TEXT NOT NULL,      -- JSON array of source IDs
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    supersedes TEXT                     -- Previous snapshot this replaces
);

CREATE INDEX idx_snap_scope ON memory_snapshots(scope, scope_id);
```

---

## Communication: Rust ↔ Sidecar

The sidecar already communicates with Rust via NDJSON on stdin/stdout. For memory, we extend the protocol:

### New Sidecar Commands (Rust → Sidecar)

```typescript
// Add to protocol.ts
| {
    type: "memory_prepare";
    id: string;                // workspace UUID
    workspaceId: string;
    repoId: string;
  }
| {
    type: "memory_query";      // Direct DB query from Rust
    id: string;
    query: string;
    scope: "workspace" | "repo" | "global";
  }
```

### New Sidecar Events (Sidecar → Rust)

```typescript
// Memory events emitted to Rust for persistence
| {
    type: "memory_observation";
    id: string;
    observation: {
      type: string;
      content: string;
      sourceTool: string;
      filePaths: string[];
    };
  }
| {
    type: "memory_snapshot";
    id: string;
    snapshot: {
      scope: string;
      category: string;
      content: string;
    };
  }
```

**Design choice**: The sidecar extracts observations (hooks run there), but the Rust backend owns SQLite persistence. The sidecar emits `memory_observation` events via stdout, and the Rust side's `handle_sidecar_line()` writes them to the database. This keeps the single-writer pattern for SQLite.

---

## Session Lifecycle (How It All Fits Together)

```
1. USER SENDS MESSAGE
        │
        ▼
2. RUST: agent.rs receives SendMessageRequest
   - Reads memory snapshots from SQLite
   - Builds system prompt with memory context (Layer 1)
   - Sends SidecarCommand::Query with enriched systemPrompt
        │
        ▼
3. SIDECAR: handleQuery()
   - Registers fury-memory MCP server (Layer 3)
   - Registers PostToolUse + SessionEnd hooks (Layer 2)
   - Calls sdkQuery({ prompt, options })
        │
        ▼
4. DURING SESSION
   ├── Claude works normally, using tools
   ├── PostToolUse hooks silently extract observations → emit to Rust
   ├── Claude MAY call search_memory or save_learning via MCP (Layer 3)
   └── Rust backend persists observations to SQLite as they arrive
        │
        ▼
5. SESSION ENDS
   ├── SessionEnd hook fires → compress observations into snapshots
   ├── Sidecar emits memory_snapshot events → Rust persists
   └── Next session will read fresh snapshots in Layer 1
```

---

## Token Budget (Complete Picture)

```
WITHOUT MEMORY:
┌──────────────────────────────────────┐
│ System prompt (claude_code):  ~10K   │
│ CLAUDE.md (project):          ~2K    │
│ User message:               ~0.5K   │
│ Available for work:         ~187K   │
│ Context window:              200K   │
└──────────────────────────────────────┘

WITH MEMORY:
┌──────────────────────────────────────┐
│ System prompt (claude_code):  ~10K   │
│ CLAUDE.md (project):          ~2K    │
│ Memory context (Layer 1):    ~2.5K   │  ← injected via append
│ MCP tool defs (Layer 3):     ~0.5K   │  ← fury-memory tools
│ User message:               ~0.5K   │
│ Available for work:         ~184K   │
│ Context window:              200K   │
│                                      │
│ On-demand MCP queries:  ~0.3K each   │  ← only when Claude asks
│ Hook extraction:            0 tokens │  ← runs in sidecar
│ Compression:                0 tokens │  ← rule-based, in sidecar
└──────────────────────────────────────┘

NET COST: ~3K tokens/session (~1.5% of context window)
         + ~0.3K per on-demand memory query
```

---

## Implementation Phases

### Phase 1: Layer 2 Hooks + SQLite Storage (1 week)
**Start here because hooks are the data source for everything else.**

Files to create:
- `src-tauri/sidecar/src/memory/store.ts` — SQLite interface (read/write observations & snapshots)
- `src-tauri/sidecar/src/memory/extractor.ts` — Observation extraction from PostToolUse hooks
- `src-tauri/sidecar/src/memory/compressor.ts` — Rule-based compression logic

Files to modify:
- `src-tauri/sidecar/src/index.ts` — Add hooks to sdkQuery options
- `src-tauri/sidecar/src/protocol.ts` — Add memory event types
- `src-tauri/src/services/claude_process/sidecar.rs` — Handle memory events in handle_sidecar_line
- `src-tauri/src/db/migrations/mod.rs` — Add memory tables

### Phase 2: Layer 1 Context Injection (3-4 days)
**Uses data from Phase 1 to enrich the system prompt.**

Files to create:
- `src-tauri/src/services/memory/mod.rs` — Rust-side memory service
- `src-tauri/src/services/memory/context.rs` — Build memory context markdown
- `src-tauri/src/commands/memory.rs` — Tauri commands for memory management UI

Files to modify:
- `src-tauri/src/commands/agent.rs` — Read snapshots and inject into system_prompt before query
- `src-tauri/sidecar/src/protocol.ts` — Accept memory context in QueryCommand

### Phase 3: Layer 3 MCP Server (1 week)
**Gives Claude on-demand access to the full memory store.**

Files to create:
- `src-tauri/sidecar/src/memory/mcp.ts` — In-process MCP server with search/save tools

Files to modify:
- `src-tauri/sidecar/src/index.ts` — Register MCP server in query options
- `src-tauri/sidecar/src/memory/store.ts` — Add search/save methods

### Phase 4: UI + Settings (3-4 days)

- Memory panel in Settings (enable/disable, choose compression mode)
- Memory viewer component (browse/edit/delete memories)
- Memory indicator in workspace header
- Per-workspace vs global memory toggle

---

## Key Design Decisions

### Q: Why hooks instead of parsing the NDJSON stream in Rust?
The SDK hooks give us structured, typed data (`tool_name`, `tool_input`, `tool_response`) directly. Parsing NDJSON in Rust means reverse-engineering the stream format and dealing with partial messages. Hooks are the supported API for this.

### Q: SQLite in sidecar or Rust?
**Rust owns SQLite** (single writer). The sidecar emits events, Rust persists them. This avoids two processes competing for the same database and matches the existing pattern (chat messages are already persisted by Rust).

### Q: Why not use the Anthropic Memory Tool (`memory_20250818`)?
That tool is for the raw Messages API. The Agent SDK has its own MCP-based approach which is more powerful — you get typed tools, in-process execution, and full control over the storage backend. The MCP server approach also means the tools show up in Claude's available tools automatically.

### Q: What about Auto Dream / MEMORY.md?
The SDK reads `MEMORY.md` when `settingSources` includes `'project'` (which Fury already enables). Auto Dream consolidation happens between sessions. Our memory system **complements** this — Auto Dream handles Claude's self-written notes, our system handles structured observations that Claude didn't explicitly choose to write down.

### Q: Embeddings or FTS5?
Start with FTS5. It's already in SQLite, zero extra dependencies, handles keyword-based retrieval well. The `search_memory` MCP tool can upgrade to embeddings later if FTS5 proves insufficient — the interface stays the same, only the backend changes.

### Q: How do we prevent memory from growing unbounded?
Three mechanisms:
1. **Snapshot supersession** — new snapshots replace old ones (tracked via `supersedes` column)
2. **Observation TTL** — observations older than 30 days without access get pruned
3. **Token budget cap** — Layer 1 context is capped at ~3K tokens; if snapshots exceed this, oldest are dropped
