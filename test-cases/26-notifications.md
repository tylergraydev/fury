# TC-26: Notifications

## TC-26.01: Notification — agent complete
- **Steps:**
  1. Send a message and wait for agent to finish processing
- **Expected:** "Agent complete" notification generated. Bell icon badge increments.

## TC-26.02: Notification — PR checks pass
- **Precondition:** PR exists with pending checks
- **Steps:**
  1. Wait for all CI checks to pass
- **Expected:** "PR checks pass" notification generated.

## TC-26.03: Notification — PR checks fail
- **Steps:**
  1. Push changes that fail CI
- **Expected:** "PR checks fail" notification generated.

## TC-26.04: Notification — PR merged
- **Steps:**
  1. Have a PR merged (externally or via app)
- **Expected:** "PR merged" notification generated.

## TC-26.05: Notification — build error
- **Steps:**
  1. Trigger a build error in workspace
- **Expected:** "Build error" notification generated.

## TC-26.06: Notification — merge conflict
- **Steps:**
  1. Pull changes that cause merge conflicts
- **Expected:** "Merge conflict" notification generated.

## TC-26.07: Notification panel — open
- **Steps:**
  1. Click the bell icon in top bar
- **Expected:** Notification panel opens (380px wide, max 420px height).

## TC-26.08: Notification panel — time grouping
- **Precondition:** Notifications from different time periods
- **Steps:**
  1. Open notification panel
- **Expected:** Notifications grouped under headers: "Just now", "Today", "Yesterday", "Earlier".

## TC-26.09: Notification panel — unread indicator
- **Steps:**
  1. Open panel with unread notifications
- **Expected:** Unread notifications have a dot indicator. Read notifications do not.

## TC-26.10: Notification panel — mark all read
- **Steps:**
  1. Click "Mark All Read"
- **Expected:** All unread indicators clear. Badge count resets to 0.

## TC-26.11: Notification panel — clear all
- **Steps:**
  1. Click "Clear All"
- **Expected:** All notifications removed from panel. Empty state shown.

## TC-26.12: Notification panel — close
- **Steps:**
  1. Click outside the panel OR click close button OR press **Escape**
- **Expected:** Panel closes.

## TC-26.13: Notification — click-through navigation
- **Steps:**
  1. Click on a notification (e.g., "PR checks fail" for workspace X)
- **Expected:** App navigates to the relevant workspace. Opens the relevant panel/tab (e.g., Checks tab).

## TC-26.14: Badge count — max 99+
- **Steps:**
  1. Generate > 100 notifications without reading
- **Expected:** Badge shows "99+" instead of exact count.

## TC-26.15: Max 200 notifications retained
- **Steps:**
  1. Generate > 200 notifications
- **Expected:** Oldest notifications pruned. Only most recent 200 retained.

## TC-26.16: Notification icons — color coded
- **Steps:**
  1. View notifications of different types
- **Expected:** Each type has distinct icon and color (e.g., green for success, red for failure).

## TC-26.17: Relative timestamps
- **Steps:**
  1. View notifications from various times
- **Expected:** Timestamps shown as relative (e.g., "2m ago", "1h ago", "Yesterday at 3:00 PM").
