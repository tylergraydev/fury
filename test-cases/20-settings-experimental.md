# TC-20: Settings — Experimental Features

## TC-20.01: Spotlight Testing — enable
- **Steps:**
  1. Go to Settings > Experimental
  2. Enable "Spotlight Testing"
- **Expected:** Toggle turns on. Workspace worktree file watching begins. Agent's changes sync in real-time for testing.

## TC-20.02: Spotlight Testing — file sync
- **Precondition:** Spotlight Testing enabled
- **Steps:**
  1. Agent makes changes to files in workspace
  2. Observe file changes from outside the worktree
- **Expected:** File changes synced in real-time without switching branches.

## TC-20.03: Agent Teams — enable
- **Steps:**
  1. Enable "Agent Teams"
- **Expected:** Agents become aware of sibling workspaces. `FURY_AGENT_TEAMS` and `FURY_TEAM_WORKSPACES` environment variables set.

## TC-20.04: Agent Teams — sibling awareness
- **Precondition:** Agent Teams enabled, multiple workspaces in same repo
- **Steps:**
  1. Send a message in workspace A referencing workspace B's work
- **Expected:** Agent has context about sibling workspaces and can reference their state.

## TC-20.05: Performance Mode — enable
- **Steps:**
  1. Enable "Performance Mode (Persistent Processes)"
  2. Send a message, wait for response
  3. Send another message
- **Expected:** First message may have normal startup time. Second message starts noticeably faster (process already alive).

## TC-20.06: Performance Mode — memory usage
- **Precondition:** Performance Mode enabled
- **Steps:**
  1. Use several workspaces
  2. Check system memory usage
- **Expected:** Higher memory usage than non-persistent mode (processes stay alive). Processes visible in Activity Monitor.

## TC-20.07: Performance Mode — not available with Codex
- **Steps:**
  1. Set agent type to Codex CLI
  2. Check Performance Mode option
- **Expected:** Performance Mode option disabled or shows note that it's not available with Codex CLI.

## TC-20.08: Safe Mode — enable
- **Steps:**
  1. Enable "Safe Mode"
  2. Send a message that triggers tool calls
- **Expected:** Every tool call (including file reads, bash commands) shows a permission approval prompt.

## TC-20.09: Safe Mode — disable
- **Steps:**
  1. Disable "Safe Mode"
  2. Send a message that triggers tool calls
- **Expected:** Tool calls auto-approved (no permission prompts for standard operations).

## TC-20.10: All experimental toggles default to off
- **Steps:**
  1. Fresh install or reset settings
  2. Check all experimental toggles
- **Expected:** Spotlight Testing: off, Agent Teams: off, Performance Mode: off, Safe Mode: off.
