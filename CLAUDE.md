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
3. **`src-tauri/src/commands/`** — 27 Rust command modules registered via `tauri::generate_handler!` in `lib.rs`

Backend → frontend streaming uses Tauri events: `listen("agent-stream:${workspaceId}", handler)`.

### Frontend (src/)

**Stores** (`src/stores/`) — 28 Zustand stores. Use individual selectors to prevent re-renders:
```typescript
// Correct
const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
// Wrong — causes re-render on any store change
const { activeWorkspaceId } = useWorkspaceStore();
```

**Layout** (`App.tsx`) — Three resizable panels: Sidebar | MainPanel | RightSidebar. Uses `react-resizable-panels`. Mount-phase IPC deferral via double-`requestAnimationFrame` prevents freezes during heavy transitions.

**Key directories:**
- `src/components/` — Feature-organized: `chat/`, `file-viewer/`, `merge/`, `diff/`, `pr/`, `terminal/`, `settings/`, `devcontainer/`, etc.
- `src/lib/` — Utilities including `tauri.ts` (IPC), `themes.ts`, `keybindings.ts`, `copilot.ts`, `monacoSetup.ts`
- `src/hooks/` — `useAutoUpdate.ts`, `useVoiceInput.ts`

### Backend (src-tauri/src/)

**Structure:**
- `commands/` — Tauri command handlers (thin layer, delegates to services)
- `services/` — Business logic: `claude_process.rs`, `codex_process.rs`, `devcontainer.rs`, `gh.rs`, `diff.rs`, `copilot_lsp.rs`, `branch.rs`, etc.
- `models/` — Serde-serializable types shared with frontend
- `state/app_state.rs` — Singleton `AppState` with `Mutex<HashMap<Uuid, T>>` for runtime state
- `db/` — SQLite (rusqlite) with WAL mode, versioned migrations in `db/migrations/`
- `error.rs` — `AppError` enum using `thiserror`, implements `Serialize` for Tauri

**Dev containers** (`services/devcontainer.rs`, `commands/devcontainer.rs`): Container lifecycle management via `docker`/`devcontainer` CLIs. Agent, terminal, and script spawning checks `workspace.devcontainer_config` to optionally wrap execution in `docker exec`. Frontend store: `src/stores/devContainerStore.ts`. Events: `container-status:{wsId}`, `container-log:{wsId}`.

**Mutex lock order:** Always lock workspaces before repositories before container_states. Release locks before running git commands (clone data, drop lock, then execute).

### Testing

**Vitest setup** (`src/test/setup.ts`): All Tauri APIs are globally mocked — `invoke`, `listen`, `emit`, and all plugins (dialog, shell, fs, process, updater). Tests use `@testing-library/react` + `jsdom`.

**When deferring effects with rAF**, tests need `vi.waitFor()` or `findByTestId()` for async assertions.

**Rust tests** use `tempfile` crate and test helpers in `src-tauri/src/test_helpers.rs`.

## Pre-PR Checklist

**CRITICAL: Always run the full test suite immediately before committing and pushing.** Do not rely on earlier test runs — changes made after the last test run can introduce failures. Run tests as the very last step before `git commit`, not just during development.

```bash
npm test              # Unit tests — run RIGHT BEFORE committing
npm run test:e2e      # E2E tests (required — do not skip)
```

If any test fails, fix it before committing. Do not push code that has not passed `npm test` in its final committed form. The `e2e` job is a required status check on `main` and PRs will fail without it.

## Performance Rules

**Never mount hidden components with CSS `display:none`/`hidden` instead of conditional rendering.** Mounting a component that is visually hidden still runs all its hooks, effects, and IPC calls. Use conditional rendering (`{active && <Component />}`) so only the visible tab/panel mounts. This was the root cause of a UI freeze — mounting all RightSidebar tab panels simultaneously triggered a storm of parallel IPC calls whose synchronous store updates locked the main thread.

## Conventions

- **Unused variables**: Prefix with `_` (enforced by ESLint and `tsconfig.json`)
- **No console.log**: Use `console.warn` or `console.error` (ESLint `no-console` rule)
- **`@typescript-eslint/no-explicit-any`**: Allowed in test files only
- **Branch naming**: `tylergraydev/*`
- **Tailwind CSS 4**: Styles via utility classes, custom theme via CSS variables in `src/lib/themes.ts`

## Design Context

### Users
Solo developers managing AI-assisted coding workflows. Technical, comfortable with CLI tools, expecting a desktop app that keeps pace with how fast they think and work.

### Brand Personality
**Fast, sharp, powerful.** A high-performance instrument, not a friendly assistant. Precision tool that amplifies developer capabilities.

### Aesthetic Direction
- **Visual tone:** Dark, dense, developer-native. Pure black foundations with controlled blue accent and semantic colors.
- **References:** Cursor, Windsurf — AI-native code editors with clean dark UI.
- **Anti-references:** No generic SaaS (pastel cards, illustrations), no retro terminal gimmicks, no Electron bloat (heavy chrome, loading spinners).
- **Theme:** Dark-mode only. Three built-in themes + custom theme support via CSS variables.

### Design Principles
1. **Density over decoration** — Maximize useful information per pixel. Avoid padding bloat or decorative whitespace.
2. **Instant feedback** — Optimistic UI, subtle transitions (150ms max), avoid loading states where possible.
3. **Keyboard-first** — Design for keyboard navigation and command palette workflows.
4. **Contrast through restraint** — Color is reserved for status, accents, and actionable elements — never decoration.
5. **Respect the craft** — Alignment, consistent spacing, sharp borders, and predictable behavior over animation or flair.

### Accessibility
- WCAG AA compliance target for contrast ratios and focus management
- Semantic HTML, keyboard navigation, screen reader support
- Respect `prefers-reduced-motion`
