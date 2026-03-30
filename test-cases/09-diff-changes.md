# TC-09: Diff & Changes

## TC-09.01: View workspace diff — all changed files
- **Precondition:** Workspace with modified files
- **Steps:**
  1. Open Changes tab in right sidebar
- **Expected:** All changed files listed with status indicators: A (green), M (yellow), D (red), U (green), R (yellow). Badge shows total count.

## TC-09.02: View single file diff
- **Steps:**
  1. In Changes tab, click on a modified file
- **Expected:** Diff panel opens with Monaco DiffEditor. Side-by-side comparison: original (left) vs modified (right). Syntax highlighting active.

## TC-09.03: Hover preview of changes
- **Steps:**
  1. In Changes tab, hover over a changed file (do not click)
- **Expected:** Lightweight patch preview appears on hover showing truncated changes. Preview disappears on mouse leave.

## TC-09.04: Diff watcher — real-time updates
- **Steps:**
  1. Open Changes tab
  2. In terminal or external editor, modify a file in the workspace
  3. Observe Changes tab
- **Expected:** Changes tab updates automatically when files are modified. New changes appear without manual refresh.

## TC-09.05: Start/stop diff watcher
- **Steps:**
  1. Navigate to a workspace (starts watcher automatically)
  2. Switch away from workspace
- **Expected:** Diff watcher starts on workspace activation. Stops when switching away. No resource leaks.

## TC-09.06: Repository-level diff
- **Steps:**
  1. Switch to repository context (not workspace)
  2. Open Changes tab
- **Expected:** Shows diff for the entire repository (all uncommitted changes).

## TC-09.07: Cross-worktree diff
- **Precondition:** Two linked workspaces with different changes
- **Steps:**
  1. Open Merge view > Compare tab
  2. View cross-worktree differences
- **Expected:** Shows files that differ between the two workspaces. Can click individual files to see detailed diff.

## TC-09.08: Cross-worktree single file diff
- **Steps:**
  1. In cross-worktree diff view, click on a specific file
- **Expected:** Monaco DiffEditor shows that file's differences between the two workspaces.

## TC-09.09: Diff panel — language awareness
- **Steps:**
  1. Open diff for files of different types (.ts, .py, .rs)
- **Expected:** Each diff view uses correct syntax highlighting for the file's language.

## TC-09.10: Diff panel — read-only
- **Steps:**
  1. Open a diff view
  2. Try to edit text in the diff panel
- **Expected:** Diff panel is read-only. Edits are not possible. No cursor/typing in diff view.

## TC-09.11: Changes panel — change count badge
- **Steps:**
  1. Modify several files in workspace
  2. Observe the Changes tab header
- **Expected:** Badge shows count of changed files (e.g., "Changes (5)"). Updates in real-time.

## TC-09.12: Changes panel — double-click opens file
- **Steps:**
  1. Double-click a file in the Changes panel
- **Expected:** File opens in the main editor (not in diff view). Ready for editing.

## TC-09.13: Untracked file in diff
- **Steps:**
  1. Create a new file in the workspace that's not in git
  2. Check Changes tab
- **Expected:** File appears with "U" (Untracked) status in green. Can view its full content (no "original" side in diff).

## TC-09.14: Deleted file in diff
- **Steps:**
  1. Delete a tracked file in the workspace
  2. Check Changes tab
- **Expected:** File appears with "D" (Deleted) status in red. Diff shows original content with everything removed.

## TC-09.15: Renamed file in diff
- **Steps:**
  1. Rename a tracked file in the workspace
  2. Check Changes tab
- **Expected:** File appears with "R" (Renamed) status in yellow. Shows old name → new name.
