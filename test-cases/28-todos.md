# TC-28: Todos

## TC-28.01: Add todo
- **Steps:**
  1. Open todo list for a workspace
  2. Enter title: "Fix authentication bug"
  3. Set priority: "High"
  4. Add
- **Expected:** Todo created. Appears in list with title and priority indicator.

## TC-28.02: Toggle todo complete
- **Steps:**
  1. Click the checkbox on a todo
- **Expected:** Todo marked as complete. Visual indicator (strikethrough or checkmark).

## TC-28.03: Toggle todo incomplete
- **Steps:**
  1. Click the checkbox on a completed todo
- **Expected:** Todo marked as incomplete. Visual indicator reverts.

## TC-28.04: Update todo title
- **Steps:**
  1. Edit an existing todo's title
  2. Save
- **Expected:** Title updated. Persisted to database.

## TC-28.05: Update todo priority
- **Steps:**
  1. Change priority from "High" to "Low"
  2. Save
- **Expected:** Priority updated. Visual indicator changes.

## TC-28.06: Delete todo
- **Steps:**
  1. Delete a todo
- **Expected:** Todo removed from list permanently.

## TC-28.07: Reorder todos
- **Steps:**
  1. Drag a todo to a different position in the list
- **Expected:** Todo reordered. New order persisted.

## TC-28.08: Todo summary stats
- **Steps:**
  1. Have a mix of complete and incomplete todos
  2. View summary
- **Expected:** Shows total count, complete count, and incomplete count.

## TC-28.09: Todos scoped to workspace
- **Steps:**
  1. Add todos in workspace A
  2. Switch to workspace B
- **Expected:** Workspace B has its own todo list (empty or different). Todos are workspace-scoped.

## TC-28.10: @todos mention in chat
- **Steps:**
  1. In chat composer, type `@todos`
  2. Select from autocomplete
- **Expected:** Current workspace's todo list inserted into the message context for the agent.
