import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TestSuite, TestResult, TestRunSummary, TestRunnerConfig } from "../../lib/tauri";

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
    subscriptions: {},
    subscribe,
    unsubscribe,
    loadConfig,
    runTests,
    stopTests,
    clearResults,
    setFilter,
    toggleOutput,
    toggleSuite,
    selectTest,
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
});
