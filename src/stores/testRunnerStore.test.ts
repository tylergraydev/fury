import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  runTests: vi.fn(),
  stopTests: vi.fn(),
  getTestRunnerConfig: vi.fn(),
  detectTestFramework: vi.fn(),
  saveTestRunnerConfig: vi.fn(),
  startTestWatch: vi.fn(),
  stopTestWatch: vi.fn(),
  listTestHistory: vi.fn(),
  runCoverage: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { useTestRunnerStore } from "./testRunnerStore";
import {
  runTests as runTestsCmd,
  stopTests as stopTestsCmd,
  getTestRunnerConfig,
  detectTestFramework,
  saveTestRunnerConfig,
  startTestWatch as startWatchCmd,
  stopTestWatch as stopWatchCmd,
  listTestHistory as listHistoryCmd,
  runCoverage as runCoverageCmd,
} from "../lib/tauri";
import type {
  TestSuite,
  TestResult,
  TestRunSummary,
  TestRunnerConfig,
  TestRunRecord,
  CoverageReport,
} from "../lib/tauri";
import { listen } from "@tauri-apps/api/event";

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
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    durationMs: 100,
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

let capturedCallback: ((event: { payload: any }) => void) | null = null;
const mockUnlisten = vi.fn();

beforeEach(() => {
  useTestRunnerStore.setState({
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
  });
  capturedCallback = null;
  vi.clearAllMocks();
  vi.mocked(listen).mockImplementation(async (_event, cb) => {
    capturedCallback = cb as any;
    return mockUnlisten;
  });
});

describe("testRunnerStore - subscribe/unsubscribe", () => {
  it("subscribe registers listener and stores unlisten fn", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);

    expect(listen).toHaveBeenCalledWith(`test-runner:${CTX}`, expect.any(Function));
    expect(useTestRunnerStore.getState().subscriptions[CTX]).toHaveLength(1);
  });

  it("subscribe is idempotent", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    await useTestRunnerStore.getState().subscribe(CTX);

    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe calls unlisten and removes subscription", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    useTestRunnerStore.getState().unsubscribe(CTX);

    expect(mockUnlisten).toHaveBeenCalled();
    expect(useTestRunnerStore.getState().subscriptions[CTX]).toBeUndefined();
  });

  it("unsubscribe is safe when no subscription exists", () => {
    useTestRunnerStore.getState().unsubscribe(CTX);
    expect(mockUnlisten).not.toHaveBeenCalled();
  });
});

describe("testRunnerStore - event handling", () => {
  it("suiteUpdate event adds new suite", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    const suite = makeSuite({ name: "utils" });

    capturedCallback!({ payload: { type: "suiteUpdate", suite } });

    expect(useTestRunnerStore.getState().suites[CTX]).toEqual([suite]);
  });

  it("suiteUpdate event replaces existing suite by name", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    const original = makeSuite({ name: "math", status: "running" });
    capturedCallback!({ payload: { type: "suiteUpdate", suite: original } });

    const updated = makeSuite({ name: "math", status: "passed" });
    capturedCallback!({ payload: { type: "suiteUpdate", suite: updated } });

    expect(useTestRunnerStore.getState().suites[CTX]).toEqual([updated]);
  });

  it("suiteUpdate event replaces suite while preserving other suites", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    const suiteA = makeSuite({ name: "math", status: "passed" });
    const suiteB = makeSuite({ name: "utils", status: "passed" });
    capturedCallback!({ payload: { type: "suiteUpdate", suite: suiteA } });
    capturedCallback!({ payload: { type: "suiteUpdate", suite: suiteB } });

    const updatedA = makeSuite({ name: "math", status: "failed" });
    capturedCallback!({ payload: { type: "suiteUpdate", suite: updatedA } });

    const suites = useTestRunnerStore.getState().suites[CTX];
    expect(suites).toHaveLength(2);
    expect(suites[0]).toEqual(updatedA);
    expect(suites[1]).toEqual(suiteB);
  });

  it("runComplete event sets summary, suites, running=false", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    useTestRunnerStore.setState({ running: { [CTX]: true } });
    const summary = makeSummary();

    capturedCallback!({ payload: { type: "runComplete", summary } });

    expect(useTestRunnerStore.getState().summary[CTX]).toEqual(summary);
    expect(useTestRunnerStore.getState().suites[CTX]).toEqual(summary.suites);
    expect(useTestRunnerStore.getState().running[CTX]).toBe(false);
  });

  it("outputLine event appends stdout line", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);

    capturedCallback!({ payload: { type: "outputLine", line: "PASS math.test.ts", stream: "stdout" } });

    expect(useTestRunnerStore.getState().output[CTX]).toEqual(["PASS math.test.ts"]);
  });

  it("outputLine event prepends [stderr] prefix", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);

    capturedCallback!({ payload: { type: "outputLine", line: "warning", stream: "stderr" } });

    expect(useTestRunnerStore.getState().output[CTX]).toEqual(["[stderr] warning"]);
  });

  it("error event sets error and running=false", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    useTestRunnerStore.setState({ running: { [CTX]: true } });

    capturedCallback!({ payload: { type: "error", message: "Process exited with code 1" } });

    expect(useTestRunnerStore.getState().error[CTX]).toBe("Process exited with code 1");
    expect(useTestRunnerStore.getState().running[CTX]).toBe(false);
  });
});

