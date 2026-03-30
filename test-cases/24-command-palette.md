# TC-24: Command Palette

## TC-24.01: Open command palette (Cmd+K)
- **Steps:**
  1. Press **Cmd+K**
- **Expected:** Command palette overlay opens with search input focused. All available commands listed.

## TC-24.02: Fuzzy search
- **Steps:**
  1. Open palette
  2. Type "term"
- **Expected:** Results filter to show "Focus Terminal" and any other matching commands. Fuzzy matching highlights.

## TC-24.03: Execute sidebar command
- **Steps:**
  1. Open palette
  2. Search and select "All Files"
- **Expected:** Right sidebar switches to Files tab. Palette closes.

## TC-24.04: Execute view command
- **Steps:**
  1. Search and select "Merge"
- **Expected:** Main panel switches to Merge view. Palette closes.

## TC-24.05: Execute action — New Workspace
- **Steps:**
  1. Search and select "New Workspace"
- **Expected:** New workspace creation dialog opens.

## TC-24.06: Execute action — New Session
- **Steps:**
  1. Search and select "New Session"
- **Expected:** Current chat session cleared. Fresh conversation started.

## TC-24.07: Workspace search mode
- **Steps:**
  1. Open palette
  2. Trigger workspace search mode (may be a prefix or mode switch)
  3. Type a workspace name
- **Expected:** Shows matching active and archived workspaces. Selecting switches to that workspace.

## TC-24.08: Restore archived workspace via palette
- **Steps:**
  1. In workspace search mode, find an archived workspace
  2. Select it
- **Expected:** Archived workspace restored and activated.

## TC-24.09: Keyboard shortcuts displayed
- **Steps:**
  1. Open palette and browse commands
- **Expected:** Each command shows its keyboard shortcut (e.g., "Cmd+J" next to "Focus Terminal").

## TC-24.10: Keyboard navigation
- **Steps:**
  1. Open palette
  2. Use arrow keys to navigate results
  3. Press Enter to execute
- **Expected:** Arrow keys move selection highlight. Enter executes selected command.

## TC-24.11: Escape to close
- **Steps:**
  1. Open palette
  2. Press **Escape**
- **Expected:** Palette closes without executing any command.

## TC-24.12: No results
- **Steps:**
  1. Type a nonsensical query (e.g., "xyzzyplugh")
- **Expected:** "No results" or empty state shown. No error.
