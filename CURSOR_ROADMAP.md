# Cursor Feature Parity Roadmap

A prioritized list of features Cursor has that Fury currently lacks or partially implements. Each feature includes a detailed breakdown, current Fury status, and implementation considerations.

---

## Tier 1 — High Impact, Worth Building

### 1. @-Mention Context System (Complete)

**What Cursor does:** Users type `@` in chat/composer to reference specific context. This gives fine-grained control over what the AI sees.

**Current Fury status:** Full 14-category @-mention system with async item fetching, debounced search, and XML-tagged context resolution. Smart shortcuts for file paths (`/`, `.`) and URLs (`http://`).

| @-Mention | Description | Fury Status |
|-----------|-------------|-------------|
| @Files | Reference specific files as context | **Done** — category drill-in with file path filter |
| @Folders | Reference entire directories | **Done** — uses listRepoDirectories |
| @Code | Reference specific functions, classes, or symbols by name | **Done** — tree-sitter symbol extraction + Tantivy `search_symbols` |
| @Docs | Reference third-party library documentation (pre-indexed popular libs + custom) | **Done** — context7 API integration (`resolve_library_id` + `query_library_docs`) |
| @Web | Pull web search results into context | **Done** — DuckDuckGo Instant Answer API |
| @Git | Reference git history, diffs, commits, staged changes | **Done** — Diff vs main, Recent commits, Current branch |
| @Definitions | Reference symbol definitions from LSP | **Done** — shares symbol extraction with @Code, resolves to full code block |
| @Link | Fetch and reference content from a URL | **Done** — reqwest + HTML text extraction with tag stripping |
| @Lint Errors | Reference current lint/diagnostic errors | **Done** — ESLint + cargo clippy JSON parsing |
| @Recent Changes | Reference recently modified code | **Done** — resolves to working diff |
| @Notepads | Reference saved notepad content | **Done** — full CRUD backend (SQLite), Zustand store, @-mention integration |
| @Past Chats | Reference previous conversation transcripts | **Done** — uses existing `search_chat_messages` full-text search |
| @Codebase | Semantic search across entire project | **Done** — BM25 search via Tantivy + tree-sitter chunking |

---

### 2. Codebase Indexing (Complete)

**What Cursor does:** Automatically creates vector embeddings of all files when a project is opened. Enables semantic search via @Codebase queries.

**Current Fury status:** Fully implemented with local BM25 full-text search (Tantivy) and language-aware chunking (tree-sitter for 12 languages). @Codebase mention in chat resolves to search results prepended as context.

| Sub-feature | Description | Status |
|-------------|-------------|--------|
| Automatic indexing | Index all project files on repo open | **Done** — `start_codebase_indexing` command |
| Semantic chunking | Split files into meaningful chunks (functions, classes, logical blocks) | **Done** — tree-sitter for 12 languages + sliding-window fallback |
| Incremental updates | Track file changes and re-index only what changed | **Done** — `update_files()` with content hash comparison |
| @Codebase queries | Type @Codebase in chat for search across the project | **Done** — integrated into @-mention system |
| Ranking and retrieval | Return most relevant chunks for a given query | **Done** — BM25 scoring via Tantivy |

**Stack:** Tantivy (BM25 search), tree-sitter (12 language grammars), `ignore` crate (.gitignore-respecting file discovery). Optional embedding enhancement tracked as feature #17.

---

### 3. Inline Edit (Cmd+K)

**What Cursor does:** Highlight code, press Cmd+K, describe the change in natural language. Cursor rewrites the selection in place with a diff preview. With no selection, generates new code at cursor position.

**Current Fury status:** Inline edit implemented with Cmd+K trigger, Monaco widget, streaming diff preview, and accept/reject controls.

| Sub-feature | Description |
|-------------|-------------|
| Selection + prompt rewrite | **Done** — highlight code, Cmd+K, describe change, AI rewrites in place via sidecar |
| Generate at cursor | **Done** — no selection = generate new code at cursor position |
| Diff preview | **Done** — inline diff rendering in Monaco editor |
| Accept/reject controls | **Done** — keybindings to accept or reject the proposed edit |
| Terminal Cmd+K | In terminal, type natural language to generate shell commands |

