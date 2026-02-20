<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="Fury" width="128" height="128" />
</p>

<h1 align="center">Fury</h1>

<p align="center">
  Cross-platform desktop app for orchestrating AI coding agents.
</p>

<p align="center">
  <a href="https://github.com/tylergraydev/fury/releases">Download</a> · <a href="#building-from-source">Build from Source</a> · <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

Fury lets you manage repositories, workspaces, and AI agent conversations in one place. Chat with Claude to write code, review diffs, run scripts, manage PRs, and track changes — all from a single desktop app.

## Features

- **AI Chat** — Converse with Claude for coding tasks with full repository context
- **Multi-workspace** — Run isolated workspaces on separate branches within the same repo
- **File Viewer** — Browse and read files with Monaco editor and syntax highlighting
- **Diff Viewer** — Review code changes with inline diffs
- **Integrated Terminal** — Setup, run, and terminal panels powered by xterm
- **PR Management** — Create, review, and merge pull requests
- **Checkpoints** — Save and revert conversation states
- **Command Palette** — Quick actions via `Cmd+K` / `Ctrl+K`
- **Auto-updater** — Stay current with GitHub releases
- **Cross-platform** — macOS (Apple Silicon & Intel), Windows, Linux

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite |
| Desktop | Tauri 2 (Rust) |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| State | Zustand |
| Database | SQLite (rusqlite) |
| UI | react-resizable-panels, cmdk |

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
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

Binaries will be in `src-tauri/target/release/bundle/`.

## License

[MIT](LICENSE)
