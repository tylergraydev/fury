# Fury Roadmap

Feature suggestions and priorities for future development.

---

## Tier 1 — High Impact

### 1. Conversation Search
**Status:** Done
Full-text search across all chat history within a workspace or across all workspaces. Chat history is already in SQLite — needs FTS indexing and a search UI.

### 2. Inline Code Actions from Chat
**Status:** Planned
When the agent suggests code changes in chat, add one-click "Apply" buttons to apply diffs directly to files without copy-pasting.

### 3. Multi-Agent Orchestration
**Status:** Planned
Run multiple AI agents in the same workspace simultaneously. The `agent_teams` experimental flag already exists but isn't shipped.

### 4. Git Stash Management
**Status:** Planned
UI for stashing and unstashing changes, viewing stash contents. Currently requires dropping to terminal.

### 5. Notification Center
**Status:** Done
Centralized notification panel for PR check completions, agent task completions, build failures, merge conflicts across workspaces.

---

## Tier 2 — Medium Impact

### 6. Workspace Templates
Save a workspace configuration (scripts, env vars, MCP servers, sparse checkout dirs) as a reusable template.

### 7. Custom Theme Editor
Let users create and share custom color themes beyond the 3 built-in options. The theming system already uses CSS variables.

### 8. Agent Prompt Library
Save, organize, and reuse frequently-used prompts with variable placeholders (e.g., `{{file}}`, `{{selection}}`).

### 9. File Annotations / Bookmarks
Bookmark specific lines in files and add notes. Persist across sessions with Monaco editor decorations.

### 10. Test Runner Panel
Dedicated panel to run, view, and filter test results with pass/fail status per test (like VS Code's Test Explorer).

---

## Tier 3 — Nice to Have

### 11. Split Editor View
View two files side-by-side in the file viewer (not just diff — two independent editors).

### 12. AI Cost Dashboard
Aggregate token usage and cost across sessions, workspaces, and time periods with charts.

### 13. Snippet Manager
Save, tag, and search code snippets extracted from agent conversations or files.

### 14. Image / Screenshot Support in Chat
Paste or drag-and-drop images into the chat composer to send to vision-capable models.

### 15. Workspace Activity Log
Timeline view showing all actions taken in a workspace: commits, file changes, agent messages, script runs, PR events.

### 16. Quick Diff Preview on Hover
When hovering over a changed file in the sidebar, show a tooltip with a mini diff preview.

### 17. Voice Input for Chat
Use browser/OS speech-to-text APIs to dictate messages to the AI agent.

### 18. Workspace Sharing / Export
Export a workspace's conversation history, todos, and configuration as a shareable bundle.