---

### 4. Tab Completion (Predictive Autocomplete) — Partially Complete

**What Cursor does:** Custom low-latency model predicts the next edit (not just insertions). Suggests multi-line completions, entire blocks, and even cursor position changes. Predicts deletions and replacements.

**Current Fury status:** Enhanced Copilot LSP integration with debounced/cached requests, acceptance tracking, partial word acceptance (Cmd+Right), and hover toolbar. Missing edit prediction and supercomplete (model-level capabilities beyond what Copilot LSP provides).

| Sub-feature | Description | Status |
|-------------|-------------|--------|
| Predictive autocomplete | Suggests next code as you type, accept with Tab | **Done** — Copilot LSP with 75ms debounce, position cache, triggerKind |
| Multi-line suggestions | Suggests complete code blocks and function bodies | **Done** — Copilot returns multi-line; Monaco renders with subwordSmart |
| Edit prediction | After one change, suggests the next logically related change | **Done** (v1) — Speculative prefetch after multi-line edits, caches next-line completion |
| Supercomplete | Completes partial thoughts based on what you were about to type | **Not started** — See #18 (Supermaven LSP) |
| Ghost text rendering | Shows suggestions as dimmed text inline | **Done** — Inline suggestions with hover toolbar, Cmd+Right partial accept |
| Acceptance tracking | Notify Copilot LSP when completions are accepted/rejected | **Done** — UUID-based notifyAccepted/notifyRejected |
| Request optimization | Debounce, cache, and cancel stale completion requests | **Done** — 75ms debounce, 5s TTL cache, cancellation token wiring |

**Remaining work:**
- Supercomplete: Would require a FIM-trained model (Supermaven, local Ollama, or similar) — see #18
- Advanced edit prediction heuristics (e.g., if-branch → else-branch, function signature → body) — current v1 is simple next-line prefetch

---

## Tier 2 — Medium Impact, Good ROI

### 5. Design Mode (Visual UI Editing)

**What Cursor does:** In the Agents Window, users can Shift+drag to select UI elements in an embedded browser. Selected elements are sent to chat as context. Cmd+L adds elements for AI iteration.

**Current Fury status:** Fury has an integrated browser panel but no visual selection/annotation.

| Sub-feature | Description |
|-------------|-------------|
| Element selection | Shift+drag or click to select UI elements in browser |
| Element-to-chat | Selected elements sent as context to agent |
| Visual annotation | Highlight, circle, or annotate areas of the UI |
| Screenshot-to-chat | Capture browser state and send to agent |
| CSS inspection | Show computed styles for selected elements |

**Implementation considerations:**
- Fury already has browser integration (fury-browser MCP tools)
- Need to inject element selection overlay into the browser webview
- Send selected element's HTML/CSS/screenshot to chat as context
- Could use Chrome DevTools Protocol for element inspection
- Browser panel is already next to chat — good UX foundation

---

### 6. Agent Diff Review UI

**What Cursor does:** Composer shows all proposed file changes in a unified diff viewer. Users review and accept/reject changes per-file or per-hunk before they're applied.

**Current Fury status:** Agent edits files directly. Fury has diff viewing but no pre-apply review step.

| Sub-feature | Description |
|-------------|-------------|
| Proposed changes panel | Show all files the agent wants to modify in a list |
| Per-file diff view | Click a file to see the proposed diff |
| Accept/reject per file | Accept or reject changes individually |
| Accept/reject per hunk | Fine-grained control over which changes to apply |
| Batch accept all | One-click to apply all proposed changes |
| Undo applied changes | Revert applied changes (ties into checkpoint system) |

**Implementation considerations:**
- Fury already has diff components and Monaco diff editor
- Checkpoint system already exists for reverting
- Would require intercepting agent file edits and holding them in a staging area
- UI: could be a new tab in the right sidebar or an overlay
- Protocol change: agent proposes changes, user reviews, then applies

---

### 7. Automated PR Review (BugBot-style)

