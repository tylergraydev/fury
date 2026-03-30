# TC-05: Chat — Message Persistence & Search

## TC-05.01: Messages persist across app restart
- **Steps:**
  1. Send several messages in a workspace chat
  2. Quit and relaunch the app
  3. Open the same workspace
- **Expected:** All previous messages are loaded from the database. Message content, metadata, and ordering preserved.

## TC-05.02: Session stats restored on load
- **Steps:**
  1. Have a conversation with cost/token data
  2. Restart the app
  3. Open the workspace
- **Expected:** Session stats (total cost, tokens, turns) are restored from the last message's metadata.

## TC-05.03: Clear all messages
- **Steps:**
  1. Have a conversation with messages
  2. Clear all messages (via action/command)
- **Expected:** All messages removed from chat view. Database cleared for this workspace. Session state reset.

## TC-05.04: Clear messages — no re-population from in-flight events
- **Steps:**
  1. While agent is streaming a response, clear all messages
- **Expected:** Agent stops. Messages clear completely. No stale messages re-appear from streaming events.

## TC-05.05: Search messages — keyword match
- **Steps:**
  1. Have messages containing "authentication"
  2. Open message search
  3. Type "authentication"
- **Expected:** Search results show matching messages with context (workspace name, role, timestamp).

## TC-05.06: Search messages — global scope
- **Precondition:** Messages in multiple workspaces
- **Steps:**
  1. Open search without workspace filter
  2. Search for a common term
- **Expected:** Results include matches from all workspaces. Each result shows its workspace name.

## TC-05.07: Search messages — workspace-scoped
- **Steps:**
  1. Open search with workspace filter set
  2. Search for a term
- **Expected:** Only messages from the selected workspace appear in results.

## TC-05.08: Search — empty/whitespace query
- **Steps:**
  1. Type only spaces in the search field
- **Expected:** No results returned. No error.

## TC-05.09: Search — click result navigates to message
- **Steps:**
  1. Search for a term
  2. Click on a search result
- **Expected:** Chat scrolls to and highlights the matching message. Smooth scroll to center.

## TC-05.10: Message highlight from search
- **Steps:**
  1. Click a search result
  2. Observe the highlighted message
- **Expected:** Matched message has distinct highlight styling. Highlight fades or clears after a moment.

## TC-05.11: Checkpoint — auto-creation before message
- **Steps:**
  1. Send a message in workspace with git repo
  2. Check checkpoint list
- **Expected:** New checkpoint created with: workspace ID, session ID, turn index, user message text, git tree SHA, commit SHA.

## TC-05.12: Checkpoint — revert restores git + chat
- **Precondition:** Multiple checkpoints exist, files have changed since earlier checkpoint
- **Steps:**
  1. Open checkpoint list/dialog
  2. Select an earlier checkpoint
  3. Click "Revert to checkpoint"
- **Expected:** Git worktree is restored to checkpoint's state (file changes reverted). Chat history is restored to that point. Later messages removed.

## TC-05.13: Checkpoint — filtered by current turn
- **Steps:**
  1. Observe checkpoint list during a conversation
- **Expected:** Checkpoints display filtered/relevant to the current conversation state.

## TC-05.14: Usage dashboard — daily aggregation
- **Steps:**
  1. Use the app for several turns across workspaces
  2. Open Usage Dashboard (**Cmd+Shift+U**)
- **Expected:** Shows daily usage aggregation with cost breakdown.

## TC-05.15: Usage dashboard — time period filtering
- **Steps:**
  1. Open Usage Dashboard
  2. Switch between: Today, 7d, 30d, All
- **Expected:** Data updates to reflect the selected time period. Charts and workspace breakdown refresh.

## TC-05.16: Usage dashboard — workspace breakdown
- **Precondition:** Usage data across multiple workspaces
- **Steps:**
  1. Open Usage Dashboard
- **Expected:** Workspaces listed sorted by cost (descending). Each shows individual cost contribution.
