# TC-25: Keyboard Shortcuts

## TC-25.01: Cmd+S — Save File
- **Precondition:** File open with unsaved changes
- **Steps:** Press **Cmd+S**
- **Expected:** File saved. Dirty indicator clears.

## TC-25.02: Cmd+K — Command Palette
- **Steps:** Press **Cmd+K**
- **Expected:** Command palette opens.

## TC-25.03: Cmd+B — Toggle Right Sidebar
- **Steps:** Press **Cmd+B** twice
- **Expected:** Sidebar hides on first press, shows on second press.

## TC-25.04: Cmd+J — Focus Terminal
- **Steps:** Press **Cmd+J**
- **Expected:** Focus moves to terminal panel.

## TC-25.05: Cmd+, — Settings
- **Steps:** Press **Cmd+,**
- **Expected:** Settings dialog opens.

## TC-25.06: Cmd+N — New Workspace
- **Steps:** Press **Cmd+N**
- **Expected:** New workspace creation dialog opens.

## TC-25.07: Cmd+1 — Files Tab
- **Steps:** Press **Cmd+1**
- **Expected:** Right sidebar switches to Files tab (or toggles sidebar if already on Files).

## TC-25.08: Cmd+2 — Changes Tab
- **Steps:** Press **Cmd+2**
- **Expected:** Right sidebar switches to Changes tab.

## TC-25.09: Cmd+3 — Checks Tab
- **Precondition:** In workspace context
- **Steps:** Press **Cmd+3**
- **Expected:** Right sidebar switches to Checks tab.

## TC-25.10: Cmd+4 — Notifications
- **Steps:** Press **Cmd+4**
- **Expected:** Notifications panel toggles open/closed.

## TC-25.11: Cmd+5 — Team View
- **Steps:** Press **Cmd+5**
- **Expected:** Team view opens in main panel.

## TC-25.12: Cmd+6 — Bookmarks Tab
- **Steps:** Press **Cmd+6**
- **Expected:** Right sidebar switches to Bookmarks tab.

## TC-25.13: Cmd+Shift+T — Test Runner
- **Steps:** Press **Cmd+Shift+T**
- **Expected:** Test Runner view opens.

## TC-25.14: Cmd+Shift+R — Run Tests
- **Steps:** Press **Cmd+Shift+R**
- **Expected:** Tests execute using configured test command.

## TC-25.15: Cmd+Shift+U — Usage Dashboard
- **Steps:** Press **Cmd+Shift+U**
- **Expected:** Usage dashboard view opens showing token/cost data.

## TC-25.16: Cmd+Shift+S — Snippets
- **Steps:** Press **Cmd+Shift+S**
- **Expected:** Snippets manager dialog opens.

## TC-25.17: Cmd+Shift+A — Activity Log
- **Steps:** Press **Cmd+Shift+A**
- **Expected:** Activity log view opens.

## TC-25.18: Cmd+Shift+E — Export Workspace
- **Precondition:** Active workspace selected
- **Steps:** Press **Cmd+Shift+E**
- **Expected:** Export workspace dialog opens.

## TC-25.19: Cmd+\\ — Split Editor
- **Steps:** Press **Cmd+\\** with a file open
- **Expected:** Editor splits into two panes.

## TC-25.20: Cmd+Shift+F — Search Workspaces
- **Steps:** Press **Cmd+Shift+F**
- **Expected:** Workspace search opens (palette in workspace mode).

## TC-25.21: Escape — Close modal/panel
- **Precondition:** A modal/dialog is open
- **Steps:** Press **Escape**
- **Expected:** Modal/dialog closes.

## TC-25.22: Platform detection — Mac vs Windows/Linux
- **Steps (Mac):** Observe shortcut labels in command palette
- **Expected (Mac):** Shows "⌘" for Cmd key.
- **Steps (Windows/Linux):** Observe shortcut labels
- **Expected (Windows/Linux):** Shows "Ctrl" instead of "⌘".

## TC-25.23: Chat-specific shortcuts
- **Steps:**
  1. Focus the chat composer
  2. Test: Alt+T (thinking), Alt+P (model), Alt+V (voice), Alt+L (prompts), Cmd+U (attach), Shift+Tab (plan), Cmd+Shift+Enter (approve), Cmd+I (issue picker)
- **Expected:** Each shortcut triggers its respective action when composer is focused.