**What Cursor does:** BugBot automatically reviews PRs when opened or updated. Identifies logic bugs, suggests fixes. Can spawn agents to auto-fix issues.

**Current Fury status:** PR management exists. No automated review.

| Sub-feature | Description |
|-------------|-------------|
| Auto-review on PR open/update | Trigger AI review when PR is created or updated |
| Bug detection | Identify logic errors, security issues, performance problems |
| Inline comments | Post review comments on specific lines in the PR |
| Fix suggestions | Propose code fixes for identified issues |
| Autofix agent | Spawn agent to automatically fix found issues |
| GitHub/Slack notifications | Post review results to GitHub PR comments or Slack |

**Implementation considerations:**
- Fury already has GitHub PR integration (gh service)
- Could hook into PR creation workflow to trigger review
- Use Claude to analyze diff and generate review comments
- Post comments via GitHub API
- Autofix: create a workspace, run agent with fix instructions, open new PR
- Could be workspace-level or repo-level setting

---

### 8. YOLO Mode (Auto-Approve Commands)

**What Cursor does:** Users configure patterns for terminal commands that should be auto-approved without confirmation. E.g., allow `npm test`, `cargo check` to run without prompts.

**Current Fury status:** Claude has permission request handling but no auto-approve patterns.

| Sub-feature | Description |
|-------------|-------------|
| Allow-list patterns | Define regex or glob patterns for auto-approved commands |
| Per-workspace config | Different allow-lists per workspace |
| Safety defaults | Sensible defaults (block rm -rf, allow test runners) |
| Audit log | Log all auto-approved commands for review |
| Quick toggle | Easy on/off toggle in UI |

**Implementation considerations:**
- Fury already handles permission requests from Claude
- Add a pattern matching layer before showing permission dialog
- Store patterns in workspace config or repo settings
- UI: settings panel with pattern editor
- Safety: never auto-approve destructive commands by default

---

### 9. MCP Marketplace

**What Cursor does:** Curated marketplace of MCP servers with one-click install and OAuth setup. Popular integrations (Figma, Linear, Stripe, AWS, etc.) available instantly.

**Current Fury status:** MCP support exists with manual configuration.

| Sub-feature | Description |
|-------------|-------------|
| Server catalog | Browsable list of available MCP servers |
| One-click install | Install and configure servers without manual JSON editing |
| OAuth integration | Authenticate with services directly from the UI |
| Categories and search | Browse by category (design, database, cloud, etc.) |
| Update management | Notify when server updates are available |
| Team/private servers | Organization-scoped server sharing |

**Implementation considerations:**
- Fury already has MCP server management UI
- Need a registry/catalog (could be a JSON file or API)
- OAuth flows for popular services
- Auto-generate MCP config from marketplace selection
- Could start with a curated list before building a full marketplace

---

### 10. Agent Tabs (Multiple Simultaneous Agents) (Complete)

**What Cursor does:** View multiple agent chats simultaneously in side-by-side or grid layouts. Run parallel agents on different tasks.

**Current Fury status:** Implemented with flexible N-pane layout (1-4 simultaneous agent chats). `AgentPaneLayout` renders multiple `ChatPanel` instances in resizable horizontal split with per-pane focus tracking, workspace labels, and close buttons. Split via FileTabBar button or Sidebar chat button.

| Sub-feature | Description | Status |
|-------------|-------------|--------|
| Split agent view | View 2+ agent chats side-by-side | **Done** — `AgentPaneLayout` with `react-resizable-panels`, up to 4 panes |
| Independent agent sessions | Each tab runs its own agent independently | **Done** — each pane connects to a different workspace's agent via `contextId` |
| Drag-and-drop layout | Rearrange agent tabs freely | **Not started** — deferred to Phase 2 |
| Cross-agent context | Reference output from one agent in another | **Not started** — deferred to Phase 2 (@Agent mention) |

**Stack:** `AgentPaneLayout.tsx`, `agentPanes: AgentPane[]` in uiStore, `react-resizable-panels`. No backend changes needed — all stores/events were already per-workspace.

---

