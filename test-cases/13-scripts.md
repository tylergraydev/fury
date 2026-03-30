# TC-13: Scripts (Setup / Run / Archive)

## TC-13.01: Setup script — run
- **Precondition:** Repository has a setup script configured (e.g., `npm install`)
- **Steps:**
  1. Open right sidebar > Setup tab
  2. Click "Start"
- **Expected:** Script executes. Output streams in real-time with auto-scroll. "Running" indicator pulses.

## TC-13.02: Setup script — success exit
- **Steps:**
  1. Run a setup script that completes successfully
- **Expected:** Exit code displayed as "0" in green. Running indicator stops.

## TC-13.03: Setup script — failure exit
- **Steps:**
  1. Run a setup script that fails (e.g., `exit 1`)
- **Expected:** Exit code displayed in red (e.g., "1"). Error output visible in log.

## TC-13.04: Setup script — stop
- **Steps:**
  1. Start a long-running setup script
  2. Click "Stop"
- **Expected:** Script process killed. Exit code shown in gray (stopped). Running indicator stops.

## TC-13.05: Setup script — clear output
- **Steps:**
  1. After a script run, click "Clear"
- **Expected:** Output log cleared. Ready for next run.

## TC-13.06: Run script — execution
- **Precondition:** Run script configured (e.g., `npm start`)
- **Steps:**
  1. Open Run tab
  2. Click "Start"
- **Expected:** Script executes with streaming output. Same controls as setup script.

## TC-13.07: Run script — nonconcurrent mode
- **Precondition:** Run script mode set to "nonconcurrent"
- **Steps:**
  1. Start the run script
  2. Send a message to the agent (which triggers run script again)
- **Expected:** Previous run script process is killed before new one starts.

## TC-13.08: Run script — concurrent mode
- **Precondition:** Run script mode set to "concurrent"
- **Steps:**
  1. Start the run script
  2. Send a message triggering another run
- **Expected:** Multiple instances run simultaneously. Both outputs visible.

## TC-13.09: Run script — stderr highlighting
- **Steps:**
  1. Run a script that outputs to stderr
- **Expected:** stderr output is visually distinct (different color/style) from stdout.

## TC-13.10: Archive script
- **Precondition:** Archive script configured (e.g., `npm run cleanup`)
- **Steps:**
  1. Archive a workspace that has an archive script
- **Expected:** Archive script runs before workspace is archived. Script output logged.

## TC-13.11: Repository-level script execution
- **Steps:**
  1. Switch to repository context
  2. Run a repo-level script
- **Expected:** Script runs in repository root directory (not a worktree). Output streams correctly.

## TC-13.12: Run script at agent turn start
- **Steps:**
  1. Configure a run script
  2. Send a message to the agent
- **Expected:** Run script executes at the start of the agent turn before the agent begins processing.

## TC-13.13: Script auto-scroll
- **Steps:**
  1. Run a script with lots of output
- **Expected:** Output log auto-scrolls to show latest output. Scrolling up pauses auto-scroll.
