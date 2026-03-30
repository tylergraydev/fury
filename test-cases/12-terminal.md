# TC-12: Terminal

## TC-12.01: Create workspace terminal
- **Steps:**
  1. Click the Terminal tab in the right sidebar bottom section
  2. Terminal should auto-create or click "Create Terminal"
- **Expected:** Terminal opens with system shell (bash/zsh/fish). Working directory is the workspace worktree path. 80x24 default size.

## TC-12.02: Create repository terminal
- **Steps:**
  1. Switch to repository context
  2. Open Terminal tab
- **Expected:** Terminal opens with working directory set to repository root.

## TC-12.03: Terminal I/O — command execution
- **Steps:**
  1. Type `echo "hello world"` and press Enter
- **Expected:** Command executes. Output "hello world" displayed. Prompt returns.

## TC-12.04: Terminal I/O — interactive command
- **Steps:**
  1. Run an interactive command (e.g., `top` or `vim`)
  2. Interact with it (press keys)
  3. Exit the interactive program
- **Expected:** Full interactive PTY support. Keystrokes sent to process. Output renders correctly. Exit returns to shell.

## TC-12.05: Terminal — ANSI colors
- **Steps:**
  1. Run a command that produces colored output (e.g., `ls --color`, `git diff`)
- **Expected:** ANSI colors render correctly in the terminal with themed color palette.

## TC-12.06: Terminal — auto-resize
- **Steps:**
  1. Resize the right sidebar panel (drag the divider)
- **Expected:** Terminal re-fits to new size. Columns and rows update. No text corruption.

## TC-12.07: Terminal — clickable URLs
- **Steps:**
  1. Run `echo "https://example.com"` in terminal
  2. Click on the URL
- **Expected:** URL is visually distinct (underlined/colored). Clicking opens in system browser.

## TC-12.08: Terminal — copy/paste
- **Steps:**
  1. Select text in terminal
  2. Copy (Cmd+C)
  3. Paste (Cmd+V) into terminal
- **Expected:** Text selection works. Copy puts text in clipboard. Paste sends text to terminal.

## TC-12.09: Terminal — scrollback buffer
- **Steps:**
  1. Run a command that produces many lines of output
  2. Scroll up in the terminal
- **Expected:** Scrollback buffer preserves previous output. Can scroll up to view history.

## TC-12.10: Terminal — cursor blinking
- **Steps:**
  1. Focus the terminal
  2. Observe cursor
- **Expected:** Cursor blinks at the prompt. Monospace font rendering.

## TC-12.11: Terminal — timeout and retry
- **Steps:**
  1. If terminal creation fails (simulated), observe behavior
- **Expected:** After 10s timeout, error message shown. Retry mechanism available.

## TC-12.12: Terminal — Focus Terminal shortcut (Cmd+J)
- **Steps:**
  1. Focus is on the editor or chat
  2. Press **Cmd+J**
- **Expected:** Focus moves to the terminal. Ready for keyboard input.

## TC-12.13: Terminal — close
- **Steps:**
  1. Close the terminal session
- **Expected:** Terminal session ends. PTY process cleaned up. Tab available to create new terminal.

## TC-12.14: Terminal in dev container
- **Precondition:** Dev container running for workspace
- **Steps:**
  1. Open terminal for containerized workspace
- **Expected:** Terminal session runs inside the container. `hostname` or `whoami` confirms container context.

## TC-12.15: Terminal — themed colors
- **Steps:**
  1. Switch app theme
  2. Observe terminal colors
- **Expected:** Terminal colors update to match the active theme (background, foreground, ANSI palette).
