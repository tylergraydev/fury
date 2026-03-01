# E2E Test Roadmap

Total: 83 tests across 18 suites. All passing.

## Phase 1 — Core Flows (done)
20 tests across 4 suites.

- [x] `landing-page.spec.ts` (6 tests) — header, quick actions, repos, search, shortcuts, settings
- [x] `workspace-flow.spec.ts` (5 tests) — workspace/repo selection, sidebar switching, messages, composer
- [x] `chat-flow.spec.ts` (4 tests) — pre-seeded messages, typing, sending, streaming response
- [x] `command-palette.spec.ts` (5 tests) — open/close, search, execute, workspace switching

## Phase 2 — Chat Details (done)
9 tests across 2 suites.

- [x] `tool-calls.spec.ts` (5 tests)
  - Expand tool call shows input and result sections
  - Collapse tool call hides details
  - Tool name badge shows normalized name with summary
  - Multiple tool calls each expand independently
  - Streamed tool calls appear during agent response
- [x] `composer-autocomplete.spec.ts` (4 tests)
  - Typing "/" at line start shows slash command menu
  - Arrow keys navigate slash menu, Enter selects
  - Typing "@" shows file mention menu
  - Escape closes autocomplete menu

## Phase 3 — File Viewer & Tabs (done)
5 tests in 1 suite.

- [x] `file-viewer.spec.ts` (5 tests)
  - Clicking file in sidebar opens file tab
  - Clicking Chat tab returns to chat view
  - Close button removes file tab
  - Double-click file tab pins it (removes italic)
  - Multiple file tabs, clicking switches active tab

## Phase 4 — Right Sidebar (done)
5 tests in 1 suite.

- [x] `right-sidebar.spec.ts` (5 tests)
  - File tree shows directories and files from mock data
  - Clicking folder expands/collapses children
  - Changes tab shows diff summary (file count, additions, deletions)
  - Clicking file in changes opens diff modal
  - Bottom panel tabs switch between Setup, Run, and Terminal

## Phase 5 — Merge View (done)
4 tests in 1 suite.

- [x] `merge-view.spec.ts` (4 tests)
  - Sync section shows branch status (ahead/behind)
  - Fetch button triggers fetch action
  - Sub-tabs switch between Sync, Compare, and Conflicts
  - Conflicts section shows empty state when no conflicts

## Phase 6 — History View (done)
3 tests in 1 suite.

- [x] `history-view.spec.ts` (3 tests)
  - Shows Activity Timeline header with Refresh button
  - Displays chat messages in timeline (You/Claude labels)
  - Shows tool call count badge for assistant messages

## Phase 7 — Settings (done)
8 tests in 1 suite.

- [x] `settings.spec.ts` (8 tests)
  - Settings overlay opens with navigation tabs
  - Appearance tab shows theme cards with active badge
  - Clicking a different theme selects it
  - Provider tab shows provider dropdown and env var config
  - Experimental tab shows feature toggles
  - MCP Servers tab shows empty state with Add button
  - Add MCP Server form opens and shows inputs
  - Updates tab shows version and check button

## Phase 8 — PR Panel (done)
5 tests in 1 suite.

- [x] `pr-panel.spec.ts` (5 tests)
  - Shows Create PR button when no PR exists
  - Create PR button triggers agent message
  - PR number and title shown in status view
  - CI checks display with status indicators
  - Push button and Fix with Claude button visible

## Phase 9 — Workspace Dialogs (done)
4 tests in 1 suite.

- [x] `workspace-dialogs.spec.ts` (4 tests)
  - New workspace dialog opens from sidebar button
  - Worktree name input visible
  - Branch dropdown loads branches from mock
  - Cancel closes dialog

## Phase 10 — Landing Dialogs (done)
3 tests in 1 suite.

- [x] `landing-dialogs.spec.ts` (3 tests)
  - Clone repo dialog opens with URL input
  - New AI Project dialog opens with name and path inputs
  - Open Repository triggers directory picker

## Phase 11 — Sidebar Details (done)
4 tests in 1 suite.

- [x] `sidebar-details.spec.ts` (4 tests)
  - Repo section collapses/expands on click
  - Double-click workspace name enables rename
  - Archive button appears on workspace hover
  - Archived section expands and shows empty state

## Phase 12 — Todos (skipped)
NotesPanel component is defined but not rendered in the app yet.

## Phase 13 — Terminal & Scripts (done)
3 tests in 1 suite.

- [x] `terminal-panels.spec.ts` (3 tests)
  - Setup panel shows Setup Script header and Run button
  - Run panel shows Run Script header and Run button
  - Terminal tab renders terminal view

## Phase 14 — Error & Edge States (done)
3 tests in 1 suite.

- [x] `error-states.spec.ts` (3 tests)
  - Agent error status shows error indicator
  - Empty workspace shows help text with no messages
  - Streaming with pending text shows Running indicator

## Phase 15 — Prompt Library (done)
7 tests in 1 suite.

- [x] `prompt-library.spec.ts` (7 tests)
  - Opens prompt library from plus menu
  - Creates a new prompt with name, content, description, and category
  - Inserts a simple prompt into the composer
  - Searches and filters prompts by text
  - Shows category filter pills and filters by category
  - Closes prompt library with Close button
  - Slash command /prompt: autocomplete shows saved prompts
