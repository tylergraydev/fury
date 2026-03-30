# TC-14: Test Runner

## TC-14.01: Auto-detect test framework
- **Precondition:** Repository with a known test framework (e.g., Vitest, Jest)
- **Steps:**
  1. Open Test Runner (**Cmd+Shift+T**)
  2. Observe detected framework
- **Expected:** Framework auto-detected (e.g., "Vitest"). Test command pre-populated.

## TC-14.02: Configure test command
- **Steps:**
  1. Open Test Runner settings
  2. Enter custom test command: `npx vitest run`
  3. Save
- **Expected:** Configuration saved per repository. Used for subsequent test runs.

## TC-14.03: Configure test file command
- **Steps:**
  1. Set test file command: `npx vitest run {{file}}`
  2. Save
- **Expected:** `{{file}}` placeholder replaced with actual file path when running single file tests.

## TC-14.04: Run all tests
- **Steps:**
  1. Click "Run Tests" or press **Cmd+Shift+R**
- **Expected:** All tests execute. Real-time streaming output. Results displayed with pass/fail/skip counts.

## TC-14.05: Run single test file
- **Steps:**
  1. Right-click a test file in file tree
  2. Select "Run Tests" or click the run button on the file
- **Expected:** Only that file's tests run. Results shown for that file.

## TC-14.06: Stop running tests
- **Steps:**
  1. Start a test run
  2. Click "Stop"
- **Expected:** Test process killed. Partial results shown. Status returns to idle.

## TC-14.07: Test watch mode
- **Steps:**
  1. Click "Watch" to start test watch mode
  2. Modify a source or test file
- **Expected:** Tests re-run automatically when files change. Continuous feedback loop.

## TC-14.08: Stop test watch mode
- **Steps:**
  1. While in watch mode, click "Stop Watch"
- **Expected:** Watch mode stops. File changes no longer trigger re-runs.

## TC-14.09: Test results — passed
- **Steps:**
  1. Run tests with passing tests
- **Expected:** Green checkmarks for passed tests. Pass count displayed.

## TC-14.10: Test results — failed
- **Steps:**
  1. Run tests with a deliberately failing test
- **Expected:** Red X for failed tests. Error message and stack trace visible. Fail count displayed.

## TC-14.11: Test results — skipped
- **Steps:**
  1. Run tests with skipped tests (e.g., `it.skip(...)`)
- **Expected:** Gray indicator for skipped tests. Skip count displayed.

## TC-14.12: Test results — filter by status
- **Steps:**
  1. After a test run, click "Failed" filter
- **Expected:** Only failed tests shown. Can toggle between All/Passed/Failed/Skipped.

## TC-14.13: Test suite hierarchy
- **Steps:**
  1. Run tests with nested describe blocks
- **Expected:** Tests displayed in hierarchy (suite > sub-suite > test). Suites expandable/collapsible.

## TC-14.14: Test history
- **Steps:**
  1. Run tests multiple times
  2. View test history
- **Expected:** Previous test runs listed with timestamp, duration, and result summary (pass/fail counts).

## TC-14.15: Coverage report — run
- **Steps:**
  1. Click "Run Coverage" (or configure coverage command)
- **Expected:** Coverage report generated. Shows line, branch, function, and statement coverage percentages.

## TC-14.16: Coverage report — per-file breakdown
- **Steps:**
  1. View coverage report details
- **Expected:** Coverage shown per file with individual percentages. Highlights files with low coverage.

## TC-14.17: Test output — color-coded
- **Steps:**
  1. Observe test output during a run
- **Expected:** Output preserves ANSI colors from test framework. Passed tests green, failed tests red.

## TC-14.18: Test output — error stack traces
- **Steps:**
  1. Run a failing test
  2. View the error details
- **Expected:** Full stack trace shown with file path and line number. Navigable to source code.

## TC-14.19: Configure working directory
- **Steps:**
  1. Set a custom working directory for tests
  2. Run tests
- **Expected:** Tests execute from the specified working directory.

## TC-14.20: Save test runner config per repo
- **Steps:**
  1. Configure test framework, commands, and settings for repo A
  2. Switch to repo B
  3. Configure different settings
  4. Switch back to repo A
- **Expected:** Each repository retains its own test runner configuration independently.
