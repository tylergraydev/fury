# TC-31: Copilot Integration

## TC-31.01: Enable Copilot
- **Steps:**
  1. Go to Settings > Copilot
  2. Toggle "Enable" to on
- **Expected:** Copilot LSP service starts. Connection status shows "Connecting" then "Connected".

## TC-31.02: Sign in with device code
- **Steps:**
  1. Click "Sign In"
  2. Copy the device code displayed
  3. Open the GitHub device login URL in browser
  4. Enter the code and authorize
  5. Return to Fury
- **Expected:** Polling detects authorization (within 5 minutes). Status shows signed-in GitHub user.

## TC-31.03: Inline completions in editor
- **Precondition:** Copilot enabled and signed in
- **Steps:**
  1. Open a TypeScript file
  2. Start typing a function signature
  3. Pause typing
- **Expected:** Ghost text (gray inline suggestion) appears after cursor. Shows predicted completion.

## TC-31.04: Accept completion with Tab
- **Steps:**
  1. Observe an inline completion suggestion
  2. Press **Tab**
- **Expected:** Ghost text accepted and inserted into the document.

## TC-31.05: Dismiss completion
- **Steps:**
  1. Observe an inline completion
  2. Press **Escape** or continue typing differently
- **Expected:** Ghost text disappears. Editor accepts typed input instead.

## TC-31.06: Document sync — file open
- **Steps:**
  1. Open a new file in the editor
- **Expected:** Copilot notified of file open (didOpen event). Completions available for this file.

## TC-31.07: Document sync — file change
- **Steps:**
  1. Type in an open file
- **Expected:** Changes sent to Copilot (debounced at 50ms). Completions update based on new content.

## TC-31.08: Document sync — file close
- **Steps:**
  1. Close a file tab
- **Expected:** Copilot notified of file close (didClose event). Resources freed for that file.

## TC-31.09: Auto-connect on workspace activation
- **Steps:**
  1. Switch to a different workspace
- **Expected:** Copilot maintains connection. Context updates for new workspace files.

## TC-31.10: Disable Copilot
- **Steps:**
  1. Toggle Copilot to "Disabled"
- **Expected:** LSP stopped. No more inline completions appear. No errors in console.

## TC-31.11: Connection error handling
- **Steps:**
  1. Enable Copilot without Node.js installed or with missing package
- **Expected:** Error status displayed. Clear error message about what's missing. App continues functioning without Copilot.

## TC-31.12: Status indicator persistence
- **Steps:**
  1. Enable and sign in to Copilot
  2. Restart app
- **Expected:** Copilot re-enables and reconnects automatically. Previous auth state preserved.
