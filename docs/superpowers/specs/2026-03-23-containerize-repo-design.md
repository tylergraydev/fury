# Containerize Repo — Design Spec

**Date**: 2026-03-23
**Status**: Approved

## Problem

Users want a one-click path to migrate an existing repo into a dev container so that:
- The working environment is self-contained (right runtimes, deps, tools)
- Fury's agent executes inside the container via `docker exec` (no re-auth, no Claude Code installation in container)
- Containers run wherever Docker is pointed (`DOCKER_HOST`) — local machine, Unraid, remote server
- Multiple clients can connect to the same containerized environment

## Approach

Agent-driven migration. The user's configured Claude instance analyzes the repo's tech stack and generates a `devcontainer.json`. The user reviews/edits the config, chooses whether to commit it to the repo or store it in Fury only, and Fury builds and starts the container using existing infrastructure.

## User Flow

1. User clicks "Containerize" on a repo without a devcontainer config
2. Fury shows "Analyzing repository..." status
3. Agent analyzes the repo (file listing + manifest contents) and returns a proposed `devcontainer.json`
4. Fury displays the config in an editable Monaco editor with a detection summary (e.g., "Detected: Node 20 + PostgreSQL")
5. User reviews/edits, then picks: **"Commit to repo"** or **"Save to Fury only"**
6. Fury writes the config, then auto-starts the container
7. Setup script runs inside the container via `docker exec`
8. Container status badge goes green, workspace is ready

For repos that already have a `.devcontainer.json` (detected via existing `detect_devcontainer_json`): the button changes to "Use existing devcontainer" — skips the agent step, sets `workspace.devcontainer_config` with `enabled: true`, `backend: DevcontainerCli`, `agent_exec_mode: Container`, and `devcontainer_path` pointing to the detected file, then starts the container.

## Identity Model

The containerize flow is scoped to a **workspace** (not a repo), consistent with the existing devcontainer infrastructure. `DevContainerConfig` lives on `Workspace`, container states are keyed by `workspace_id`, and all existing events use `workspace_id`. The frontend determines the active workspace and passes `workspace_id` to all commands.

The `gather_repo_context` step resolves the repo path from the workspace's `repo_id`, but the commands themselves accept `workspace_id`.

## Backend Architecture

### New service: `services/containerize.rs`

#### `gather_repo_context(repo_path) -> String`

Scans the repo for tech stack signals:
- File listing via `git ls-files` (respects `.gitignore`, avoids `node_modules/`, `target/`, etc.)
- Contents of detected manifests: `package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Gemfile`, `docker-compose.yml`, `Dockerfile`
- Each file capped at ~200 lines
- The repo's existing setup script from Fury settings (if configured)

Returns a structured context string for the agent prompt.

#### Agent call (one-shot via CLI)

Spawns a short-lived Claude Code CLI process using `claude -p` (print mode) with `--output-format json`. This reuses the user's existing CLI authentication (Max plan OAuth or API key) without requiring any separate auth configuration. The process receives the gathered context + system prompt as input and returns the generated config as output.

The system prompt instructs Claude to:
- Analyze the tech stack
- Generate a `devcontainer.json` targeting Microsoft devcontainer base images (e.g., `mcr.microsoft.com/devcontainers/typescript-node:20`)
- Include appropriate `features` for common tools (git, GitHub CLI)
- Set `postCreateCommand` for dependency installation
- Return only valid JSON

The CLI process is spawned via `tokio::process::Command` (similar to existing `spawn_and_stream` but simplified — no session tracking, no streaming events, just collect stdout). Stderr is captured for error reporting.

#### `apply_config(workspace_id, config_json, commit_to_repo)`

- **Commit to repo**: Writes `.devcontainer/devcontainer.json` to disk, runs `git add .devcontainer/devcontainer.json` + `git commit -m "Add devcontainer configuration"`. Commits on the workspace's current branch.
- **In both cases**: Sets `workspace.devcontainer_config` in SQLite with:
  - `enabled: true`
  - `backend: DevcontainerCli`
  - `agent_exec_mode: Container`
  - `devcontainer_path: .devcontainer/devcontainer.json` (or the detected path for existing configs)
  - All other fields at defaults