## Tier 3 — Lower Priority / Heavy Investment

### 11. Background Cloud Agents

**What Cursor does:** Spin up agents in isolated cloud Ubuntu VMs. They work on separate branches independently, can open PRs, and hand off to local.

**Current Fury status:** No cloud agent infrastructure.

| Sub-feature | Description |
|-------------|-------------|
| Cloud VM provisioning | Spin up isolated Ubuntu VMs for agents |
| Branch isolation | Each cloud agent works on its own branch |
| PR creation | Cloud agents open PRs when work is complete |
| Cloud-to-local handoff | Move sessions between cloud and local |
| Local-to-cloud handoff | Push a local session to continue in cloud |
| Remote SSH agents | Run agents on remote machines via SSH |
| Multi-repo support | Run agents across different repositories |

**Implementation considerations:**
- Major infrastructure investment (VM orchestration, networking, auth)
- Fury's DevContainer support partially addresses isolation
- Could start with local worktree isolation before cloud
- Would need a cloud service backend (significant new infrastructure)

---

### 12. Automations (Event-Driven Agents)

**What Cursor does:** Agents trigger automatically on external events — Slack messages, Linear issues, GitHub PR opens, PagerDuty incidents. Also supports cron schedules.

**Current Fury status:** No automation/trigger system.

| Sub-feature | Description |
|-------------|-------------|
| GitHub event triggers | Auto-run agents on PR open, push, review, merge |
| Slack triggers | Trigger agents from Slack messages |
| Linear triggers | Trigger agents from Linear issue creation/updates |
| Cron/scheduled agents | Run agents on a timer |
| Custom webhooks | Any system can trigger an agent run |
| Agent memory across runs | Agents learn from previous automated runs |
| Template instructions | Pre-defined instructions for each automation type |

**Implementation considerations:**
- Requires a webhook receiver service (always-on backend)
- Event routing to appropriate workspaces/agents
- Template system for automation instructions
- Memory/learning system for improving over time
- Could start with GitHub webhooks only

---

### 13. Multi-Model Support

**What Cursor does:** Choose from OpenAI, Anthropic, Google, xAI models. Different models for different features (Tab, Chat, Agent). Auto-select optimal model per task.

**Current Fury status:** Primarily Claude. Provider settings exist but limited model switching.

| Sub-feature | Description |
|-------------|-------------|
| Multiple AI providers | Support OpenAI, Google, xAI alongside Anthropic |
| Per-feature model selection | Different models for Tab, Chat, Agent |
| Auto model selection | AI picks optimal model per task |
| Model comparison | Compare outputs from different models |

**Implementation considerations:**
- Fury is Claude-native by design — may not align with product identity
- Would require abstracting the AI interface layer
- Each provider has different APIs, tool formats, streaming protocols
- Could start with model selection within Claude family (Opus, Sonnet, Haiku)

---

### 14. Notepads

**What Cursor does:** Save shared context documents (coding standards, architecture docs, API specs) that can be referenced via @Notepads in chat.

**Current Fury status:** Fury has snippets and prompt library but no notepads equivalent.

| Sub-feature | Description |
|-------------|-------------|
| Create/edit notepads | Rich text documents for shared context |
| @Notepad reference | Reference notepads in chat via @-mention |
| Project-scoped | Notepads tied to a repository/project |
| Shareable | Team members can access shared notepads |

