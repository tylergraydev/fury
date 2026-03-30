# TC-06: Workspace Management

## TC-06.01: Create workspace
- **Precondition:** At least one repository registered
- **Steps:**
  1. Click the "+" (New Chat Worktree) button in the left sidebar
  2. Select a repository
  3. Enter workspace name (e.g., "feature-auth")
  4. Enter branch name (e.g., "feature/auth")
  5. Confirm creation
- **Expected:** Workspace created with git worktree. Appears in left sidebar under its repository. Workspace becomes active. Chat panel ready.

## TC-06.02: Create workspace with sparse checkout
- **Steps:**
  1. Create a new workspace
  2. Select sparse checkout directories (e.g., `src/`, `tests/`)
  3. Confirm
- **Expected:** Workspace created with only specified directories checked out. File tree shows only those directories.

## TC-06.03: Create workspace with base branch
- **Steps:**
  1. Create workspace with baseBranch set to "develop"
- **Expected:** Workspace uses "develop" as the comparison base for diffs instead of the default branch.

## TC-06.04: Create workspace — fetch remote branch
- **Precondition:** Branch exists on remote but not locally
- **Steps:**
  1. Create workspace with `fetchRemoteBranch: true` and a remote branch name
- **Expected:** Branch is fetched from remote before worktree creation. Workspace opens on that branch.

## TC-06.05: List active workspaces
- **Steps:**
  1. Observe the left sidebar
- **Expected:** All active (non-archived) workspaces displayed, grouped by repository. Each shows name, branch, and creation time.

## TC-06.06: Switch active workspace
- **Precondition:** Multiple workspaces exist
- **Steps:**
  1. Click on a different workspace in the sidebar
- **Expected:** Main panel switches to that workspace's chat. Right sidebar updates (files, changes, checks). Agent status reflects that workspace.

## TC-06.07: Rename workspace
- **Steps:**
  1. Right-click a workspace in the sidebar (or click menu)
  2. Select "Rename"
  3. Type new name
  4. Confirm
- **Expected:** Workspace name updates in sidebar immediately. Persisted to database.

## TC-06.08: Pin workspace
- **Steps:**
  1. Right-click a workspace
  2. Select "Pin"
- **Expected:** Workspace moves to the top of its repository group. Pin indicator visible.

## TC-06.09: Unpin workspace
- **Steps:**
  1. Right-click a pinned workspace
  2. Select "Unpin"
- **Expected:** Workspace returns to normal sort order (by creation time).

## TC-06.10: Archive workspace
- **Steps:**
  1. Right-click a workspace
  2. Select "Archive"
- **Expected:** Workspace disappears from active list. Appears in "Archived" section (collapsed by default). If it was the active workspace, next workspace is auto-selected. Chat tabs for that workspace close.

## TC-06.11: Restore archived workspace
- **Steps:**
  1. Expand the "Archived" section in sidebar
  2. Click "Restore" on an archived workspace
- **Expected:** Workspace moves back to active list. All data preserved. Can be selected and used again.

## TC-06.12: Delete workspace
- **Steps:**
  1. Right-click a workspace
  2. Select "Delete"
  3. Confirm deletion
- **Expected:** Workspace permanently removed from database and UI. Cannot be restored. Associated chat tabs close.

## TC-06.13: Workspace notes
- **Steps:**
  1. Open workspace details/notes
  2. Type notes: "Working on auth refactor, blocked by API changes"
  3. Save
- **Expected:** Notes persist. Visible when viewing workspace details. Survives app restart.

## TC-06.14: Link workspaces
- **Precondition:** Two workspaces exist in the same repository
- **Steps:**
  1. Select workspace A
  2. Link it to workspace B
- **Expected:** Link created. Cross-worktree diff available in Merge view > Compare tab.

## TC-06.15: Unlink workspaces
- **Steps:**
  1. With two linked workspaces, unlink them
- **Expected:** Link removed. Cross-worktree diff no longer available between them.

## TC-06.16: Cross-worktree diff
- **Precondition:** Two linked workspaces with different changes
- **Steps:**
  1. Open Merge view
  2. Go to Compare tab
  3. Select the linked workspace
- **Expected:** Shows file differences between the two workspaces side-by-side.

## TC-06.17: Workspace linked directories passed to agent
- **Precondition:** Workspace with linked workspaces
- **Steps:**
  1. Send a message to the agent
  2. Observe agent's available directories
- **Expected:** Linked workspace paths are passed to agent as `--add-dir` arguments. Agent can access files across linked workspaces.

## TC-06.18: Workspace template — create
- **Steps:**
  1. Configure a workspace with specific settings
  2. Save as template with a name
- **Expected:** Template saved with workspace configuration. Appears in template list.

## TC-06.19: Workspace template — create from template
- **Steps:**
  1. Create a new workspace
  2. Select a saved template
- **Expected:** New workspace pre-configured with template settings (branch naming, sparse dirs, etc.).

## TC-06.20: Export workspace
- **Steps:**
  1. Select a workspace
  2. Press **Cmd+Shift+E** or use Export action
  3. Choose export options
- **Expected:** Workspace exported to specified format. File saved to disk.

## TC-06.21: Active workspace persists across sessions
- **Steps:**
  1. Select workspace B as active
  2. Quit and relaunch app
- **Expected:** Workspace B is still the active workspace (stored in sessionStorage).

## TC-06.22: Archived workspaces count
- **Precondition:** Multiple archived workspaces
- **Steps:**
  1. Observe the "Archived" section header
- **Expected:** Shows count of archived workspaces (e.g., "Archived (3)").

## TC-06.23: Issue linking — Linear (Cmd+I)
- **Precondition:** Linear API key configured
- **Steps:**
  1. Press **Cmd+I** in a workspace
  2. Search for a Linear issue
  3. Select and link it
- **Expected:** Issue picker dialog opens. Issue linked to workspace. Issue context available in chat.

## TC-06.24: Issue unlinking
- **Steps:**
  1. With a linked issue, unlink it
- **Expected:** Issue removed from workspace. No longer appears in workspace context.
