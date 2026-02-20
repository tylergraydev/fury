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
3. Test locally with `npm run tauri dev`
4. Ensure the frontend builds cleanly: `npm run build`
5. Open a pull request against `main`

## Project Structure

```
src/                    # React frontend (TypeScript)
├── components/         # UI components
│   ├── chat/           # Chat interface
│   ├── layout/         # App layout (Sidebar, TopBar, etc.)
│   ├── terminal/       # Terminal panels (xterm)
│   ├── file-viewer/    # Monaco file viewer
│   ├── diff/           # Diff viewer
│   ├── sidebar/        # Right sidebar panels
│   └── ...
├── stores/             # Zustand state stores
└── lib/                # Utilities and Tauri bindings

src-tauri/              # Rust backend (Tauri 2)
├── src/
│   ├── commands/       # Tauri command handlers
│   ├── services/       # Business logic (checkpoints, diffs)
│   ├── db/             # SQLite database
│   └── platform/       # Platform-specific code
└── icons/              # App icons
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