**Implementation considerations:**
- Similar to Fury's existing snippets feature — could extend it
- Add @-mention integration (depends on #1)
- Store in SQLite alongside other workspace data
- Could merge with or extend the prompt library feature

---

### 15. Terminal Cmd+K (NL to Shell Command)

**What Cursor does:** In the integrated terminal, press Cmd+K and type a natural language description. AI generates the shell command. Accept with Esc, run immediately with Cmd+Enter.

**Current Fury status:** Terminal exists but no NL-to-command feature.

| Sub-feature | Description |
|-------------|-------------|
| NL prompt overlay | Cmd+K opens a prompt input over the terminal |
| Command generation | AI generates shell command from description |
| Command preview | Show generated command before running |
| Accept and insert | Place command in terminal without running |
| Accept and run | Execute command immediately |
| Context-aware | Uses current directory, OS, shell for better commands |

**Implementation considerations:**
- Overlay UI on xterm.js terminal component
- Send prompt + terminal context (cwd, OS, shell) to Claude
- Fast model (Haiku) for low latency
- Insert generated command into terminal input
- Keybindings: Cmd+K trigger, Enter to accept, Cmd+Enter to run

---

### 16. /best-of-n (Parallel Model Comparison)

**What Cursor does:** Run the same task across multiple models in parallel, then present results side-by-side for comparison.

**Current Fury status:** No parallel model comparison.

| Sub-feature | Description |
|-------------|-------------|
| Parallel execution | Run same prompt across N models simultaneously |
| Side-by-side results | View all outputs in a comparison layout |
| Pick winner | Select the best output to apply |
| Cost/speed comparison | Show tokens, cost, and latency for each |

**Implementation considerations:**
- Depends on multi-model support (#13)
- UI: split view showing each model's output
- Run N API calls in parallel
- Useful for evaluating model quality on specific tasks
- Could start within Claude family (Opus vs Sonnet vs Haiku)

---

### 17. Embedding-Enhanced Search (Optional)

**What Cursor does:** Uses vector embeddings for semantic similarity matching, finding conceptually related code even without exact keyword overlap.

**Current Fury status:** BM25 keyword search is implemented (#2). This feature adds an optional embedding layer on top for improved LLM context retrieval on fuzzy/conceptual queries.

| Sub-feature | Description |
|-------------|-------------|
| Local embedding model | Download and run AllMiniLML6V2 (384-dim, ~100MB) locally via fastembed/ONNX |
| Vector storage | Store embeddings in sqlite-vec (SQLite vector extension) alongside existing DB |
| Hybrid ranking | Combine BM25 lexical scores + cosine similarity via Reciprocal Rank Fusion |
| Optional toggle | Enable/disable in settings — off by default, requires one-time model download |
| Model management | Download on first enable, show progress, store in app data dir |

**Implementation considerations:**
- `fastembed` Rust crate (ONNX Runtime, ~100-150MB binary size increase)
- `sqlite-vec` extension for rusqlite (vector storage + cosine similarity queries)
- Hybrid search: `score = 1/(k + rank_bm25) + 1/(k + rank_semantic)` with k=60
- Model stored in `{app_data_dir}/models/` — downloaded on first use
- BM25 alone handles most code search well (keyword-heavy); embeddings help with conceptual queries ("how does auth work" vs exact function names)
- Lower priority — the LLM receiving BM25 results already does a good job synthesizing answers from keyword-matched chunks
- Settings toggle: `codebase_search.semantic_enabled` (default false)

---

### 18. Supermaven LSP Integration

**What Cursor does:** Uses custom fine-tuned FIM models for ultra-fast (<100ms) code completions that go beyond what Copilot offers — including edit prediction, deletions, and replacements.

**Current Fury status:** Copilot LSP is the sole completion provider. Enhanced with debounce, caching, acceptance tracking, and partial word acceptance.

| Sub-feature | Description |
|-------------|-------------|
| Supermaven LSP spawning | Spawn `supermaven-lsp` binary, communicate via LSP wire protocol (same pattern as Copilot) |
| Provider settings toggle | Settings UI: "Completion Provider: Copilot / Supermaven" — switch between providers |
| Auth flow | Supermaven account linking (free tier + pro at $10/mo) |
| Fallback logic | If selected provider is unavailable, fall back to the other if configured |

**Implementation considerations:**
- Structurally identical to existing Copilot LSP integration — spawn process, LSP wire protocol, `textDocument/inlineCompletion`
- Could reuse ~80% of `copilot_lsp.rs` by extracting a shared LSP client
- Supermaven claims sub-100ms latency (faster than Copilot)
- Free tier available but limited; Pro is $10/mo (same as Copilot Individual)
- Main value: users who prefer Supermaven's completion quality or want an alternative to GitHub Copilot
- Lower priority — Copilot integration already works well with the recent optimizations
