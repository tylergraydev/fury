# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fury is a Tauri v2 desktop app for orchestrating AI coding agents. Rust backend + React 19/TypeScript frontend with Zustand state management, Monaco editor, and xterm.js terminal.

## Commands

```bash
# Development
npm run tauri dev          # Run full app (Rust + Vite dev server on :1420)
npm run dev                # Frontend only (no Rust backend)

# Frontend tests (vitest, jsdom, ~2700+ tests)
npm test                   # Run all unit tests
npx vitest run src/stores/workspaceStore.test.ts   # Run single test file
npx vitest run -t "test name"                      # Run test by name

# Rust
cd src-tauri && cargo check    # Type-check backend
cd src-tauri && cargo test     # Run backend tests

# Lint
npm run lint               # ESLint check
npm run lint:fix           # ESLint auto-fix

# E2E (requires running dev server)
npm run test:e2e           # Playwright tests
npm run test:e2e:headed    # Playwright with browser visible

# Build
npm run tauri build        # Production build → src-tauri/target/release/bundle/
```

## Architecture

### Frontend → Backend IPC

All frontend-to-backend communication goes through Tauri's `invoke`. The IPC layer is:

1. **`src/lib/tauri.ts`** — 100+ typed wrapper functions (e.g., `createWorkspace()`, `getDiff()`)
2. **`src/lib/ipcInstrumentation.ts`** — wraps every invoke call with perf metrics, batched every 2 seconds
3. **`src-tauri/src/commands/`** — 26 Rust command modules registered via `tauri::generate_handler!` in `lib.rs`

Backend → frontend streaming uses Tauri events: `listen("agent-stream:${workspaceId}", handler)`.

### Frontend (src/)

**Stores** (`src/stores/`) — 46 Zustand stores. Use individual selectors to prevent re-renders:
```typescript
// Correct
const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
// Wrong — causes re-render on any store change
const { activeWorkspaceId } = useWorkspaceStore();
```

**Layout** (`App.tsx`) — Three resizable panels: Sidebar | MainPanel | RightSidebar. Uses `react-resizable-panels`. Mount-phase IPC deferral via double-`requestAnimationFrame` prevents freezes during heavy transitions.

**Key directories:**
- `src/components/` — Feature-organized: `chat/`, `file-viewer/`, `merge/`, `diff/`, `pr/`, `terminal/`, `settings/`, etc.
- `src/lib/` — Utilities including `tauri.ts` (IPC), `themes.ts`, `keybindings.ts`, `copilot.ts`, `monacoSetup.ts`
- `src/hooks/` — `useAutoUpdate.ts`, `useVoiceInput.ts`

### Backend (src-tauri/src/)

**Structure:**
- `commands/` — Tauri command handlers (thin layer, delegates to services)
- `services/` — Business logic: `claude_process.rs`, `codex_process.rs`, `git.rs`, `gh.rs`, `diff.rs`, `copilot_lsp.rs`, etc.
- `models/` — Serde-serializable types shared with frontend
- `state/app_state.rs` — Singleton `AppState` with `Mutex<HashMap<Uuid, T>>` for runtime state
- `db/` — SQLite (rusqlite) with WAL mode, versioned migrations in `db/migrations/`
- `error.rs` — `AppError` enum using `thiserror`, implements `Serialize` for Tauri

**Mutex lock order:** Always lock workspaces before repositories. Release locks before running git commands (clone data, drop lock, then execute).

### Testing

**Vitest setup** (`src/test/setup.ts`): All Tauri APIs are globally mocked — `invoke`, `listen`, `emit`, and all plugins (dialog, shell, fs, process, updater). Tests use `@testing-library/react` + `jsdom`.

**When deferring effects with rAF**, tests need `vi.waitFor()` or `findByTestId()` for async assertions.

**Rust tests** use `tempfile` crate and test helpers in `src-tauri/src/test_helpers.rs`.

## Pre-PR Checklist

Before pushing or creating a PR, **always** run E2E tests locally. The `e2e` job is a required status check on `main` and PRs will fail without it.

```bash
npm test              # Unit tests first (fast)
npm run test:e2e      # E2E tests (required — do not skip)
```

## Conventions

- **Unused variables**: Prefix with `_` (enforced by ESLint and `tsconfig.json`)
- **No console.log**: Use `console.warn` or `console.error` (ESLint `no-console` rule)
- **`@typescript-eslint/no-explicit-any`**: Allowed in test files only
- **Branch naming**: `tylergraydev/*`
- **Tailwind CSS 4**: Styles via utility classes, custom theme via CSS variables in `src/lib/themes.ts`
