# Contributing to Fury

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repo and clone your fork
2. Install dependencies: `npm install`
3. Start the dev server: `npm run tauri dev`

See the [README](README.md#building-from-source) for full setup instructions.

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run `npm run lint` to check for lint errors
4. Run `npm test` to verify unit tests pass
5. Test locally with `npm run tauri dev`
6. Ensure the frontend builds cleanly: `npm run build`
7. Open a pull request against `main`

## Testing

### Unit Tests (Vitest)

The frontend has unit tests using Vitest, Testing Library, and jsdom.

```bash
npm test              # Run all unit tests
npm run test:watch    # Run tests in watch mode (re-runs on file changes)
npm run test:coverage # Run tests with V8 coverage report
```

Test files live alongside their source files with a `.test.ts` or `.test.tsx` suffix.

### End-to-End Tests (Playwright)

E2E tests are in the `e2e/` directory and test the full application flow.

```bash
npm run test:e2e         # Run all e2e tests headless
npm run test:e2e:headed  # Run with a visible browser
npm run test:e2e:debug   # Run in debug mode with inspector
npm run test:e2e:ui      # Open Playwright's interactive UI
```

## Linting

```bash
npm run lint          # Check for lint errors (ESLint 9)
npm run lint:fix      # Auto-fix lint errors
```

Run `npm run lint` before submitting a PR.

## Project Structure

```
src/                    # React frontend (TypeScript)
├── components/         # UI components
│   ├── activity-log/   # Activity timeline
│   ├── chat/           # Chat interface
│   ├── diff/           # Diff viewer
│   ├── file-viewer/    # Monaco file viewer
│   ├── history/        # History view
│   ├── icons/          # Icon components
│   ├── landing/        # Landing page
│   ├── layout/         # App layout (Sidebar, TopBar, etc.)
│   ├── merge/          # Merge view and conflict resolution
│   ├── notes/          # Notes/todos panel
│   ├── notifications/  # Notification center
│   ├── pr/             # PR management panel
│   ├── prompt-library/ # Saved prompts
│   ├── settings/       # Settings panels
│   ├── sidebar/        # Right sidebar panels (files, changes, checks)
│   ├── snippets/       # Snippet manager
│   ├── team/           # Team features
│   ├── terminal/       # Terminal panels (xterm)
│   ├── test-runner/    # Test runner panel
│   ├── usage/          # Usage/cost tracking
│   └── workspace/      # Workspace dialogs
├── stores/             # Zustand state stores (one per domain)
└── lib/                # Utilities and Tauri bindings

src-tauri/              # Rust backend (Tauri 2)
├── src/
│   ├── commands/       # Tauri command handlers (one file per domain)
│   ├── services/       # Business logic (agent processes, git, terminals, etc.)
│   ├── models/         # Data models and types
│   ├── db/             # SQLite database and migrations
│   ├── state/          # Application state management
│   └── platform/       # Platform-specific code (macOS, Windows, Linux)
└── icons/              # App icons

e2e/                    # Playwright end-to-end tests

docs/                   # Documentation site (Mintlify)
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Write a clear description of what changed and why
- Make sure the app builds and runs before submitting

## Reporting Issues

Open an issue on [GitHub Issues](https://github.com/tylergraydev/fury/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Platform and OS version

## Code Style

- Frontend: TypeScript with React functional components
- Backend: Rust with Tauri 2 conventions
- Styling: Tailwind CSS utility classes
- State: Zustand stores (one per domain)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