If the working tree has uncommitted changes, the commit is scoped to only `.devcontainer/devcontainer.json` (explicit `git add` of that path only).

### New Tauri commands

#### `containerize_repo(workspace_id) -> String`

Orchestration command:
1. Resolves repo path from workspace
2. Calls `gather_repo_context`
3. Spawns Claude CLI in print mode, streams status via `containerize-status:{workspace_id}` events
4. Parses response and returns proposed `devcontainer.json` string for user review

#### `apply_devcontainer_config(workspace_id, config_json, commit_to_repo)`

Writes the config per user's choice, updates `workspace.devcontainer_config` in DB, then the frontend triggers existing `start_container` and setup script execution.

### Response parsing

1. Attempt `serde_json::from_str` on the agent response
2. If fails, try extracting JSON from markdown code fences (regex: `` ```json?\s*([\s\S]*?)``` ``)
3. If still invalid, return the raw output to the frontend for manual editing

### No changes to existing devcontainer infrastructure

This feature feeds into the existing pipeline: `start_container` / `container_exec` / `AgentExecMode::Container`.

## Frontend

### New component: `ContainerizePanel.tsx`

Located in `src/components/devcontainer/`. Four states:

1. **Idle** — "Containerize" button (disabled while `containerizing` is true to prevent duplicate clicks). If `.devcontainer.json` already detected, shows "Use existing devcontainer" instead.
2. **Analyzing** — Spinner with status. Agent output in collapsible section. Cancel button to abort the CLI process.
3. **Review** — Monaco editor with generated config. Summary line above (e.g., "Detected: Node 20 + PostgreSQL"). Two buttons below:
   - "Commit to repo" (primary)
   - "Save to Fury only" (secondary)
4. **Error** — Shows error message + raw agent output (if any) in an editable Monaco editor, so the user can manually fix and submit a valid config. Retry button to re-run analysis.

After applying, transitions to existing `ContainerPanel` for build progress.

### Integration

- Added to `RepoSettingsPanel` — shows `ContainerizePanel` when no config exists, existing `ContainerPanel` when one does.
- Optional shortcut in workspace context menu.

### Store changes

Minimal additions to `devContainerStore`:
- `containerizing: Record<string, boolean>` — analysis in progress flag
- `proposedConfig: Record<string, string>` — generated JSON during review step, cleared after apply

No new store needed.

## New events

- `containerize-status:{workspace_id}` — streams analysis progress to frontend (workspace-scoped, consistent with existing event patterns)

## Data Flow

```
User clicks "Containerize"
  |
  +-> Frontend: ContainerizePanel sets containerizing=true
  |
  +-> IPC: containerize_repo(workspace_id)
  |    |
  |    +-> Resolve repo path from workspace
  |    +-> gather_repo_context(repo_path)
  |    |    +-> git ls-files + read manifests -> context string
  |    |
  |    +-> Spawn claude -p with context + system prompt
  |    |    +-> Streams status via containerize-status:{workspace_id}
  |    |
  |    +-> Parse response, return proposed devcontainer.json string
  |
  +-> Frontend: Shows config in Monaco editor for review
  |    (or Error state if parsing failed — user can fix manually)
  |
  +-> User clicks "Commit to repo" or "Save to Fury only"
  |
  +-> IPC: apply_devcontainer_config(workspace_id, config_json, commit_to_repo)
  |    +-> If commit: write .devcontainer/devcontainer.json, git add + commit (scoped to that file only)
  |    +-> Set workspace.devcontainer_config in DB (enabled, DevcontainerCli, Container mode)
  |
  +-> IPC: start_container(workspace_id)  [existing]
  |    +-> Builds/pulls image, streams logs via container-log:{ws_id}
  |
  +-> IPC: run_script(workspace_id, Setup)  [existing, routed through container_exec]
  |    +-> Runs setup_script inside container
  |
  +-> Container status -> Running. Done.
```

## Scope boundaries

- No SSH server in containers — `docker exec` handles all execution
- No Claude Code installation inside containers — Fury orchestrates from outside
- No built-in template library — the agent generates configs dynamically
- No remote Docker host management — relies on user's `DOCKER_HOST` configuration
- No multi-container orchestration beyond what devcontainer.json supports natively
