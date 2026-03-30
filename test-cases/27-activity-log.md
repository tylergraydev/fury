# TC-27: Activity Log

## TC-27.01: Open activity log (Cmd+Shift+A)
- **Steps:**
  1. Press **Cmd+Shift+A**
- **Expected:** Activity log view opens in main panel.

## TC-27.02: Activity — commit logged
- **Steps:**
  1. Agent or user makes a git commit in workspace
- **Expected:** "Commit" activity entry appears with commit hash and message.

## TC-27.03: Activity — agent started/completed
- **Steps:**
  1. Send a message to agent
  2. Wait for completion
- **Expected:** "Agent started" entry when processing begins. "Agent completed" entry when done.

## TC-27.04: Activity — chat user/agent messages
- **Steps:**
  1. Exchange messages with agent
- **Expected:** "Chat user" and "Chat agent" entries logged for each message.

## TC-27.05: Activity — script started/succeeded/failed
- **Steps:**
  1. Run a script that succeeds
  2. Run a script that fails
- **Expected:** "Script started" entry for both. "Script succeeded" for first, "Script failed" for second.

## TC-27.06: Activity — PR events
- **Steps:**
  1. Create a PR, wait for checks, merge
- **Expected:** "PR opened", "PR checks pass/fail", "PR merged" entries logged at each stage.

## TC-27.07: Activity — merge conflict events
- **Steps:**
  1. Trigger a merge conflict
  2. Resolve it
- **Expected:** "Merge conflict detected" and "Merge conflict resolved" entries.

## TC-27.08: Per-workspace filtering
- **Precondition:** Activities from multiple workspaces
- **Steps:**
  1. Select a specific workspace filter
- **Expected:** Only activities from that workspace shown.

## TC-27.09: Activity type filtering — multi-select
- **Steps:**
  1. Toggle "Commit" filter on
  2. Toggle "Agent" filter on
  3. Toggle "PR" filter off
- **Expected:** Only selected activity types shown. Multiple types can be active simultaneously.

## TC-27.10: Timestamp display
- **Steps:**
  1. Observe activity entry timestamps
- **Expected:** Precise timestamps with millisecond precision shown.

## TC-27.11: Git log integration
- **Steps:**
  1. Open activity log
- **Expected:** Recent commits (up to 50) automatically loaded and integrated into the activity stream with author, hash, and message.

## TC-27.12: Clear filters
- **Steps:**
  1. Apply several filters
  2. Click "Clear Filters"
- **Expected:** All filters reset. All activity types shown.

## TC-27.13: Clear all entries
- **Steps:**
  1. Click "Clear All"
- **Expected:** All activity entries removed. Empty state shown.

## TC-27.14: Max 500 entries
- **Steps:**
  1. Generate > 500 activities
- **Expected:** Oldest entries pruned. Only most recent 500 retained.

## TC-27.15: Chronological sorting
- **Steps:**
  1. View activity log with multiple entries
- **Expected:** Entries sorted newest first (descending chronological order).

## TC-27.16: Type icons and colors
- **Steps:**
  1. View activities of different types
- **Expected:** Each type has distinct icon and color coding matching its category.
