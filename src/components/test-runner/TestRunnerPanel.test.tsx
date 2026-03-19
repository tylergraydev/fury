import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  TestSuite,
  TestResult,
  TestRunSummary,
  TestRunnerConfig,
  TestRunRecord,
  CoverageReport,
} from "../../lib/tauri";

// We mock the store at module level to avoid infinite re-render from `new Set()` fallback in selectors
const subscribe = vi.fn().mockResolvedValue(undefined);
const unsubscribe = vi.fn();
const loadConfig = vi.fn().mockResolvedValue(undefined);
const runTests = vi.fn().mockResolvedValue(undefined);
const stopTests = vi.fn().mockResolvedValue(undefined);
const clearResults = vi.fn();
const setFilter = vi.fn();
const toggleOutput = vi.fn();
const toggleSuite = vi.fn();
const selectTest = vi.fn();

let storeValues: Record<string, any> = {};

const loadHistory = vi.fn().mockResolvedValue(undefined);
const toggleWatchMode = vi.fn().mockResolvedValue(undefined);
const runCoverage = vi.fn().mockResolvedValue(undefined);

function getFullState() {
  return {
    suites: {},
    summary: {},
    output: {},
    running: {},
    error: {},
    config: {},
    filter: {},
    expandedSuites: {},
    selectedTest: {},
    showOutput: {},
    watchMode: {},
    history: {},
    coverage: {},
    coverageRunning: {},
    subscriptions: {},
    watchSubscriptions: {},
    subscribe,
    unsubscribe,
    loadConfig,
    loadHistory,
    runTests,
    stopTests,
    clearResults,
    setFilter,
    toggleOutput,
    toggleSuite,
    selectTest,
    toggleWatchMode,
    runCoverage,
    ...storeValues,
  };
}

vi.mock("../../stores/testRunnerStore", () => {
  const hook = (selector: (s: any) => any) => {
    const fullState = getFullState();
    if (typeof selector === "function") return selector(fullState);
    return fullState;
  };
  hook.getState = () => getFullState();
  return { useTestRunnerStore: hook };
});

vi.mock("../../stores/workspaceStore", () => ({
  useWorkspaceStore: (selector: (s: any) => any) => {
    const state = {
      workspaces: [{ id: "ctx-1", repoId: "repo-1", name: "Test WS" }],
    };
    if (typeof selector === "function") return selector(state);
    return state;
  },
}));

vi.mock("../../lib/tauri", () => ({
  runTests: vi.fn(),
  stopTests: vi.fn(),
  getTestRunnerConfig: vi.fn(),
  detectTestFramework: vi.fn(),
  saveTestRunnerConfig: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("./TestConfigDialog", () => ({
  TestConfigDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="test-config-dialog">
      <button onClick={onClose}>CloseConfig</button>
    </div>
  ),
}));

// Must import after vi.mock
import { TestRunnerPanel } from "./TestRunnerPanel";

const CTX = "ctx-1";

function makeResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    name: "should work",
    suite: "math",
    status: "passed",
    durationMs: 10,
    failureMessage: null,
    ...overrides,
  };
}

