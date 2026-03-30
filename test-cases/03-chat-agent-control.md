# TC-03: Chat — Agent Control & Lifecycle

## TC-03.01: Agent status — Idle
- **Precondition:** No message in progress
- **Steps:**
  1. Observe agent status indicator in top bar
- **Expected:** Gray dot with tooltip "Agent idle".

## TC-03.02: Agent status — Running
- **Steps:**
  1. Send a message
  2. Observe status indicator while agent is processing
- **Expected:** Green dot with pulse animation. Tooltip shows "Agent running".

## TC-03.03: Agent status — Error
- **Steps:**
  1. Trigger an agent error (e.g., kill the sidecar process, use invalid API key)
- **Expected:** Red dot. Tooltip shows "Agent error". Error message appears in chat.

## TC-03.04: Stop generation
- **Steps:**
  1. Send a message that triggers a long response
  2. Click the Stop button while agent is running
- **Expected:** Button changes to "Stopping" state. Agent halts. Status returns to Idle. Partial response remains in chat.

## TC-03.05: Stop generation — Codex CLI
- **Precondition:** Agent type set to Codex CLI
- **Steps:**
  1. Send a message
  2. Click Stop while processing
- **Expected:** Process group is killed. Status returns to Idle.

## TC-03.06: Clear session (New Session)
- **Steps:**
  1. Have an existing conversation with history
  2. Trigger "New Session" from command palette or action
- **Expected:** Session ID is cleared. Next message starts a fresh conversation without prior context.

## TC-03.07: Session persistence across agent restarts
- **Steps:**
  1. Send a message and get a response
  2. Stop the agent
  3. Send another message
- **Expected:** Agent resumes with same session ID. Conversation context is maintained.

## TC-03.08: Switch between Claude Code and Codex CLI
- **Steps:**
  1. Start with Claude Code, send a message
  2. Go to Settings > Provider, switch to Codex CLI
  3. Return to chat, send a message
- **Expected:** Agent type changes. Codex CLI processes messages in one-shot mode. No session carryover between agent types.

## TC-03.09: Conductor phase tracking
- **Steps:**
  1. Send a complex message that triggers multiple tool calls
  2. Observe the conductor phase indicator
- **Expected:** Phase updates based on tool calls: idle → researching (Think tool) → questioning (AskQuestion) → planning (ExitPlanMode).

## TC-03.10: Agent recovery after HMR (dev mode)
- **Precondition:** Running in dev mode with HMR
- **Steps:**
  1. Have agent running with a pending permission request
  2. Trigger HMR (edit a frontend file)
- **Expected:** Permission request is recovered from backend. UI re-renders with correct state.

## TC-03.11: Orphaned process cleanup
- **Steps:**
  1. Force-quit the app while agent is running
  2. Relaunch the app
  3. Open the same workspace
- **Expected:** Orphaned agent process is detected and cleaned up. Stale "Running" status is reset to "Idle".

## TC-03.12: Performance mode — persistent processes
- **Precondition:** Experimental > Performance Mode enabled
- **Steps:**
  1. Send a message, wait for response
  2. Send another message
- **Expected:** Second message has faster startup (no process spawn delay). Process stays alive between turns.

## TC-03.13: Performance mode — disabled (Low RAM)
- **Precondition:** Performance Mode disabled
- **Steps:**
  1. Send message A, wait for response
  2. Send message B
- **Expected:** Fresh process spawned for each turn. Slightly slower startup but lower memory usage.
