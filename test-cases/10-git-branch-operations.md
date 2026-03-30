# TC-10: Git & Branch Operations

## TC-10.01: Branch status — ahead/behind
- **Precondition:** Workspace branch with commits not on default branch
- **Steps:**
  1. Observe the Sync button in right sidebar
- **Expected:** Shows ahead count (e.g., "3 ahead") and behind count (e.g., "2 behind") relative to default branch.

## TC-10.02: Fetch upstream
- **Steps:**
  1. Open Merge view > Sync section
  2. Click "Fetch"
- **Expected:** Runs `git fetch origin`. Ahead/behind counts update to reflect remote state.

## TC-10.03: Pull with rebase
- **Precondition:** Branch is behind the default branch
- **Steps:**
  1. Open Merge view > Sync section
  2. Click "Pull (Rebase)"
- **Expected:** Runs `git pull --rebase origin {default_branch}`. Behind count drops to 0. File contents update.

## TC-10.04: Pull with merge
- **Steps:**
  1. Click "Pull (Merge)" in Sync section
- **Expected:** Runs `git pull origin {default_branch}`. Merge commit created if necessary. Behind count drops to 0.

## TC-10.05: Pull — conflict detection
- **Precondition:** Conflicting changes between local and remote
- **Steps:**
  1. Pull (rebase or merge)
- **Expected:** Pull result indicates conflicts. `has_conflicts: true` with list of conflicted files. Conflict section becomes active.

## TC-10.06: Push workspace branch
- **Steps:**
  1. Open Merge view > Sync section
  2. Click "Push"
- **Expected:** Runs `git push origin {branch}`. Ahead count drops to 0. Changes available on remote.

## TC-10.07: Conflict detection
- **Precondition:** Merge in progress with conflicts
- **Steps:**
  1. Open Merge view > Conflicts section
- **Expected:** Lists all conflicted files with conflict type indicators.

## TC-10.08: Conflict resolver — view all versions
- **Steps:**
  1. Click on a conflicted file
- **Expected:** Conflict resolver opens with tabs: "Current (with markers)", "Base", "Ours", "Theirs". Each tab shows the respective version.

## TC-10.09: Resolve conflict — Accept Ours
- **Steps:**
  1. Open a conflicted file in resolver
  2. Click "Accept Ours"
- **Expected:** File resolved with "ours" version. Conflict markers removed. File removed from conflict list.

## TC-10.10: Resolve conflict — Accept Theirs
- **Steps:**
  1. Click "Accept Theirs" on a conflicted file
- **Expected:** File resolved with "theirs" version. Conflict markers removed.

## TC-10.11: Resolve conflict — AI-powered
- **Steps:**
  1. Click "AI Resolve" on a conflicted file
- **Expected:** Conflict context sent to agent. Agent provides intelligent merge resolution. Result applied to file.

## TC-10.12: Abort merge
- **Precondition:** Merge in progress with conflicts
- **Steps:**
  1. Click "Abort Merge"
- **Expected:** Runs `git merge --abort`. All conflict state cleared. Files restored to pre-merge state.

## TC-10.13: Continue merge after resolution
- **Precondition:** All conflicts resolved
- **Steps:**
  1. Click "Continue Merge"
- **Expected:** Runs `git commit` to complete the merge. Merge state clears. Branch status updates.

## TC-10.14: Git log display
- **Steps:**
  1. Open History view
- **Expected:** Shows structured log entries with: short hash, full hash, commit message, author, and timestamp. Default 100 commits.

## TC-10.15: Stash — create
- **Steps:**
  1. Open Merge view > Stash section
  2. Click "Create Stash"
  3. Optionally enter a message
- **Expected:** Working directory changes stashed. Changes disappear from Changes tab. Stash appears in stash list.

## TC-10.16: Stash — create with untracked files
- **Steps:**
  1. Create a stash with "Include Untracked" option
- **Expected:** Both modified and untracked files included in the stash.

## TC-10.17: Stash — apply
- **Steps:**
  1. Select a stash in the list
  2. Click "Apply"
- **Expected:** Stash changes applied to working directory. Stash remains in list (not removed).

## TC-10.18: Stash — pop
- **Steps:**
  1. Select a stash
  2. Click "Pop"
- **Expected:** Stash changes applied to working directory. Stash removed from list.

## TC-10.19: Stash — drop
- **Steps:**
  1. Select a stash
  2. Click "Drop"
- **Expected:** Stash deleted. Changes lost. Removed from stash list.

## TC-10.20: Stash — show contents
- **Steps:**
  1. Expand a stash in the list
- **Expected:** Shows detailed diff of stashed changes — files modified, additions/deletions.

## TC-10.21: Sync button loading state
- **Steps:**
  1. Click Sync/Fetch while operation is running
  2. Observe the button
- **Expected:** Loading spinner shown. Button disabled during operation. Returns to normal on completion.

## TC-10.22: Branch status — no upstream
- **Precondition:** Branch with no remote tracking
- **Steps:**
  1. Observe branch status
- **Expected:** Indicates no upstream branch. Push may prompt to set upstream.
