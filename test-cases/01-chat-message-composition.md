# TC-01: Chat — Message Composition

## TC-01.01: Send a basic text message
- **Precondition:** Active workspace with agent idle
- **Steps:**
  1. Click on the chat composer textarea
  2. Type "Hello, what files are in this project?"
  3. Press **Enter**
- **Expected:** Message appears as a blue user bubble right-aligned. Agent begins streaming a response. Status indicator shows "Running".

## TC-01.02: Multi-line message with Shift+Enter
- **Steps:**
  1. Click composer
  2. Type "Line one"
  3. Press **Shift+Enter**
  4. Type "Line two"
  5. Press **Enter** to send
- **Expected:** Message sends with both lines visible in the user bubble. Shift+Enter does NOT send the message.

## TC-01.03: Send message while agent is running (follow-up)
- **Precondition:** Agent is currently streaming a response
- **Steps:**
  1. Type a follow-up message in the composer
  2. Press **Enter**
- **Expected:** Follow-up message is sent via stdin to the running agent. Message appears in chat. Agent incorporates follow-up.

## TC-01.04: Empty message rejection
- **Steps:**
  1. Leave composer empty
  2. Press **Enter**
- **Expected:** Nothing happens. No empty message is sent or displayed.

## TC-01.05: Whitespace-only message rejection
- **Steps:**
  1. Type only spaces/tabs in composer
  2. Press **Enter**
- **Expected:** Message is not sent. Composer remains focused.

## TC-01.06: Attach file via drag-and-drop
- **Steps:**
  1. Drag an image file (e.g., screenshot.png) from Finder into the composer area
  2. Drop it
- **Expected:** File appears as an attachment badge below the composer. Image files show inline preview.

## TC-01.07: Attach file via file picker (Cmd+U)
- **Steps:**
  1. Focus the composer
  2. Press **Cmd+U**
  3. Select a file from the dialog
- **Expected:** Native file picker opens. Selected file appears as attachment badge. Send message includes the attachment.

## TC-01.08: Multiple file attachments
- **Steps:**
  1. Attach file A via drag-and-drop
  2. Attach file B via Cmd+U
  3. Type a message and send
- **Expected:** Both files appear as badges. Sent message displays both attachments.

## TC-01.09: @mention file autocomplete
- **Precondition:** Workspace has files (e.g., `src/App.tsx`)
- **Steps:**
  1. Type a space then `@App`
  2. Wait for autocomplete dropdown
  3. Use arrow keys to navigate
  4. Press **Enter** or **Tab** to select
- **Expected:** Dropdown appears showing matching files. Selected file is inserted into the message text.

## TC-01.10: @mention requires preceding space or newline
- **Steps:**
  1. Type `hello@world` (no space before @)
- **Expected:** No autocomplete dropdown appears. The @ is treated as literal text.

## TC-01.11: @todos special mention
- **Steps:**
  1. Type a space then `@todos`
  2. Select from autocomplete
- **Expected:** Task list is inserted into the message context.

## TC-01.12: Dismiss autocomplete with Escape
- **Steps:**
  1. Type `@` to trigger autocomplete
  2. Press **Escape**
- **Expected:** Autocomplete dropdown closes. Text remains in composer.

## TC-01.13: Slash command autocomplete
- **Steps:**
  1. At the beginning of a line, type `/`
  2. Wait for autocomplete dropdown
  3. Type a partial command name (e.g., `/cle`)
  4. Select a command
- **Expected:** Dropdown shows matching slash commands with descriptions. Selected command replaces the typed text.

## TC-01.14: Slash command requires line start
- **Steps:**
  1. Type "hello /clear"
- **Expected:** No slash command autocomplete appears mid-line.

## TC-01.15: Model selection dropdown (Alt+P)
- **Steps:**
  1. Focus composer
  2. Press **Alt+P**
  3. Select "Sonnet" from dropdown
  4. Send a message
- **Expected:** Dropdown shows available models for current agent type. Selected model is used for this message.

## TC-01.16: Model selection resets on agent type change
- **Precondition:** Model override set to "Sonnet"
- **Steps:**
  1. Go to Settings > Provider
  2. Change agent type from Claude Code to Codex CLI
  3. Return to chat
- **Expected:** Model selection resets to default for the new agent type.

## TC-01.17: Voice input toggle (Alt+V)
- **Precondition:** Browser supports Web Speech API, microphone allowed
- **Steps:**
  1. Focus composer
  2. Press **Alt+V**
  3. Speak "Hello world"
  4. Press **Alt+V** again to stop
- **Expected:** Voice indicator appears while listening. Interim transcriptions display in real-time. Final transcript appended to composer text.

## TC-01.18: Voice input — microphone denied
- **Precondition:** Microphone permission denied in system settings
- **Steps:**
  1. Press **Alt+V**
- **Expected:** Error message indicates microphone access denied. No crash or hang.

## TC-01.19: Prompt library (Alt+L)
- **Precondition:** At least one saved prompt exists
- **Steps:**
  1. Press **Alt+L**
  2. Browse prompts
  3. Select one
- **Expected:** Prompt library dialog opens. Selected prompt text is inserted into the composer.

## TC-01.20: Thinking mode toggle (Alt+T)
- **Steps:**
  1. Press **Alt+T** to enable thinking
  2. Send a message
  3. Observe response
  4. Press **Alt+T** to disable
- **Expected:** Visual indicator shows thinking mode on/off. When enabled, agent response may include thinking/reasoning blocks.

## TC-01.21: Plan mode toggle (Shift+Tab)
- **Steps:**
  1. Press **Shift+Tab** to enable plan mode
  2. Send a message asking for implementation
  3. Observe plan approval UI
- **Expected:** Agent responds with a plan card (success-bordered). Plan approval bar appears with Copy Plan / Request Changes / Approve buttons.

## TC-01.22: Context window usage warning
- **Precondition:** Long conversation nearing context limit (90%+)
- **Steps:**
  1. Continue sending messages until context warning appears
- **Expected:** Warning bar appears with context usage indicator and "Compact" button. Clicking "Compact" reduces context usage.

## TC-01.23: Session stats display
- **Steps:**
  1. Send several messages in a conversation
  2. Observe the session stats area
- **Expected:** Shows total cost ($X.XX), input/output token counts, cache tokens, and number of turns. Updates after each response.

## TC-01.24: Textarea auto-resize
- **Steps:**
  1. Type a single line in composer — note height
  2. Add multiple lines (5+) with Shift+Enter
- **Expected:** Textarea grows as content increases, up to max 200px height. Scrollbar appears when content exceeds max height.
