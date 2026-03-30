# TC-02: Chat — Message Display & Rendering

## TC-02.01: Markdown text formatting
- **Steps:**
  1. Send a message that causes agent to respond with bold, italic, strikethrough, inline code
- **Expected:** All markdown formatting renders correctly: **bold**, *italic*, ~~strikethrough~~, `inline code`.

## TC-02.02: Headers rendering
- **Steps:**
  1. Trigger agent response containing h1, h2, h3 headers
- **Expected:** Headers render with appropriate size hierarchy and styling.

## TC-02.03: Lists rendering (ordered and unordered)
- **Steps:**
  1. Trigger response with bullet lists and numbered lists, including nested items
- **Expected:** Lists render with proper indentation and nesting. Ordered lists show numbers, unordered show bullets.

## TC-02.04: Tables rendering
- **Steps:**
  1. Trigger response containing a markdown table
- **Expected:** Table renders with proper column alignment, headers, and borders.

## TC-02.05: Blockquotes rendering
- **Steps:**
  1. Trigger response containing blockquotes
- **Expected:** Blockquote renders with left border indicator and proper indentation.

## TC-02.06: Links open in new tab
- **Steps:**
  1. Trigger response with a hyperlink (e.g., `[link](https://example.com)`)
  2. Click the link
- **Expected:** Link opens in system default browser (not in-app). Link has distinct styling.

## TC-02.07: Code block with syntax highlighting
- **Steps:**
  1. Ask agent to write a TypeScript function
- **Expected:** Code block renders with TypeScript syntax highlighting, proper indentation, and monospace font.

## TC-02.08: Code block — Copy button
- **Steps:**
  1. Hover over a code block in agent response
  2. Click the Copy button in the toolbar
- **Expected:** Toolbar appears on hover. Clicking Copy shows checkmark confirmation. Code is in clipboard (paste to verify).

## TC-02.09: Code block — Apply button
- **Precondition:** Agent response includes a code block with file path (e.g., ```typescript:src/app.ts)
- **Steps:**
  1. Hover over the code block
  2. Click "Apply"
- **Expected:** Code is written to the specified file in the workspace. File viewer opens to that file. Status shows applied/success feedback.

## TC-02.10: Code block — Apply error state
- **Steps:**
  1. Hover over a code block with no file path metadata
  2. Click "Apply"
- **Expected:** Error feedback shown (file path not detected or apply failed). No crash.

## TC-02.11: Inline images
- **Steps:**
  1. Send a message with an image attachment
  2. Observe how the image appears in chat
- **Expected:** Image renders inline with max height 256px and max width 100%.

## TC-02.12: Image lightbox
- **Steps:**
  1. Click on an inline image in chat
- **Expected:** Full-size image opens in a lightbox modal overlay. Click outside or press Escape to close.

## TC-02.13: Tool call visualization — collapsed
- **Steps:**
  1. Send a message that triggers tool calls (e.g., "read the package.json file")
  2. Observe tool call blocks
- **Expected:** Tool calls appear as collapsible blocks with summary text, tool name, and color-coded icon.

## TC-02.14: Tool call visualization — expanded
- **Steps:**
  1. Click to expand a tool call block
- **Expected:** Shows tool input JSON and tool result content. File diffs show syntax highlighting within tool results.

## TC-02.15: Turn collapsing
- **Precondition:** Conversation with 3+ turns
- **Steps:**
  1. Click the collapse chevron on a previous turn
- **Expected:** Turn collapses to summary: "X tool calls, Y messages". Click again to expand.

## TC-02.16: Message metadata display
- **Steps:**
  1. Observe the metadata row below an assistant message
- **Expected:** Shows duration (e.g., "2.3s"), token counts (e.g., "12.5K in / 3.2K out"), cache tokens (if > 0), and cost (e.g., "$0.15"). Separated by dot dividers.

## TC-02.17: User message bubble styling
- **Steps:**
  1. Send a message and observe its appearance
- **Expected:** Blue/accent-colored bubble, right-aligned, max 80% container width. Attachments shown below text.

## TC-02.18: System/error message display
- **Steps:**
  1. Trigger a system error (e.g., invalid API key, rate limit)
- **Expected:** Pink-tinted bubble with error styling. If error content detected, retry button appears.

## TC-02.19: System message — retry button
- **Precondition:** System error message with retry button visible
- **Steps:**
  1. Click the retry button
- **Expected:** Previous message is resent to the agent. New response streams in.

## TC-02.20: Plan message display
- **Steps:**
  1. Enable plan mode and send a message
- **Expected:** Plan response appears in a distinct card with success color border, "Implementation Plan" header, and special formatting.

## TC-02.21: Table of Contents (TOC) for long conversations
- **Precondition:** Conversation with 3+ turns
- **Steps:**
  1. Observe TOC component
  2. Click on a specific turn in TOC
- **Expected:** TOC shows turn list with collapsible summaries and tool call counts. Clicking navigates (scrolls) to that turn.

## TC-02.22: Auto-scroll to newest message
- **Steps:**
  1. Scroll up in a long conversation
  2. Send a new message
- **Expected:** Chat scrolls to bottom to show the new user message and incoming response.

## TC-02.23: Image fallback on load failure
- **Steps:**
  1. Trigger a response that references a broken image URL
- **Expected:** Fallback UI displays instead of broken image icon. No layout shift or crash.

## TC-02.24: Message with display text (slash commands)
- **Steps:**
  1. Use a slash command that has expanded content
- **Expected:** User bubble shows simplified slash command name (display text), not the full expanded content.
