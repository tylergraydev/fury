# TC-34: Error Handling & Edge Cases

## TC-34.01: Error boundary — component crash
- **Steps:**
  1. Trigger a component error (if reproducible)
- **Expected:** Error boundary catches the error. Fallback UI displayed (not blank screen). Rest of app continues functioning.

## TC-34.02: Error boundary — reset on context change
- **Steps:**
  1. Trigger error boundary
  2. Switch workspace or navigate away
- **Expected:** Error boundary resets. Component re-renders normally.

## TC-34.03: Toast notification for transient errors
- **Steps:**
  1. Trigger a transient error (e.g., file save failure)
- **Expected:** Toast notification appears at bottom of viewport. Auto-dismisses after timeout. Manual dismiss button available.

## TC-34.04: Error banner — persistent errors
- **Steps:**
  1. Trigger a persistent error (e.g., repository path not found)
- **Expected:** Error banner appears in relevant area. Dismissible with close button. Error message descriptive.

## TC-34.05: API key missing/invalid
- **Steps:**
  1. Remove or corrupt the API key
  2. Send a message
- **Expected:** Clear error message about invalid/missing API key. Chat shows error. No crash.

## TC-34.06: Rate limit handling
- **Steps:**
  1. Send many rapid messages to hit rate limit
- **Expected:** Rate limit error displayed in chat. Retry button available. No crash or hang.

## TC-34.07: Agent process crash
- **Steps:**
  1. Force-kill the agent sidecar process during execution
- **Expected:** Status changes to Error. Error message in chat. Can send new message (restarts agent).

## TC-34.08: Network disconnection during streaming
- **Steps:**
  1. Send a message
  2. Disconnect network during streaming
- **Expected:** Streaming stops gracefully. Partial response preserved. Error message shown. Can retry when reconnected.

## TC-34.09: Git operation failure
- **Steps:**
  1. Trigger a git operation on a corrupted or missing worktree
- **Expected:** Git error message displayed. Operation fails gracefully. No undefined behavior.

## TC-34.10: File read — non-existent file
- **Steps:**
  1. Attempt to open a file that was deleted externally
- **Expected:** Error message: "File not found" or similar. Editor shows empty/error state. No crash.

## TC-34.11: File write — permission denied
- **Steps:**
  1. Attempt to save to a read-only location
- **Expected:** Error message about permission denied. File not saved. User informed.

## TC-34.12: Large file handling
- **Steps:**
  1. Open a very large file (10MB+)
- **Expected:** File opens (may take a moment). Editor remains responsive. No crash or freeze.

## TC-34.13: Concurrent workspace operations
- **Steps:**
  1. Rapidly switch between workspaces while operations are in-flight
- **Expected:** Operations complete or cancel gracefully. No race conditions or UI corruption.

## TC-34.14: Database corruption recovery
- **Steps:**
  1. Corrupt the SQLite database (simulated)
  2. Restart app
- **Expected:** App handles gracefully — either repairs DB, creates new one, or shows clear error with recovery instructions.

## TC-34.15: Path traversal prevention
- **Steps:**
  1. Attempt to read/write a file using path traversal (e.g., `../../etc/passwd`)
- **Expected:** Path validation blocks the operation. PathTraversal error returned. No file access outside boundaries.
