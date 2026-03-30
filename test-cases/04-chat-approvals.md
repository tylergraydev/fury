# TC-04: Chat — Interactive Approvals & Permissions

## TC-04.01: Permission request — Allow
- **Precondition:** Safe mode enabled OR agent requests a non-auto-approved tool
- **Steps:**
  1. Send a message that triggers a tool requiring approval (e.g., file write)
  2. Observe the permission request bar
  3. Click "Allow"
- **Expected:** Semi-transparent warning bar shows tool name. Clicking Allow lets the agent proceed. Bar disappears.

## TC-04.02: Permission request — Deny
- **Steps:**
  1. Trigger a permission request
  2. Click "Deny"
- **Expected:** Agent is notified of denial. Agent may adjust approach or report it cannot proceed.

## TC-04.03: Permission request — Allow Session
- **Steps:**
  1. Trigger a permission request
  2. Click "Allow Session"
- **Expected:** Tool is allowed for current session. Subsequent requests for the same tool auto-approve without prompting.

## TC-04.04: Permission request — Always Allow
- **Steps:**
  1. Trigger a permission request
  2. Click "Always Allow"
- **Expected:** Tool added to permanent allow list. Future sessions also auto-approve. Permission persists in `~/.claude/settings.json`.

## TC-04.05: Permission request — keyboard shortcut (Cmd+Shift+Enter)
- **Steps:**
  1. Trigger a permission request
  2. Press **Cmd+Shift+Enter**
- **Expected:** Default approval action is executed (equivalent to clicking Allow).

## TC-04.06: Plan approval — Approve
- **Precondition:** Plan mode enabled
- **Steps:**
  1. Send a message requesting implementation
  2. Agent responds with an implementation plan
  3. Click "Approve" on the plan card
- **Expected:** Plan approval bar shows with success border. Clicking Approve sends approval to agent. Agent begins implementing.

## TC-04.07: Plan approval — Request Changes
- **Steps:**
  1. Receive a plan from agent
  2. Click "Request Changes"
- **Expected:** Composer is focused. User can type feedback about the plan. Sending the message provides feedback to the agent.

## TC-04.08: Plan approval — Copy Plan
- **Steps:**
  1. Receive a plan
  2. Click "Copy Plan"
- **Expected:** Plan content is copied to system clipboard. Paste elsewhere to verify.

## TC-04.09: Plan approval — Cmd+Shift+Enter shortcut
- **Steps:**
  1. Receive a plan
  2. Press **Cmd+Shift+Enter**
- **Expected:** Plan is approved (same as clicking Approve button).

## TC-04.10: Question request — select predefined option
- **Steps:**
  1. Agent asks a question with predefined options (e.g., "Which file? [A] src/app.ts [B] src/index.ts")
  2. Click one of the option pills
- **Expected:** Question card replaces composer input. Clicking option pill sends that answer. Card disappears and composer returns.

## TC-04.11: Question request — custom text answer
- **Steps:**
  1. Agent asks a question
  2. Type a custom answer in the question card's text input
  3. Press **Enter**
- **Expected:** Custom text is sent as the answer. Question card disappears.

## TC-04.12: Question request — auto-focus
- **Steps:**
  1. Agent asks a question
- **Expected:** The text input field in the question card is automatically focused for immediate typing.

## TC-04.13: Permission request — timeout behavior
- **Steps:**
  1. Trigger a permission request
  2. Do NOT respond — wait for backend timeout
- **Expected:** After timeout, permission is denied by default. Agent handles the timeout gracefully (reports it or retries).

## TC-04.14: Multiple sequential permission requests
- **Steps:**
  1. Send a message that triggers multiple tools requiring approval
  2. Approve each one as it appears
- **Expected:** Each permission request appears one at a time. Approving one reveals the next. All approved tools execute in sequence.

## TC-04.15: Safe mode — all tool calls require approval
- **Precondition:** Experimental > Safe Mode enabled
- **Steps:**
  1. Send a message that triggers file reads, writes, and bash commands
- **Expected:** Every tool call (including reads) shows a permission request. No auto-approval.

## TC-04.16: Safe mode — disabled (auto-approve)
- **Precondition:** Safe Mode disabled, no custom permission rules
- **Steps:**
  1. Send a message that triggers tool calls
- **Expected:** Tools execute automatically without permission prompts.
