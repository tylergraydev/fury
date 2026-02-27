import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  runTests: vi.fn(),
  stopTests: vi.fn(),
  getTestRunnerConfig: vi.fn(),
  detectTestFramework: vi.fn(),
  saveTestRunnerConfig: vi.fn(),
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
} from "../lib/tauri";
import type {
  TestSuite,
  TestResult,
  TestRunSummary,
  TestRunnerConfig,
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
    subscriptions: {},
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