describe("testRunnerStore - loadConfig / detectFramework / saveConfig", () => {
  it("loadConfig fetches and stores config", async () => {
    const config = makeConfig();
    vi.mocked(getTestRunnerConfig).mockResolvedValue(config);

    await useTestRunnerStore.getState().loadConfig(CTX, "repo-1");

    expect(getTestRunnerConfig).toHaveBeenCalledWith("repo-1");
    expect(useTestRunnerStore.getState().config[CTX]).toEqual(config);
  });

  it("loadConfig logs error on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getTestRunnerConfig).mockRejectedValue(new Error("fail"));

    await useTestRunnerStore.getState().loadConfig(CTX, "repo-1");

    expect(spy).toHaveBeenCalledWith(
      "[testRunnerStore] Failed to load config:",
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("detectFramework detects and stores config", async () => {
    const config = makeConfig({ framework: "jest" });
    vi.mocked(detectTestFramework).mockResolvedValue(config);

    await useTestRunnerStore.getState().detectFramework(CTX, "repo-1");

    expect(detectTestFramework).toHaveBeenCalledWith("repo-1");
    expect(useTestRunnerStore.getState().config[CTX]).toEqual(config);
  });

  it("detectFramework logs error on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(detectTestFramework).mockRejectedValue(new Error("fail"));

    await useTestRunnerStore.getState().detectFramework(CTX, "repo-1");

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("saveConfig calls saveTestRunnerConfig", async () => {
    const config = makeConfig();
    vi.mocked(saveTestRunnerConfig).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().saveConfig("repo-1", config);

    expect(saveTestRunnerConfig).toHaveBeenCalledWith("repo-1", config);
  });

  it("saveConfig logs error on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(saveTestRunnerConfig).mockRejectedValue(new Error("fail"));

    await useTestRunnerStore.getState().saveConfig("repo-1", makeConfig());

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("testRunnerStore - runTests", () => {
  it("sets running=true, clears error/output/summary, resets suite statuses", async () => {
    const suite = makeSuite({
      status: "passed",
      tests: [makeResult({ status: "passed" })],
    });
    useTestRunnerStore.setState({ suites: { [CTX]: [suite] } });
    vi.mocked(runTestsCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().runTests(CTX, "workspace");

    const state = useTestRunnerStore.getState();
    expect(state.running[CTX]).toBe(true);
    expect(state.error[CTX]).toBeNull();
    expect(state.output[CTX]).toEqual([]);
    expect(state.summary[CTX]).toBeNull();
    expect(state.suites[CTX][0].status).toBe("running");
    expect(state.suites[CTX][0].tests[0].status).toBe("running");
  });

  it("calls runTestsCmd with correct args", async () => {
    vi.mocked(runTestsCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().runTests(CTX, "workspace", "file.test.ts");

    expect(runTestsCmd).toHaveBeenCalledWith(CTX, "workspace", "file.test.ts");
  });

  it("sets error and running=false on failure", async () => {
    vi.mocked(runTestsCmd).mockRejectedValue(new Error("spawn failed"));

    await useTestRunnerStore.getState().runTests(CTX, "workspace");

    expect(useTestRunnerStore.getState().running[CTX]).toBe(false);
    expect(useTestRunnerStore.getState().error[CTX]).toContain("spawn failed");
  });
});

describe("testRunnerStore - stopTests", () => {
  it("calls stopTestsCmd and sets running=false", async () => {
    useTestRunnerStore.setState({ running: { [CTX]: true } });
    vi.mocked(stopTestsCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().stopTests(CTX);

    expect(stopTestsCmd).toHaveBeenCalledWith(CTX);
    expect(useTestRunnerStore.getState().running[CTX]).toBe(false);
  });

  it("logs error on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stopTestsCmd).mockRejectedValue(new Error("fail"));

    await useTestRunnerStore.getState().stopTests(CTX);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("testRunnerStore - UI actions", () => {
  it("setFilter updates filter for context", () => {
    useTestRunnerStore.getState().setFilter(CTX, "failed");
    expect(useTestRunnerStore.getState().filter[CTX]).toBe("failed");
  });

  it("toggleSuite adds suite to expanded set", () => {
    useTestRunnerStore.getState().toggleSuite(CTX, "math");
    expect(useTestRunnerStore.getState().expandedSuites[CTX].has("math")).toBe(true);
  });

  it("toggleSuite removes suite from expanded set", () => {
    useTestRunnerStore.getState().toggleSuite(CTX, "math");
    useTestRunnerStore.getState().toggleSuite(CTX, "math");
    expect(useTestRunnerStore.getState().expandedSuites[CTX].has("math")).toBe(false);
  });

  it("selectTest sets selected test", () => {
    useTestRunnerStore.getState().selectTest(CTX, "math", "adds numbers");
    expect(useTestRunnerStore.getState().selectedTest[CTX]).toEqual({
      suite: "math",
      name: "adds numbers",
    });
  });

  it("toggleOutput flips showOutput", () => {
    useTestRunnerStore.getState().toggleOutput(CTX);
    expect(useTestRunnerStore.getState().showOutput[CTX]).toBe(true);
    useTestRunnerStore.getState().toggleOutput(CTX);
    expect(useTestRunnerStore.getState().showOutput[CTX]).toBe(false);
  });

  it("clearResults resets suites, summary, output, error, selectedTest", () => {
    useTestRunnerStore.setState({
      suites: { [CTX]: [makeSuite()] },
      summary: { [CTX]: makeSummary() },
      output: { [CTX]: ["line1"] },
      error: { [CTX]: "some error" },
      selectedTest: { [CTX]: { suite: "math", name: "test" } },
    });

    useTestRunnerStore.getState().clearResults(CTX);

    const state = useTestRunnerStore.getState();
    expect(state.suites[CTX]).toEqual([]);
    expect(state.summary[CTX]).toBeNull();
    expect(state.output[CTX]).toEqual([]);
    expect(state.error[CTX]).toBeNull();
    expect(state.selectedTest[CTX]).toBeNull();
  });
});

describe("testRunnerStore - coverageResult event", () => {
  it("coverageResult event sets coverage and coverageRunning=false", async () => {
    await useTestRunnerStore.getState().subscribe(CTX);
    useTestRunnerStore.setState({ coverageRunning: { [CTX]: true } });

    const report = {
      lineCoverage: 85.5,
      branchCoverage: 70.0,
      functionCoverage: 90.0,
      files: [],
    } as unknown as CoverageReport;

    capturedCallback!({ payload: { type: "coverageResult", report } });

    expect(useTestRunnerStore.getState().coverage[CTX]).toEqual(report);
    expect(useTestRunnerStore.getState().coverageRunning[CTX]).toBe(false);
  });
});

describe("testRunnerStore - unsubscribe with watch mode", () => {
  it("unsubscribe cleans up active watch mode subscription", async () => {
    const watchUnlisten = vi.fn();
    useTestRunnerStore.setState({
      subscriptions: { [CTX]: [mockUnlisten] },
      watchSubscriptions: { [CTX]: watchUnlisten },
      watchMode: { [CTX]: true },
    });
    vi.mocked(stopWatchCmd).mockRejectedValue(new Error("ignored"));

    useTestRunnerStore.getState().unsubscribe(CTX);

    expect(mockUnlisten).toHaveBeenCalled();
    expect(watchUnlisten).toHaveBeenCalled();
    expect(stopWatchCmd).toHaveBeenCalledWith(CTX);
    expect(useTestRunnerStore.getState().subscriptions[CTX]).toBeUndefined();
    expect(useTestRunnerStore.getState().watchSubscriptions[CTX]).toBeUndefined();
    expect(useTestRunnerStore.getState().watchMode[CTX]).toBe(false);
  });

  it("unsubscribe does not touch watch if no watch subscription exists", async () => {
    useTestRunnerStore.setState({
      subscriptions: { [CTX]: [mockUnlisten] },
    });

    useTestRunnerStore.getState().unsubscribe(CTX);

    expect(mockUnlisten).toHaveBeenCalled();
    expect(stopWatchCmd).not.toHaveBeenCalled();
  });
});

describe("testRunnerStore - toggleWatchMode", () => {
  it("enables watch mode when currently disabled", async () => {
    vi.mocked(startWatchCmd).mockResolvedValue(undefined);
    vi.mocked(runTestsCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "workspace");

    expect(startWatchCmd).toHaveBeenCalledWith(CTX, "workspace");
    expect(listen).toHaveBeenCalledWith(`test-watch:${CTX}`, expect.any(Function));
    expect(useTestRunnerStore.getState().watchMode[CTX]).toBe(true);
    expect(useTestRunnerStore.getState().watchSubscriptions[CTX]).toBeDefined();
  });

  it("disables watch mode when currently enabled", async () => {
    const watchUnlisten = vi.fn();
    useTestRunnerStore.setState({
      watchMode: { [CTX]: true },
      watchSubscriptions: { [CTX]: watchUnlisten },
    });
    vi.mocked(stopWatchCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "workspace");

    expect(watchUnlisten).toHaveBeenCalled();
    expect(stopWatchCmd).toHaveBeenCalledWith(CTX);
    expect(useTestRunnerStore.getState().watchMode[CTX]).toBe(false);
    expect(useTestRunnerStore.getState().watchSubscriptions[CTX]).toBeUndefined();
  });

  it("disabling watch mode handles stopWatchCmd failure gracefully", async () => {
    const watchUnlisten = vi.fn();
    useTestRunnerStore.setState({
      watchMode: { [CTX]: true },
      watchSubscriptions: { [CTX]: watchUnlisten },
    });
    vi.mocked(stopWatchCmd).mockRejectedValue(new Error("stop failed"));

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "workspace");

    expect(useTestRunnerStore.getState().watchMode[CTX]).toBe(false);
  });

  it("disabling watch mode is safe when no unsub function exists", async () => {
    useTestRunnerStore.setState({
      watchMode: { [CTX]: true },
      watchSubscriptions: {},
    });
    vi.mocked(stopWatchCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "workspace");

    expect(useTestRunnerStore.getState().watchMode[CTX]).toBe(false);
  });

  it("enabling watch mode logs error on startWatchCmd failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(startWatchCmd).mockRejectedValue(new Error("watch fail"));

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "workspace");

    expect(spy).toHaveBeenCalledWith(
      "[testRunnerStore] Failed to start watch mode:",
      expect.any(Error),
    );
    expect(useTestRunnerStore.getState().watchMode[CTX]).toBeFalsy();
    spy.mockRestore();
  });

  it("watch event triggers runTests when not already running", async () => {
    vi.mocked(startWatchCmd).mockResolvedValue(undefined);
    vi.mocked(runTestsCmd).mockResolvedValue(undefined);

    // Capture the watch listener callback by intercepting listen calls
    let watchCallback: ((event: any) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (event, cb) => {
      if (typeof event === "string" && event.startsWith("test-watch:")) {
        watchCallback = cb as any;
      }
      return mockUnlisten;
    });

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "repo");

    // Simulate watch event while not running
    useTestRunnerStore.setState({ running: { [CTX]: false } });
    watchCallback!({ payload: {} });

    expect(runTestsCmd).toHaveBeenCalledWith(CTX, "repo", undefined);
  });

  it("watch event does not trigger runTests when already running", async () => {
    vi.mocked(startWatchCmd).mockResolvedValue(undefined);
    vi.mocked(runTestsCmd).mockResolvedValue(undefined);

    let watchCallback: ((event: any) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (event, cb) => {
      if (typeof event === "string" && event.startsWith("test-watch:")) {
        watchCallback = cb as any;
      }
      return mockUnlisten;
    });

    await useTestRunnerStore.getState().toggleWatchMode(CTX, "repo");

    // Simulate watch event while already running
    useTestRunnerStore.setState({ running: { [CTX]: true } });
    watchCallback!({ payload: {} });

    expect(runTestsCmd).not.toHaveBeenCalled();
  });
});

describe("testRunnerStore - loadHistory", () => {
  it("loads and stores history records", async () => {
    const records: TestRunRecord[] = [
      {
        id: "run-1",
        repoId: "repo-1",
        timestamp: "2024-01-01T00:00:00Z",
        ranAt: "2024-01-01T00:00:00Z",
        total: 10,
        passed: 9,
        failed: 1,
        skipped: 0,
        durationMs: 5000,
      } as TestRunRecord,
    ];
    vi.mocked(listHistoryCmd).mockResolvedValue(records);

    await useTestRunnerStore.getState().loadHistory(CTX, "repo-1");

    expect(listHistoryCmd).toHaveBeenCalledWith("repo-1", 20);
    expect(useTestRunnerStore.getState().history[CTX]).toEqual(records);
  });

  it("logs error on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listHistoryCmd).mockRejectedValue(new Error("db error"));

    await useTestRunnerStore.getState().loadHistory(CTX, "repo-1");

    expect(spy).toHaveBeenCalledWith(
      "[testRunnerStore] Failed to load history:",
      expect.any(Error),
    );
    spy.mockRestore();
  });
});

describe("testRunnerStore - runCoverage", () => {
  it("sets coverageRunning=true and clears coverage, then calls runCoverageCmd", async () => {
    vi.mocked(runCoverageCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().runCoverage(CTX, "workspace");

    expect(runCoverageCmd).toHaveBeenCalledWith(CTX, "workspace");
    const state = useTestRunnerStore.getState();
    // coverageRunning stays true until coverageResult event arrives
    expect(state.coverageRunning[CTX]).toBe(true);
    expect(state.coverage[CTX]).toBeNull();
  });

  it("sets coverageRunning=false and error on failure", async () => {
    vi.mocked(runCoverageCmd).mockRejectedValue(new Error("coverage boom"));

    await useTestRunnerStore.getState().runCoverage(CTX, "repo");

    const state = useTestRunnerStore.getState();
    expect(state.coverageRunning[CTX]).toBe(false);
    expect(state.error[CTX]).toContain("Coverage failed:");
    expect(state.error[CTX]).toContain("coverage boom");
  });
});

describe("testRunnerStore - runTests edge cases", () => {
  it("handles runTests with no existing suites (empty suites path)", async () => {
    vi.mocked(runTestsCmd).mockResolvedValue(undefined);

    await useTestRunnerStore.getState().runTests(CTX, "repo");

    const state = useTestRunnerStore.getState();
    expect(state.running[CTX]).toBe(true);
    expect(state.suites[CTX]).toEqual([]);
  });
});