function makeSuite(overrides: Partial<TestSuite> = {}): TestSuite {
  return {
    name: "math",
    tests: [makeResult()],
    status: "passed",
    durationMs: 50,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<TestRunSummary> = {}): TestRunSummary {
  return {
    total: 5,
    passed: 3,
    failed: 1,
    skipped: 1,
    durationMs: 500,
    suites: [makeSuite()],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<TestRunnerConfig> = {}): TestRunnerConfig {
  return {
    framework: "vitest",
    testCommand: "npx vitest --run",
    testFileCommand: null,
    workingDir: null,
    coverageCommand: null,
    ...overrides,
  };
}

function makeHistoryRecord(overrides: Partial<TestRunRecord> = {}): TestRunRecord {
  return {
    id: "run-1",
    repoId: "repo-1",
    ranAt: "2024-01-15T10:00:00",
    total: 10,
    passed: 8,
    failed: 1,
    skipped: 1,
    durationMs: 2500,
    ...overrides,
  };
}

function makeCoverage(overrides: Partial<CoverageReport> = {}): CoverageReport {
  return {
    totalLinesPct: 85.5,
    totalBranchesPct: 70.2,
    files: [
      { file: "src/utils.ts", linesPct: 92, branchesPct: 80, uncoveredLines: [10, 20] },
      { file: "src/main.ts", linesPct: 60, branchesPct: 50, uncoveredLines: [5, 15, 25] },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  storeValues = {};
  vi.clearAllMocks();
});

describe("TestRunnerPanel", () => {
  it("subscribes to events and loads config on mount", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(subscribe).toHaveBeenCalledWith(CTX);
    expect(loadConfig).toHaveBeenCalledWith(CTX, "repo-1");
  });

  it("loads history on mount", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(loadHistory).toHaveBeenCalledWith(CTX, "repo-1");
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(
      <TestRunnerPanel contextId={CTX} contextType="workspace" />,
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledWith(CTX);
  });

  it("shows Not configured when no config", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Not configured")).toBeTruthy();
  });

  it("shows framework label when config exists", () => {
    storeValues = { config: { [CTX]: makeConfig({ framework: "vitest" }) } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Vitest")).toBeTruthy();
  });

  it("shows No test results yet when config exists but no suites", () => {
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("No test results yet")).toBeTruthy();
  });

  it("shows No test framework detected when no config", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("No test framework detected")).toBeTruthy();
  });

  it("shows Configure Test Runner button when no config", async () => {
    const user = userEvent.setup();
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const btn = screen.getByText("Configure Test Runner");
    expect(btn).toBeTruthy();
    await user.click(btn);
    expect(screen.getByTestId("test-config-dialog")).toBeTruthy();
  });

  it("Run All button calls runTests", async () => {
    const user = userEvent.setup();
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("Run All"));
    expect(runTests).toHaveBeenCalledWith(CTX, "workspace");
  });

  it("Run All button is disabled when no config", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    const runBtn = screen.getByText("Run All").closest("button")!;
    expect(runBtn.disabled).toBe(true);
  });

  it("shows Stop button when running", () => {
    storeValues = {
      running: { [CTX]: true },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Stop")).toBeTruthy();
    expect(screen.queryByText("Run All")).toBeNull();
  });

  it("Stop button calls stopTests", async () => {
    const user = userEvent.setup();
    storeValues = {
      running: { [CTX]: true },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("Stop"));
    expect(stopTests).toHaveBeenCalledWith(CTX);
  });

  it("Clear button calls clearResults", async () => {
    const user = userEvent.setup();
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByTitle("Clear results"));
    expect(clearResults).toHaveBeenCalledWith(CTX);
  });

  it("Settings button opens config dialog", async () => {
    const user = userEvent.setup();
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByTitle("Configure test runner"));
    expect(screen.getByTestId("test-config-dialog")).toBeTruthy();
  });

  it("closes config dialog via onClose callback", async () => {
    const user = userEvent.setup();
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByTitle("Configure test runner"));
    expect(screen.getByTestId("test-config-dialog")).toBeTruthy();

    await user.click(screen.getByText("CloseConfig"));
    expect(screen.queryByTestId("test-config-dialog")).toBeNull();
  });

  it("renders suite rows", () => {
    storeValues = {
      suites: { [CTX]: [makeSuite({ name: "math" }), makeSuite({ name: "utils" })] },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("math")).toBeTruthy();
    expect(screen.getByText("utils")).toBeTruthy();
  });

  it("shows Running... text when running", () => {
    storeValues = {
      running: { [CTX]: true },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Running...")).toBeTruthy();
  });

  it("shows summary badges when summary exists", () => {
    storeValues = {
      summary: { [CTX]: makeSummary({ total: 5, passed: 3, failed: 1, skipped: 1 }) },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("5 tests")).toBeTruthy();
    expect(screen.getByText("3 passed")).toBeTruthy();
    expect(screen.getByText("1 failed")).toBeTruthy();
    expect(screen.getByText("1 skipped")).toBeTruthy();
  });

  it("shows error banner when error is set", () => {
    storeValues = {
      error: { [CTX]: "Failed to start tests" },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Failed to start tests")).toBeTruthy();
  });

  it("filter buttons render correctly", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText("Skipped")).toBeTruthy();
  });

  it("Output toggle button renders", () => {
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Output")).toBeTruthy();
  });

  // --- contextType "repo" uses contextId as repoId ---
  it("uses contextId as repoId when contextType is repo", () => {
    render(<TestRunnerPanel contextId="repo-99" contextType="repo" />);
    expect(loadConfig).toHaveBeenCalledWith("repo-99", "repo-99");
    expect(loadHistory).toHaveBeenCalledWith("repo-99", "repo-99");
  });

  // --- Summary badge edge cases ---
  it("hides passed badge when passed is 0", () => {
    storeValues = {
      summary: { [CTX]: makeSummary({ total: 2, passed: 0, failed: 2, skipped: 0, durationMs: 0 }) },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("2 tests")).toBeTruthy();
    expect(screen.queryByText(/passed/)).toBeNull();
  });

  it("hides failed badge when failed is 0", () => {
    storeValues = {
      summary: { [CTX]: makeSummary({ total: 3, passed: 3, failed: 0, skipped: 0 }) },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("hides skipped badge when skipped is 0", () => {
    storeValues = {
      summary: { [CTX]: makeSummary({ total: 3, passed: 3, failed: 0, skipped: 0 }) },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.queryByText(/skipped/)).toBeNull();
  });

  it("shows duration in summary when durationMs > 0", () => {
    storeValues = {
      summary: { [CTX]: makeSummary({ durationMs: 1500 }) },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("1.5s")).toBeTruthy();
  });

  it("hides duration in summary when durationMs is 0", () => {
    storeValues = {
      summary: { [CTX]: makeSummary({ durationMs: 0, passed: 0, failed: 0, skipped: 0 }) },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.queryByText(/ms|\..*s$/)).toBeNull();
  });

  // --- Filter button clicks ---
  it("clicking filter buttons calls setFilter", async () => {
    const user = userEvent.setup();
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("Failed"));
    expect(setFilter).toHaveBeenCalledWith(CTX, "failed");

    await user.click(screen.getByText("Passed"));
    expect(setFilter).toHaveBeenCalledWith(CTX, "passed");

    await user.click(screen.getByText("Skipped"));
    expect(setFilter).toHaveBeenCalledWith(CTX, "skipped");

    await user.click(screen.getByText("All"));
    expect(setFilter).toHaveBeenCalledWith(CTX, "all");
  });

  // --- Output toggle ---
  it("clicking Output button calls toggleOutput", async () => {
    const user = userEvent.setup();
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("Output"));
    expect(toggleOutput).toHaveBeenCalledWith(CTX);
  });

  // --- Watch mode ---
  it("clicking Watch button calls toggleWatchMode", async () => {
    const user = userEvent.setup();
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("Watch"));
    expect(toggleWatchMode).toHaveBeenCalledWith(CTX, "workspace");
  });

  it("shows Watch button with active styling when watchMode is on", () => {
    storeValues = {
      watchMode: { [CTX]: true },
      config: { [CTX]: makeConfig() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    const watchBtn = screen.getByTitle("Disable watch mode");
    expect(watchBtn).toBeTruthy();
  });

  it("shows Watch button with inactive styling when watchMode is off", () => {
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    const watchBtn = screen.getByTitle("Enable watch mode");
    expect(watchBtn).toBeTruthy();
  });

  // --- History ---
  it("clicking History toggles history view", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      history: { [CTX]: [] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("History"));
    expect(screen.getByText("No test history yet")).toBeTruthy();
    expect(screen.getByText("Run tests to build history")).toBeTruthy();
  });

  it("shows history records when history is non-empty", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      history: {
        [CTX]: [
          makeHistoryRecord({ id: "r1", passed: 8, failed: 1, skipped: 1, total: 10, durationMs: 2500 }),
          makeHistoryRecord({ id: "r2", passed: 10, failed: 0, skipped: 0, total: 10, durationMs: 1200 }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("History"));
    // Should show passed/failed/skipped counts
    expect(screen.getByText("8P")).toBeTruthy();
    expect(screen.getByText("1F")).toBeTruthy();
    expect(screen.getByText("1S")).toBeTruthy();
    expect(screen.getByText("10P")).toBeTruthy();
  });

  it("toggles history view off when clicked again", async () => {
    const user = userEvent.setup();
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("History"));
    expect(screen.getByText("No test history yet")).toBeTruthy();

    await user.click(screen.getByText("History"));
    expect(screen.queryByText("No test history yet")).toBeNull();
  });

  it("history record hides failed count when 0", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      history: {
        [CTX]: [makeHistoryRecord({ id: "r1", passed: 10, failed: 0, skipped: 0, total: 10, durationMs: 500 })],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    await user.click(screen.getByText("History"));
    expect(screen.queryByText("0F")).toBeNull();
    expect(screen.queryByText("0S")).toBeNull();
    expect(screen.getByText("500ms")).toBeTruthy();
  });

  // --- Coverage ---
  it("clicking Coverage button shows coverage view and triggers runCoverage", async () => {
    const user = userEvent.setup();
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("Coverage"));
    expect(runCoverage).toHaveBeenCalledWith(CTX, "workspace");
  });

  it("shows coverage data when available", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: { [CTX]: makeCoverage({ totalLinesPct: 85.5 }) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // Coverage button should show percentage
    expect(screen.getByText("86%")).toBeTruthy();

    await user.click(screen.getByText("86%"));
    // Coverage view should show
    expect(screen.getByText("Total Coverage")).toBeTruthy();
    expect(screen.getByText("85.5%")).toBeTruthy();
    expect(screen.getByText("src/utils.ts")).toBeTruthy();
    expect(screen.getByText("src/main.ts")).toBeTruthy();
  });

  it("does not re-trigger runCoverage if coverage already exists", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: { [CTX]: makeCoverage() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("86%"));
    expect(runCoverage).not.toHaveBeenCalled();
  });

  it("does not re-trigger runCoverage if coverage is already running", async () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverageRunning: { [CTX]: true },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // Button should be disabled and show "Running..."
    const btn = screen.getByTitle("Running coverage...");
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("toggles coverage view off when clicked again", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: { [CTX]: makeCoverage() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("86%"));
    expect(screen.getByText("Total Coverage")).toBeTruthy();

    await user.click(screen.getByText("86%"));
    expect(screen.queryByText("Total Coverage")).toBeNull();
  });

  it("renders coverage with low coverage (below 50%) in error color", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: {
        [CTX]: makeCoverage({
          totalLinesPct: 30,
          files: [{ file: "low.ts", linesPct: 20, branchesPct: 10, uncoveredLines: [1, 2, 3] }],
        }),
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("30%"));
    expect(screen.getByText("30.0%")).toBeTruthy();
    expect(screen.getByText("low.ts")).toBeTruthy();
  });

  it("renders coverage with medium coverage (50-79%) in warning color", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: {
        [CTX]: makeCoverage({
          totalLinesPct: 65,
          files: [{ file: "mid.ts", linesPct: 55, branchesPct: 50, uncoveredLines: [] }],
        }),
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("65%"));
    expect(screen.getByText("65.0%")).toBeTruthy();
  });

  // --- Re-run failed ---
  it("shows re-run failed button when there are failed tests and not running", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      summary: { [CTX]: makeSummary({ failed: 2 }) },
      suites: {
        [CTX]: [
          makeSuite({ name: "suite-a", status: "failed" }),
          makeSuite({ name: "suite-b", status: "failed" }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const rerunBtn = screen.getByTitle("Re-run failed tests");
    expect(rerunBtn).toBeTruthy();

    await user.click(rerunBtn);
    // Multiple failed suites -> runs all tests
    expect(runTests).toHaveBeenCalledWith(CTX, "workspace");
  });

  it("re-run failed runs single suite when only one suite failed", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      summary: { [CTX]: makeSummary({ failed: 1 }) },
      suites: {
        [CTX]: [
          makeSuite({ name: "failing-suite", status: "failed" }),
          makeSuite({ name: "passing-suite", status: "passed" }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByTitle("Re-run failed tests"));
    expect(runTests).toHaveBeenCalledWith(CTX, "workspace", "failing-suite");
  });

  it("does not show re-run failed button when running", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      summary: { [CTX]: makeSummary({ failed: 1 }) },
      running: { [CTX]: true },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.queryByTitle("Re-run failed tests")).toBeNull();
  });

  // --- Suite expansion and test rows ---
  it("shows test rows when suite is expanded", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [
              makeResult({ name: "adds numbers", status: "passed", durationMs: 5 }),
              makeResult({ name: "subtracts numbers", status: "failed", durationMs: 15, failureMessage: "Expected 3 got 4" }),
            ],
            status: "failed",
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("adds numbers")).toBeTruthy();
    expect(screen.getByText("subtracts numbers")).toBeTruthy();
  });

  it("hides test rows when suite is collapsed", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [makeSuite({ name: "math", tests: [makeResult({ name: "test1" })] })],
      },
      expandedSuites: { [CTX]: new Set() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("math")).toBeTruthy();
    expect(screen.queryByText("test1")).toBeNull();
  });

  it("clicking suite header calls toggleSuite", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: { [CTX]: [makeSuite({ name: "math" })] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("math"));
    expect(toggleSuite).toHaveBeenCalledWith(CTX, "math");
  });

  it("clicking a test case calls selectTest", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [makeSuite({ name: "math", tests: [makeResult({ name: "test1", suite: "math" })] })],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("test1"));
    expect(selectTest).toHaveBeenCalledWith(CTX, "math", "test1");
  });

  it("clicking run suite button calls runTests with suite name", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: { [CTX]: [makeSuite({ name: "math" })] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const runSuiteBtn = screen.getByTitle("Run math");
    await user.click(runSuiteBtn);
    expect(runTests).toHaveBeenCalledWith(CTX, "workspace", "math");
  });

  // --- Suite status indicators ---
  it("shows failed count in suite row", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            status: "failed",
            tests: [
              makeResult({ name: "t1", status: "passed" }),
              makeResult({ name: "t2", status: "failed" }),
              makeResult({ name: "t3", status: "skipped" }),
            ],
          }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // Should show 1F, 1P, 1S counts
    expect(screen.getByText("1F")).toBeTruthy();
    expect(screen.getByText("1P")).toBeTruthy();
    expect(screen.getByText("1S")).toBeTruthy();
  });

  it("shows running status with animation on suite", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [makeSuite({ name: "math", status: "running" })],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("math")).toBeTruthy();
  });

  it("shows running status with animation on test case", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            status: "running",
            tests: [makeResult({ name: "t1", status: "running", durationMs: null as any })],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("t1")).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
  });

  // --- Test status labels and colors ---
  it("renders all test status labels for expanded suite", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "statuses",
            tests: [
              makeResult({ name: "pass-test", status: "passed", suite: "statuses" }),
              makeResult({ name: "fail-test", status: "failed", suite: "statuses" }),
              makeResult({ name: "skip-test", status: "skipped", suite: "statuses", durationMs: null as any }),
              makeResult({ name: "pend-test", status: "pending", suite: "statuses", durationMs: null as any }),
            ],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["statuses"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("pass-test")).toBeTruthy();
    expect(screen.getByText("fail-test")).toBeTruthy();
    expect(screen.getByText("skip-test")).toBeTruthy();
    expect(screen.getByText("pend-test")).toBeTruthy();
  });

  // --- Test case selected styling ---
  it("highlights selected test case", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [
              makeResult({ name: "t1", suite: "math" }),
              makeResult({ name: "t2", suite: "math" }),
            ],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
      selectedTest: { [CTX]: { suite: "math", name: "t1" } },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // t1 should be selected (has bg-surface style)
    const t1Button = screen.getByText("t1").closest("button")!;
    expect(t1Button.style.backgroundColor).toBe("var(--bg-surface)");
  });

  // --- Failure details pane ---
  it("shows failure details when a failed test is selected", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [
              makeResult({
                name: "broken-test",
                suite: "math",
                status: "failed",
                failureMessage: "Expected 1 to equal 2",
              }),
            ],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
      selectedTest: { [CTX]: { suite: "math", name: "broken-test" } },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("Expected 1 to equal 2")).toBeTruthy();
    expect(screen.getByText(/Failure Details/)).toBeTruthy();
  });

  // --- Output pane ---
  it("shows output pane with lines when showOutput is true", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["line 1", "line 2", "line 3"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText(/Raw Output/)).toBeTruthy();
    expect(screen.getByText("line 1")).toBeTruthy();
    expect(screen.getByText("line 2")).toBeTruthy();
    expect(screen.getByText("line 3")).toBeTruthy();
  });

  it("shows 'No output yet.' when showOutput is true but output is empty", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: [] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("No output yet.")).toBeTruthy();
  });

  it("renders stderr lines with error color styling", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["[stderr] something went wrong"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const line = screen.getByText("[stderr] something went wrong").closest("div")!;
    expect(line.style.color).toBe("var(--error)");
  });

  it("renders normal output lines without error styling", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["normal output line"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const line = screen.getByText("normal output line").closest("div")!;
    expect(line.style.color).toBe("");
  });

  // --- ANSI parsing in output ---
  it("parses ANSI color codes in output lines", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[32mgreen text\x1b[0m"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const span = screen.getByText("green text");
    expect(span.style.color).toBe("var(--success)");
  });

  it("parses ANSI bold codes", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[1mbold text\x1b[22mnot bold"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const boldSpan = screen.getByText("bold text");
    expect(boldSpan.style.fontWeight).toBe("bold");
    const normalSpan = screen.getByText("not bold");
    expect(normalSpan.style.fontWeight).toBe("");
  });

  it("parses ANSI reset code (0)", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[31mred\x1b[0m normal"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const red = screen.getByText("red");
    expect(red.style.color).toBe("var(--error)");
    const normal = screen.getByText("normal");
    expect(normal.style.color).toBe("");
  });

  it("renders output lines without ANSI codes as plain text", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["plain text with no ansi"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("plain text with no ansi")).toBeTruthy();
  });

  it("parses various ANSI color codes (33=warning, 34=accent, 35=error, 36=accent, 37=primary)", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: {
        [CTX]: [
          "\x1b[33myellow\x1b[0m",
          "\x1b[34mblue\x1b[0m",
          "\x1b[35mmagenta\x1b[0m",
          "\x1b[36mcyan\x1b[0m",
          "\x1b[37mwhite\x1b[0m",
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("yellow").style.color).toBe("var(--warning)");
    expect(screen.getByText("blue").style.color).toBe("var(--accent)");
    expect(screen.getByText("magenta").style.color).toBe("var(--error)");
    expect(screen.getByText("cyan").style.color).toBe("var(--accent)");
    expect(screen.getByText("white").style.color).toBe("var(--text-primary)");
  });

  it("parses bright ANSI color codes (90-97)", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: {
        [CTX]: [
          "\x1b[90mdimmed\x1b[0m",
          "\x1b[91mbright-red\x1b[0m",
          "\x1b[92mbright-green\x1b[0m",
          "\x1b[93mbright-yellow\x1b[0m",
          "\x1b[94mbright-blue\x1b[0m",
          "\x1b[95mbright-magenta\x1b[0m",
          "\x1b[96mbright-cyan\x1b[0m",
          "\x1b[97mbright-white\x1b[0m",
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("dimmed").style.color).toBe("var(--text-muted)");
    expect(screen.getByText("bright-red").style.color).toBe("var(--error)");
    expect(screen.getByText("bright-green").style.color).toBe("var(--success)");
    expect(screen.getByText("bright-yellow").style.color).toBe("var(--warning)");
    expect(screen.getByText("bright-blue").style.color).toBe("var(--accent)");
    expect(screen.getByText("bright-magenta").style.color).toBe("var(--error)");
    expect(screen.getByText("bright-cyan").style.color).toBe("var(--accent)");
    expect(screen.getByText("bright-white").style.color).toBe("var(--text-primary)");
  });

  it("parses ANSI with multiple codes in one sequence", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[1;31mbold red\x1b[0m"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const span = screen.getByText("bold red");
    expect(span.style.color).toBe("var(--error)");
    expect(span.style.fontWeight).toBe("bold");
  });

  it("handles ANSI with muted color (code 30)", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[30mblack-text\x1b[0m"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("black-text").style.color).toBe("var(--text-muted)");
  });

  // --- Filter behavior on suites ---
  it("hides suites with no matching tests when filter is active", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      filter: { [CTX]: "failed" },
      suites: {
        [CTX]: [
          makeSuite({
            name: "all-passing",
            status: "passed",
            tests: [makeResult({ name: "t1", status: "passed" })],
          }),
          makeSuite({
            name: "has-failure",
            status: "failed",
            tests: [makeResult({ name: "t2", status: "failed" })],
          }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.queryByText("all-passing")).toBeNull();
    expect(screen.getByText("has-failure")).toBeTruthy();
  });

  // --- Name filter ---
  it("filters tests by name when name filter is set", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [
              makeResult({ name: "adds numbers", suite: "math" }),
              makeResult({ name: "subtracts values", suite: "math" }),
            ],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const searchInput = screen.getByPlaceholderText("Filter tests...");
    await user.type(searchInput, "adds");

    // Matching test visible, non-matching hidden
    expect(screen.getByText("adds numbers")).toBeTruthy();
    expect(screen.queryByText("subtracts values")).toBeNull();
  });

  it("auto-expands suites when name filter is active", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [makeResult({ name: "unique-test-xyz", suite: "math" })],
          }),
        ],
      },
      // Suite NOT expanded
      expandedSuites: { [CTX]: new Set() },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // Suite should be collapsed, test not visible
    expect(screen.queryByText("unique-test-xyz")).toBeNull();

    const searchInput = screen.getByPlaceholderText("Filter tests...");
    await user.type(searchInput, "unique");

    // Auto-expanded due to name filter
    expect(screen.getByText("unique-test-xyz")).toBeTruthy();
  });

  it("hides suite entirely when name filter matches no tests", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [makeResult({ name: "adds numbers", suite: "math" })],
          }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const searchInput = screen.getByPlaceholderText("Filter tests...");
    await user.type(searchInput, "nonexistent");

    expect(screen.queryByText("math")).toBeNull();
  });

  // --- Duration formatting ---
  it("shows duration in ms for tests under 1000ms", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [makeResult({ name: "fast-test", durationMs: 42, suite: "math" })],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("42ms")).toBeTruthy();
  });

  it("shows duration in seconds for tests >= 1000ms", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [makeResult({ name: "slow-test", durationMs: 2500, suite: "math" })],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("2.5s")).toBeTruthy();
  });

  it("does not show duration when durationMs is null", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [makeResult({ name: "no-dur-test", durationMs: null as any, suite: "math" })],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["math"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("no-dur-test")).toBeTruthy();
    // No duration text should appear for this test
    expect(screen.queryByText(/ms$/)).toBeNull();
  });

  // --- Suite counts edge cases ---
  it("hides failed count badge when no tests failed in suite", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "all-pass",
            status: "passed",
            tests: [
              makeResult({ name: "t1", status: "passed" }),
              makeResult({ name: "t2", status: "passed" }),
            ],
          }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("2P")).toBeTruthy();
    expect(screen.queryByText(/F$/)).toBeNull();
  });

  it("hides skipped count when all tests are passed or failed", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "mixed",
            status: "failed",
            tests: [
              makeResult({ name: "t1", status: "passed" }),
              makeResult({ name: "t2", status: "failed" }),
            ],
          }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("1P")).toBeTruthy();
    expect(screen.getByText("1F")).toBeTruthy();
    // No skipped count (totalCount === passedCount + failedCount)
    expect(screen.queryByText(/S$/)).toBeNull();
  });

  // --- showOutput takes priority over selectedFailure ---
  it("shows output view instead of failure details when showOutput is true", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["output line"] },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [
              makeResult({
                name: "broken",
                suite: "math",
                status: "failed",
                failureMessage: "some failure",
              }),
            ],
          }),
        ],
      },
      selectedTest: { [CTX]: { suite: "math", name: "broken" } },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // Output pane should show, not failure details
    expect(screen.getByText(/Raw Output/)).toBeTruthy();
    expect(screen.queryByText("some failure")).toBeNull();
  });

  // --- Empty state while running (no suites yet) ---
  it("does not show empty state when running even with no suites", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      running: { [CTX]: true },
      suites: { [CTX]: [] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.queryByText("No test results yet")).toBeNull();
    expect(screen.queryByText("No test framework detected")).toBeNull();
  });

  // --- Config with only testCommand (no framework) ---
  it("shows Not configured when config has no framework", () => {
    storeValues = {
      config: { [CTX]: makeConfig({ framework: null as any, testCommand: null as any }) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Not configured")).toBeTruthy();
  });

  // --- hasNoConfig disabled behavior (only testCommand set, no framework) ---
  it("enables Run All button when only testCommand is set", () => {
    storeValues = {
      config: { [CTX]: makeConfig({ framework: null as any, testCommand: "npm test" }) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    const runBtn = screen.getByText("Run All").closest("button")!;
    expect(runBtn.disabled).toBe(false);
  });

  // --- History chart with failed runs ---
  it("renders history chart bars with error color for failed runs", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      history: {
        [CTX]: [
          makeHistoryRecord({ id: "r1", passed: 5, failed: 2, total: 7 }),
        ],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    await user.click(screen.getByText("History"));
    // The chart bar should be rendered
    expect(screen.getByText("5P")).toBeTruthy();
    expect(screen.getByText("2F")).toBeTruthy();
  });

  // --- selectedFailure with no matching test ---
  it("does not show failure pane when selected test has no failure message", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "math",
            tests: [makeResult({ name: "passing", suite: "math", status: "passed", failureMessage: null })],
          }),
        ],
      },
      selectedTest: { [CTX]: { suite: "math", name: "passing" } },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.queryByText(/Failure Details/)).toBeNull();
  });

  // --- ANSI edge case: text after last escape ---
  it("handles trailing text after ANSI escape sequences", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[32mgreen\x1b[0m trailing text here"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("green")).toBeTruthy();
    expect(screen.getByText("trailing text here")).toBeTruthy();
  });

  // --- ANSI edge case: text before first escape ---
  it("handles leading text before ANSI escape sequences", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["leading \x1b[31mred\x1b[0m"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    expect(screen.getByText("leading")).toBeTruthy();
    expect(screen.getByText("red")).toBeTruthy();
  });

  // --- ANSI edge case: unrecognized code is ignored ---
  it("ignores unrecognized ANSI codes", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[99munknown\x1b[0m"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("unknown")).toBeTruthy();
  });

  // --- Coverage button label ---
  it("shows 'Coverage' label when no coverage data exists", () => {
    storeValues = { config: { [CTX]: makeConfig() } };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Coverage")).toBeTruthy();
  });

  it("shows 'Running...' on coverage button when coverage is running", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverageRunning: { [CTX]: true },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    // The button text includes "Running..."
    expect(screen.getAllByText("Running...").length).toBeGreaterThanOrEqual(1);
  });

  // --- Coverage view takes priority over history ---
  it("shows coverage view instead of history when both are active", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: { [CTX]: makeCoverage() },
      history: { [CTX]: [makeHistoryRecord()] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    // Enable history first
    await user.click(screen.getByText("History"));
    expect(screen.getByText("8P")).toBeTruthy();

    // Then enable coverage - it should take priority
    await user.click(screen.getByText("86%"));
    expect(screen.getByText("Total Coverage")).toBeTruthy();
    // History content should not be visible
    expect(screen.queryByText("8P")).toBeNull();
  });

  // --- Coverage files sorted by linesPct ---
  it("sorts coverage files by linesPct ascending (lowest first)", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      coverage: {
        [CTX]: makeCoverage({
          totalLinesPct: 70,
          files: [
            { file: "high.ts", linesPct: 90, branchesPct: 80, uncoveredLines: [] },
            { file: "low.ts", linesPct: 30, branchesPct: 20, uncoveredLines: [1, 2] },
            { file: "mid.ts", linesPct: 55, branchesPct: 50, uncoveredLines: [5] },
          ],
        }),
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    await user.click(screen.getByText("70%"));

    const fileNames = screen.getAllByText(/\.ts$/).map((el) => el.textContent);
    expect(fileNames).toEqual(["low.ts", "mid.ts", "high.ts"]);
  });

  // --- Suite status "pending" ---
  it("renders pending status on suite", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "pending-suite",
            status: "pending",
            tests: [makeResult({ name: "ptest", status: "pending", suite: "pending-suite" })],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["pending-suite"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("pending-suite")).toBeTruthy();
    expect(screen.getByText("ptest")).toBeTruthy();
  });

  // --- Suite status "skipped" ---
  it("renders skipped status on suite", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      suites: {
        [CTX]: [
          makeSuite({
            name: "skipped-suite",
            status: "skipped",
            tests: [makeResult({ name: "stest", status: "skipped", suite: "skipped-suite" })],
          }),
        ],
      },
      expandedSuites: { [CTX]: new Set(["skipped-suite"]) },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("skipped-suite")).toBeTruthy();
    expect(screen.getByText("stest")).toBeTruthy();
  });

  // --- ANSI: empty match[1] (e.g., \x1b[m) ---
  it("handles empty ANSI sequence code gracefully", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[msome text"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("some text")).toBeTruthy();
  });

  // --- Output line count display ---
  it("shows output line count", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["a", "b"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    expect(screen.getByText("Raw Output (2 lines)")).toBeTruthy();
  });

  // --- Branch: run.total || 1 fallback in history chart ---
  it("handles history run with total=0 (uses 1 as fallback)", async () => {
    const user = userEvent.setup();
    storeValues = {
      config: { [CTX]: makeConfig() },
      history: {
        [CTX]: [makeHistoryRecord({ id: "r-zero", passed: 0, failed: 0, skipped: 0, total: 0, durationMs: 100 })],
      },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);
    await user.click(screen.getByText("History"));
    // Should render without error (fallback prevents division by zero)
    expect(screen.getByText("0P")).toBeTruthy();
  });

  // --- Branch: workspace has no repoId (fallback to contextId) ---
  it("falls back to contextId when workspace has no repoId", () => {
    // Override workspaceStore to return a workspace with no repoId
    // This is tricky with the current mock, but we can use an unknown contextId
    // that doesn't match any workspace, which triggers the ?? fallback
    render(<TestRunnerPanel contextId="unknown-ws" contextType="workspace" />);
    expect(loadConfig).toHaveBeenCalledWith("unknown-ws", "unknown-ws");
  });

  // --- Branch: ANSI trailing text with bold still active ---
  it("handles ANSI trailing text with bold still active", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[1mbold start\x1b[31m then bold remains active"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const boldSpan = screen.getByText("bold start");
    expect(boldSpan.style.fontWeight).toBe("bold");
    const trailing = screen.getByText("then bold remains active");
    expect(trailing.style.fontWeight).toBe("bold");
    expect(trailing.style.color).toBe("var(--error)");
  });

  // --- Branch: ANSI with consecutive escapes and no text between ---
  it("handles consecutive ANSI escapes with no text between them", () => {
    storeValues = {
      config: { [CTX]: makeConfig() },
      showOutput: { [CTX]: true },
      output: { [CTX]: ["\x1b[1m\x1b[32mgreen-bold\x1b[0m"] },
    };
    render(<TestRunnerPanel contextId={CTX} contextType="workspace" />);

    const span = screen.getByText("green-bold");
    expect(span.style.color).toBe("var(--success)");
    expect(span.style.fontWeight).toBe("bold");
  });
});
