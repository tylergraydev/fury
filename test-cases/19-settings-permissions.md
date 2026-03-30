# TC-19: Settings — Permissions

## TC-19.01: View suggested presets
- **Steps:**
  1. Go to Settings > Permissions
- **Expected:** Suggested permission presets displayed:
  - Read-only tools: Read, Glob, Grep, LS
  - File editing: Edit, Write, NotebookEdit
  - Shell commands: Bash(*)
  - MCP tools: mcp__*
  - Agent tools: Agent, TaskCreate, TaskUpdate

## TC-19.02: Add permission rule — specific tool
- **Steps:**
  1. Type a rule: `Read`
  2. Click "Add"
- **Expected:** Rule added to allow list. Displayed in current rules section.

## TC-19.03: Add permission rule — wildcard
- **Steps:**
  1. Add rule: `Bash(*)`
- **Expected:** Wildcard rule added. All Bash tool invocations auto-approved.

## TC-19.04: Add permission rule — MCP wildcard
- **Steps:**
  1. Add rule: `mcp__github__*`
- **Expected:** All GitHub MCP tools auto-approved.

## TC-19.05: Remove permission rule
- **Steps:**
  1. Click the remove button on an existing rule
- **Expected:** Rule removed. That tool will now require manual approval again.

## TC-19.06: Permissions persist to ~/.claude/settings.json
- **Steps:**
  1. Add permission rules in Fury
  2. Open `~/.claude/settings.json` in an external editor
- **Expected:** Rules appear in the settings.json file. Shared with Claude Code CLI.

## TC-19.07: Permissions survive app restart
- **Steps:**
  1. Configure permissions
  2. Restart app
  3. Check permissions settings
- **Expected:** All rules preserved.

## TC-19.08: Rule validation
- **Steps:**
  1. Try to add an empty rule
  2. Try to add a duplicate rule
- **Expected:** Invalid rules rejected with appropriate feedback.
