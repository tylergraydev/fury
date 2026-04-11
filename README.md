<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="Fury" width="128" height="128" />
</p>

<h1 align="center">Fury</h1>

<p align="center">
  Cross-platform desktop app for orchestrating AI coding agents.
</p>

<p align="center">
  <a href="https://github.com/tylergraydev/fury/releases">Download</a> · <a href="https://fury-docs.mintlify.app">Docs</a> · <a href="#building-from-source">Build from Source</a> · <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

Fury lets you manage repositories, workspaces, and AI agent conversations in one place. Chat with Claude or Codex to write code, review diffs, run scripts, manage PRs, and track changes — all from a single desktop app.

## Features

### Agent & AI
- **AI Chat** — Converse with Claude Code or OpenAI Codex CLI for coding tasks with full repository context
- **Multiple Providers** — Anthropic, OpenRouter, AWS Bedrock, Google Vertex, Azure Foundry, Vercel AI Gateway, or custom endpoints
- **GitHub Copilot** — Inline code completions in the built-in Monaco editor
- **MCP Servers** — Extend agent capabilities with Model Context Protocol servers
- **Slash Commands** — Built-in and custom commands for quick agent actions
- **Web Search** — Search the web directly from the agent chat

### Workspaces
- **Multi-workspace** — Run isolated workspaces on separate git branches with full worktree isolation
- **Create from PR/Issue** — Spin up a workspace directly from a GitHub PR or issue
- **Pinning & Linking** — Pin important workspaces; link two workspaces for cross-worktree diffs
- **Sparse Checkout** — Check out only the directories you need for monorepo workflows
- **Workspace Templates** — Save and reuse workspace configurations

### Development
- **File Viewer** — Browse and edit files with Monaco editor and syntax highlighting
- **Inline Edits** — AI-powered inline code edits within the editor
- **Diff Viewer** — Review code changes with inline diffs
- **Merge View** — Sync branches, resolve conflicts, and compare linked workspaces
- **Integrated Terminal** — Setup, run, and shell terminals powered by xterm.js
- **Dev Containers** — Run agents, terminals, and scripts inside Docker containers with devcontainer CLI or raw Docker support
- **Scripts** — Configure setup, run, and archive scripts per repository
- **fury.json** — Commit team-wide scripts and configuration to your repo
- **Todos** — Per-workspace task tracking, injectable into chat via `@todos`
- **Codebase Search** — Full-text code search powered by Tantivy with tree-sitter syntax awareness
- **Test Runner** — Run and monitor tests from within the app
- **Snippets** — Save and reuse code snippets across workspaces

### Git & GitHub
- **PR Management** — Create, review, and merge pull requests without leaving the app
- **AI PR Reviews** — Generate AI-powered pull request reviews
- **GitHub Actions** — View workflow runs, read logs, and re-run failed jobs
- **Linear Integration** — Search and link Linear issues to workspaces
- **Checkpoints** — Save and revert conversation states at any point
- **Stash Management** — Git stash operations from the UI
- **Bookmarks** — Bookmark files and locations for quick access

### App
- **Command Palette** — Quick actions via `Cmd+K` / `Ctrl+K`
- **Themes** — Blend, Midnight, and GitHub color schemes (plus custom themes via CSS variables)
- **Prompt Library** — Save, organize, and reuse prompts
- **Cursor Migration** — Import MCP servers and rules from Cursor
- **Export/Import** — Export and import workspace configurations
- **Auto-updater** — Stay current with GitHub releases
- **Cross-platform** — macOS (Apple Silicon & Intel), Windows, Linux

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 7 |
| Desktop | Tauri 2 (Rust) |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| State | Zustand (33 stores) |
| Database | SQLite (rusqlite, WAL mode) |
| Search | Tantivy (full-text), tree-sitter (syntax) |
| IPC | tauri-specta (type-safe, 273 commands) |
| UI | react-resizable-panels, cmdk, Recharts |

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Setup

```bash
git clone https://github.com/tylergraydev/fury.git
cd fury
npm install
```

### Development

```bash
npm run tauri dev          # Run full app (Rust + Vite dev server)
npm run dev                # Frontend only (no Rust backend)
```

### Production Build

```bash
npm run tauri build
```

Binaries will be in `src-tauri/target/release/bundle/`.

### Testing

```bash
npm test                   # Run unit tests (Vitest)
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage
npm run test:e2e           # Run end-to-end tests (Playwright)
npm run test:e2e:headed    # E2E with browser visible
cd src-tauri && cargo test # Run Rust backend tests
```

### Linting

```bash
npm run lint               # Check for lint errors
npm run lint:fix           # Auto-fix lint errors
```

## License

[MIT](LICENSE)
