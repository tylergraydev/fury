# TC-21: Settings — Repository-Level Configuration

## TC-21.01: Setup script configuration
- **Steps:**
  1. Open repository settings
  2. Enter setup script: `npm install`
  3. Save
- **Expected:** Script saved. Runs automatically when new workspaces are created for this repo.

## TC-21.02: Run script configuration
- **Steps:**
  1. Enter run script: `npm start`
  2. Save
- **Expected:** Script saved. Runs at the start of each agent turn.

## TC-21.03: Archive script configuration
- **Steps:**
  1. Enter archive script: `npm run cleanup`
  2. Save
- **Expected:** Script saved. Runs when a workspace is archived.

## TC-21.04: Run script mode — nonconcurrent
- **Steps:**
  1. Set run script mode to "nonconcurrent"
  2. Save
- **Expected:** Previous run script process killed before new one starts.

## TC-21.05: Run script mode — concurrent
- **Steps:**
  1. Set run script mode to "concurrent"
  2. Save
- **Expected:** Multiple run script instances can run simultaneously.

## TC-21.06: Worktree base path
- **Steps:**
  1. Set custom worktree base path (e.g., `/tmp/worktrees`)
  2. Create a new workspace
- **Expected:** Worktree created in `/tmp/worktrees/{repo_name}/`. Repo name appended automatically.

## TC-21.07: Worktree base path — default
- **Steps:**
  1. Leave worktree base path empty
  2. Create workspace
- **Expected:** Worktree created in `.worktrees/` inside the repository.

## TC-21.08: Repository environment variables
- **Steps:**
  1. Add env var: `DATABASE_URL=postgres://...`
  2. Save
  3. Send a message to agent in this repo's workspace
- **Expected:** Env var available to agent processes. Agent can use `DATABASE_URL`.

## TC-21.09: Repository environment variables — add/remove
- **Steps:**
  1. Add three env vars
  2. Remove the second one
  3. Save
- **Expected:** Two env vars remain. Removed var no longer available.

## TC-21.10: Provider override
- **Steps:**
  1. Set provider override to a different provider than global
  2. Send a message in this repo's workspace
- **Expected:** This repo uses the overridden provider. Other repos use global provider.

## TC-21.11: Settings persist per repository
- **Steps:**
  1. Configure settings for repo A
  2. Switch to repo B
  3. Configure different settings
  4. Return to repo A
- **Expected:** Each repository retains its own settings independently.

## TC-21.12: System prompt additions
- **Steps:**
  1. Go to Settings
  2. Enter custom system prompt: "Always respond in bullet points"
  3. Save
  4. Send a message to agent
- **Expected:** Custom instruction appended to agent's system prompt. Agent follows the instruction.
