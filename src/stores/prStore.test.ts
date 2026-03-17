import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  createPr: vi.fn(),
  getPrChecks: vi.fn(),
  pushChanges: vi.fn(),
  fixFailingChecks: vi.fn(),
  mergePr: vi.fn(),
  getPrFullData: vi.fn(),
  getReviewsAndComments: vi.fn(),
  getWorkflowRuns: vi.fn(),
}));

import { usePrStore } from "./prStore";
import { listen } from "@tauri-apps/api/event";
import {
  createPr,
  getPrChecks,
  pushChanges,
  fixFailingChecks,
  mergePr,
  getPrFullData,
  getReviewsAndComments,
  getWorkflowRuns,
} from "../lib/tauri";

const makePrInfo = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "ws-1",
  prNumber: 42,
  prUrl: "https://github.com/test/pr/42",
  title: "Test PR",
  state: "open",
  checks: [],
  mergeable: "MERGEABLE",
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  usePrStore.setState(
    {
      prInfo: {},
      reviews: {},
      reviewComments: {},
      workflowRuns: {},
      workflowLoading: {},
      loading: {},
      error: {},
      subscriptions: {},
      pollIntervals: {},
    },
  );
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up any remaining intervals
  const state = usePrStore.getState();
  Object.keys(state.pollIntervals).forEach((key) => {
    clearInterval(state.pollIntervals[key]);
  });
  vi.useRealTimers();
});

describe("prStore - subscribe", () => {
  it("registers two listeners (updated + merged)", async () => {
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();
    vi.mocked(listen)
      .mockResolvedValueOnce(unlisten1)
      .mockResolvedValueOnce(unlisten2);

    await usePrStore.getState().subscribe("ws-1");

    expect(listen).toHaveBeenCalledTimes(2);
    expect(listen).toHaveBeenCalledWith(
      "pr-updated:ws-1",
      expect.any(Function),
    );
    expect(listen).toHaveBeenCalledWith(
      "pr-merged:ws-1",
      expect.any(Function),
    );
    expect(usePrStore.getState().subscriptions["ws-1"]).toEqual([
      unlisten1,
      unlisten2,
    ]);
  });

  it("skips if already subscribed", async () => {
    usePrStore.setState({
      subscriptions: { "ws-1": [vi.fn()] as any },
    });

    await usePrStore.getState().subscribe("ws-1");

    expect(listen).not.toHaveBeenCalled();
  });

  it("pr-updated event stores payload", async () => {
    let updatedHandler: any;
    vi.mocked(listen).mockImplementation(async (channel, handler) => {
      if (channel === "pr-updated:ws-1") {
        updatedHandler = handler;
      }
      return () => {};
    });

    await usePrStore.getState().subscribe("ws-1");

    const info = makePrInfo({ prNumber: 99 });
    updatedHandler({ payload: info });

    expect(usePrStore.getState().prInfo["ws-1"]).toEqual(info);
  });

  it("pr-merged event reloads PR info and stops polling", async () => {
    let mergedHandler: any;
    vi.mocked(listen).mockImplementation(async (channel, handler) => {
      if (channel === "pr-merged:ws-1") {
        mergedHandler = handler;
      }
      return () => {};
    });
    vi.mocked(getPrFullData).mockResolvedValue({
      info: makePrInfo({ state: "merged" }),
      reviews: [],
      reviewComments: [],
    } as any);

    await usePrStore.getState().subscribe("ws-1");
    // Start polling so we can verify it gets stopped
    usePrStore.getState().startPolling("ws-1");
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();

    mergedHandler({ payload: { success: true } });

    // loadPrInfo should be called (which uses getPrFullData)
    await vi.waitFor(() => {
      expect(getPrFullData).toHaveBeenCalledWith("ws-1");
    });
    // Polling should be stopped
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeUndefined();
  });
});

describe("prStore - unsubscribe", () => {
  it("is a no-op for non-existent workspace", () => {
    usePrStore.getState().unsubscribe("non-existent");
    expect(usePrStore.getState().subscriptions).toEqual({});
  });

  it("calls all unlisten functions and removes subscription", () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    usePrStore.setState({
      subscriptions: { "ws-1": [unsub1, unsub2] as any },
    });

    usePrStore.getState().unsubscribe("ws-1");

    expect(unsub1).toHaveBeenCalled();
    expect(unsub2).toHaveBeenCalled();
    expect(usePrStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });

  it("stops polling when unsubscribing", () => {
    const unsub = vi.fn();
    usePrStore.setState({
      subscriptions: { "ws-1": [unsub] as any },
    });
    // Start polling first
    usePrStore.getState().startPolling("ws-1");
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();

    usePrStore.getState().unsubscribe("ws-1");

    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeUndefined();
  });
});

describe("prStore - subscribe/unsubscribe race condition", () => {
  // Each test resets the listen mock to avoid leftover mockImplementationOnce
  // entries from previous tests (vi.clearAllMocks does not clear them).

  it("unsubscribe during in-flight subscribe cancels and cleans up first listener", async () => {
    vi.mocked(listen).mockReset();

    let resolveFirst!: (v: () => void) => void;
    const unlisten1 = vi.fn();

    vi.mocked(listen).mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; }),
    );

    const subscribePromise = usePrStore.getState().subscribe("ws-1");

    // Unsubscribe while subscribe is awaiting the first listen
    usePrStore.getState().unsubscribe("ws-1");

    // Resolve the first listen — subscribe should detect cancellation
    resolveFirst(unlisten1);
    await subscribePromise;

    // First listener should be cleaned up, second never acquired
    expect(unlisten1).toHaveBeenCalled();
    expect(usePrStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });

  it("unsubscribe between first and second await cleans up both listeners", async () => {
    vi.mocked(listen).mockReset();

    let resolveFirst!: (v: () => void) => void;
    let resolveSecond!: (v: () => void) => void;
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();

    vi.mocked(listen)
      .mockImplementationOnce(
        () => new Promise((r) => { resolveFirst = r; }),
      )
      .mockImplementationOnce(
        () => new Promise((r) => { resolveSecond = r; }),
      );

    const subscribePromise = usePrStore.getState().subscribe("ws-1");

    // Resolve first listen so subscribe proceeds to second await
    resolveFirst(unlisten1);
    await Promise.resolve();

    // Unsubscribe between the two awaits
    usePrStore.getState().unsubscribe("ws-1");

    // Resolve second listen
    resolveSecond(unlisten2);
    await subscribePromise;

    // Both unlisten fns should have been called
    expect(unlisten1).toHaveBeenCalled();
    expect(unlisten2).toHaveBeenCalled();
    expect(usePrStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });

  it("cancelled event handler does not update store", async () => {
    vi.mocked(listen).mockReset();

    let updatedHandler: ((event: { payload: unknown }) => void) | undefined;
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();

    vi.mocked(listen).mockImplementation(async (_channel, handler) => {
      const ch = String(_channel);
      if (ch.startsWith("pr-updated:")) {
        updatedHandler = handler as (event: { payload: unknown }) => void;
      }
      return ch.includes("updated") ? unlisten1 : unlisten2;
    });

    await usePrStore.getState().subscribe("ws-1");

    // Now unsubscribe (cancels the token used by event handlers)
    usePrStore.getState().unsubscribe("ws-1");

    // Simulate an event arriving on the orphaned listener before unlisten takes effect
    updatedHandler!({ payload: makePrInfo({ prNumber: 999, title: "Orphaned" }) });

    // Store should NOT have been updated because the handler's token is cancelled
    expect(usePrStore.getState().prInfo["ws-1"]).toBeUndefined();
  });

  it("re-subscribe after cancel works correctly", async () => {
    vi.mocked(listen).mockReset();

    let resolveFirst!: (v: () => void) => void;
    const unlisten1 = vi.fn();

    vi.mocked(listen).mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; }),
    );

    const subscribePromise = usePrStore.getState().subscribe("ws-1");

    // Cancel it
    usePrStore.getState().unsubscribe("ws-1");
    resolveFirst(unlisten1);
    await subscribePromise;

    // Now re-subscribe fresh
    const unlisten3 = vi.fn();
    const unlisten4 = vi.fn();
    vi.mocked(listen)
      .mockResolvedValueOnce(unlisten3)
      .mockResolvedValueOnce(unlisten4);

    await usePrStore.getState().subscribe("ws-1");

    expect(usePrStore.getState().subscriptions["ws-1"]).toEqual([unlisten3, unlisten4]);
  });
});

describe("prStore - loadPrInfo", () => {
  it("loads PR info, reviews, and comments via combined endpoint", async () => {
    const info = makePrInfo();
    const reviews = [{ id: 1, author: "alice", state: "APPROVED", body: "", submittedAt: "" }];
    const reviewComments = [{ id: 10, author: "bob", body: "fix", createdAt: "", path: "src/foo.ts", line: 5 }];
    vi.mocked(getPrFullData).mockResolvedValue({
      info,
      reviews,
      reviewComments,
    } as any);

    await usePrStore.getState().loadPrInfo("ws-1");

    expect(usePrStore.getState().prInfo["ws-1"]).toEqual(info);
    expect(usePrStore.getState().reviews["ws-1"]).toEqual(reviews);
    expect(usePrStore.getState().reviewComments["ws-1"]).toEqual(reviewComments);
    expect(usePrStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error on failure", async () => {
    vi.mocked(getPrFullData).mockRejectedValue(new Error("load fail"));

    await usePrStore.getState().loadPrInfo("ws-1");

    expect(usePrStore.getState().error["ws-1"]).toBe("Error: load fail");
    expect(usePrStore.getState().loading["ws-1"]).toBe(false);
  });
});

describe("prStore - refreshChecks", () => {
  it("updates checks on existing PR info", async () => {
    usePrStore.setState({ prInfo: { "ws-1": makePrInfo() as any } });
    const checks = [
      { name: "ci", status: "IN_PROGRESS", conclusion: null, detailsUrl: null, description: null },
    ];
    vi.mocked(getPrChecks).mockResolvedValue(checks as any);

    await usePrStore.getState().refreshChecks("ws-1");

    expect(usePrStore.getState().prInfo["ws-1"]?.checks).toEqual(checks);
  });

  it("is a no-op if no PR info exists", async () => {
    vi.mocked(getPrChecks).mockResolvedValue([]);

    await usePrStore.getState().refreshChecks("ws-1");

    expect(usePrStore.getState().prInfo["ws-1"]).toBeUndefined();
  });

  it("stops polling when all checks complete", async () => {
    usePrStore.setState({ prInfo: { "ws-1": makePrInfo() as any } });
    usePrStore.getState().startPolling("ws-1");
    const checks = [
      { name: "ci", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null, description: null },
    ];
    vi.mocked(getPrChecks).mockResolvedValue(checks as any);

    await usePrStore.getState().refreshChecks("ws-1");

    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeUndefined();
  });

  it("keeps polling when checks are still running", async () => {
    usePrStore.setState({ prInfo: { "ws-1": makePrInfo() as any } });
    usePrStore.getState().startPolling("ws-1");
    const checks = [
      { name: "ci", status: "IN_PROGRESS", conclusion: null, detailsUrl: null, description: null },
    ];
    vi.mocked(getPrChecks).mockResolvedValue(checks as any);

    await usePrStore.getState().refreshChecks("ws-1");

    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();
    // Clean up
    usePrStore.getState().stopPolling("ws-1");
  });

  it("keeps polling when workflow runs are still in progress", async () => {
    usePrStore.setState({
      prInfo: { "ws-1": makePrInfo() as any },
      workflowRuns: {
        "ws-1": [{ id: 1, name: "ci", workflowName: "CI", status: "in_progress", conclusion: null, event: "push", createdAt: "" }] as any,
      },
    });
    usePrStore.getState().startPolling("ws-1");
    const checks = [
      { name: "ci", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null, description: null },
    ];
    vi.mocked(getPrChecks).mockResolvedValue(checks as any);
    // Mock loadWorkflowRuns to keep returning in-progress runs
    vi.mocked(getWorkflowRuns).mockResolvedValue(
      [{ id: 1, name: "ci", workflowName: "CI", status: "in_progress", conclusion: null, event: "push", createdAt: "" }] as any,
    );

    await usePrStore.getState().refreshChecks("ws-1");

    // Checks are done but workflow runs are not → keep polling
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();
    usePrStore.getState().stopPolling("ws-1");
  });

  it("sets error on failure", async () => {
    usePrStore.setState({ prInfo: { "ws-1": makePrInfo() as any } });
    vi.mocked(getPrChecks).mockRejectedValue(new Error("check fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await usePrStore.getState().refreshChecks("ws-1");

    expect(usePrStore.getState().error["ws-1"]).toContain("check fail");
  });
});

describe("prStore - createPr", () => {
  it("creates PR, stores info, and starts polling", async () => {
    const info = makePrInfo();
    vi.mocked(createPr).mockResolvedValue(info as any);

    const result = await usePrStore.getState().createPr({
      workspaceId: "ws-1",
      title: "Test PR",
      body: "body",
    });

    expect(result).toEqual(info);
    expect(usePrStore.getState().prInfo["ws-1"]).toEqual(info);
    expect(usePrStore.getState().loading["ws-1"]).toBe(false);
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();
    // Clean up
    usePrStore.getState().stopPolling("ws-1");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(createPr).mockRejectedValue(new Error("create fail"));

    await expect(
      usePrStore.getState().createPr({
        workspaceId: "ws-1",
        title: "Test",
        body: "body",
      }),
    ).rejects.toThrow("create fail");

    expect(usePrStore.getState().error["ws-1"]).toBe("Error: create fail");
  });
});

describe("prStore - pushChanges", () => {
  it("pushes and starts polling", async () => {
    vi.mocked(pushChanges).mockResolvedValue(undefined);

    await usePrStore.getState().pushChanges("ws-1");

    expect(pushChanges).toHaveBeenCalledWith("ws-1");
    expect(usePrStore.getState().loading["ws-1"]).toBe(false);
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();
    usePrStore.getState().stopPolling("ws-1");
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(pushChanges).mockRejectedValue(new Error("push fail"));

    await expect(
      usePrStore.getState().pushChanges("ws-1"),
    ).rejects.toThrow("push fail");

    expect(usePrStore.getState().error["ws-1"]).toBe("Error: push fail");
  });
});

describe("prStore - getFixMessage", () => {
  it("delegates to fixFailingChecks", async () => {
    vi.mocked(fixFailingChecks).mockResolvedValue("fix suggestion");

    const result = await usePrStore.getState().getFixMessage("ws-1");

    expect(result).toBe("fix suggestion");
    expect(fixFailingChecks).toHaveBeenCalledWith("ws-1");
  });
});

describe("prStore - mergePr", () => {
  it("merges and reloads PR info", async () => {
    const mergeResult = {
      success: true,
      message: "merged",
      mergeMethod: "squash",
    };
    vi.mocked(mergePr).mockResolvedValue(mergeResult as any);
    vi.mocked(getPrFullData).mockResolvedValue({
      info: makePrInfo({ state: "merged" }),
      reviews: [],
      reviewComments: [],
    } as any);

    const result = await usePrStore.getState().mergePr("ws-1", "squash");

    expect(result).toEqual(mergeResult);
    expect(mergePr).toHaveBeenCalledWith("ws-1", "squash");
    expect(usePrStore.getState().loading["ws-1"]).toBe(false);
  });

  it("sets error and throws on failure", async () => {
    vi.mocked(mergePr).mockRejectedValue(new Error("merge fail"));

    await expect(
      usePrStore.getState().mergePr("ws-1"),
    ).rejects.toThrow("merge fail");

    expect(usePrStore.getState().error["ws-1"]).toBe("Error: merge fail");
  });
});

describe("prStore - polling", () => {
  it("startPolling sets up an interval", () => {
    usePrStore.getState().startPolling("ws-1");

    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();
    usePrStore.getState().stopPolling("ws-1");
  });

  it("startPolling skips if already polling", () => {
    usePrStore.getState().startPolling("ws-1");
    const first = usePrStore.getState().pollIntervals["ws-1"];
    usePrStore.getState().startPolling("ws-1");
    const second = usePrStore.getState().pollIntervals["ws-1"];

    expect(first).toBe(second);
    usePrStore.getState().stopPolling("ws-1");
  });

  it("stopPolling clears the interval", () => {
    usePrStore.getState().startPolling("ws-1");
    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeDefined();

    usePrStore.getState().stopPolling("ws-1");

    expect(usePrStore.getState().pollIntervals["ws-1"]).toBeUndefined();
  });

  it("polling interval calls refreshChecks", async () => {
    usePrStore.setState({ prInfo: { "ws-1": makePrInfo() as any } });
    const checks = [
      { name: "ci", status: "IN_PROGRESS", conclusion: null, detailsUrl: null, description: null },
    ];
    vi.mocked(getPrChecks).mockResolvedValue(checks as any);

    usePrStore.getState().startPolling("ws-1");

    await vi.advanceTimersByTimeAsync(30000);

    expect(getPrChecks).toHaveBeenCalledWith("ws-1");
    usePrStore.getState().stopPolling("ws-1");
  });
});

describe("prStore - getters", () => {
  it("getPrInfo returns info for known workspace", () => {
    const info = makePrInfo();
    usePrStore.setState({ prInfo: { "ws-1": info as any } });
    expect(usePrStore.getState().getPrInfo("ws-1")).toEqual(info);
  });

  it("getPrInfo returns null for unknown workspace", () => {
    expect(usePrStore.getState().getPrInfo("unknown")).toBeNull();
  });

  it("isLoading returns correct state", () => {
    expect(usePrStore.getState().isLoading("ws-1")).toBe(false);
    usePrStore.setState({ loading: { "ws-1": true } });
    expect(usePrStore.getState().isLoading("ws-1")).toBe(true);
  });

  it("getError returns correct state", () => {
    expect(usePrStore.getState().getError("ws-1")).toBeNull();
    usePrStore.setState({ error: { "ws-1": "some error" } });
    expect(usePrStore.getState().getError("ws-1")).toBe("some error");
  });

  it("getReviews returns reviews for known workspace", () => {
    const reviews = [{ id: 1, author: "alice", state: "APPROVED", body: "", submittedAt: "" }];
    usePrStore.setState({ reviews: { "ws-1": reviews as any } });
    expect(usePrStore.getState().getReviews("ws-1")).toEqual(reviews);
  });

  it("getReviews returns empty array for unknown workspace", () => {
    expect(usePrStore.getState().getReviews("unknown")).toEqual([]);
  });

  it("getReviewComments returns comments for known workspace", () => {
    const comments = [{ id: 1, author: "bob", body: "fix this", createdAt: "", path: "src/foo.ts", line: 42 }];
    usePrStore.setState({ reviewComments: { "ws-1": comments as any } });
    expect(usePrStore.getState().getReviewComments("ws-1")).toEqual(comments);
  });

  it("getReviewComments returns empty array for unknown workspace", () => {
    expect(usePrStore.getState().getReviewComments("unknown")).toEqual([]);
  });
});

describe("prStore - loadReviews", () => {
  it("fetches and stores reviews and comments via combined endpoint", async () => {
    const reviews = [{ id: 1, author: "alice", state: "CHANGES_REQUESTED", body: "Please fix", submittedAt: "" }];
    const comments = [{ id: 10, author: "alice", body: "This is wrong", createdAt: "", path: "src/foo.ts", line: 5 }];
    vi.mocked(getReviewsAndComments).mockResolvedValue({
      reviews,
      reviewComments: comments,
    } as any);

    await usePrStore.getState().loadReviews("ws-1");

    expect(usePrStore.getState().reviews["ws-1"]).toEqual(reviews);
    expect(usePrStore.getState().reviewComments["ws-1"]).toEqual(comments);
  });

  it("handles errors gracefully", async () => {
    vi.mocked(getReviewsAndComments).mockRejectedValue(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await usePrStore.getState().loadReviews("ws-1");

    // Should not throw and state should remain empty
    expect(usePrStore.getState().reviews["ws-1"]).toBeUndefined();
  });

  it("deduplicates concurrent calls", async () => {
    let resolveData: (v: any) => void;
    vi.mocked(getReviewsAndComments).mockImplementation(
      () => new Promise((r) => { resolveData = r; }),
    );

    const p1 = usePrStore.getState().loadReviews("ws-1");
    const p2 = usePrStore.getState().loadReviews("ws-1");

    resolveData!({ reviews: [], reviewComments: [] });
    await p1;
    await p2;

    expect(getReviewsAndComments).toHaveBeenCalledTimes(1);
  });
});

describe("prStore - getReviewFixMessage", () => {
  it("returns no feedback message when empty", () => {
    const msg = usePrStore.getState().getReviewFixMessage("ws-1");
    expect(msg).toBe("No review feedback found.");
  });

  it("formats reviews into a message", () => {
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 1, author: "alice", state: "CHANGES_REQUESTED", body: "Please fix the types", submittedAt: "" },
        ] as any,
      },
      reviewComments: { "ws-1": [] },
    });

    const msg = usePrStore.getState().getReviewFixMessage("ws-1");

    expect(msg).toContain("@alice");
    expect(msg).toContain("CHANGES_REQUESTED");
    expect(msg).toContain("Please fix the types");
  });

  it("formats inline comments with file paths", () => {
    usePrStore.setState({
      reviews: { "ws-1": [] },
      reviewComments: {
        "ws-1": [
          { id: 10, author: "bob", body: "This should be a const", createdAt: "", path: "src/foo.ts", line: 42 },
        ] as any,
      },
    });

    const msg = usePrStore.getState().getReviewFixMessage("ws-1");

    expect(msg).toContain("@bob");
    expect(msg).toContain("`src/foo.ts:42`");
    expect(msg).toContain("This should be a const");
  });

  it("formats review with no body", () => {
    usePrStore.setState({
      reviews: {
        "ws-1": [
          { id: 1, author: "alice", state: "APPROVED", body: "", submittedAt: "" },
        ] as any,
      },
      reviewComments: { "ws-1": [] },
    });

    const msg = usePrStore.getState().getReviewFixMessage("ws-1");

    expect(msg).toContain("@alice");
    expect(msg).toContain("APPROVED");
  });

  it("formats comment with path but no line", () => {
    usePrStore.setState({
      reviews: { "ws-1": [] },
      reviewComments: {
        "ws-1": [
          { id: 10, author: "bob", body: "Check this file", createdAt: "", path: "src/bar.ts", line: null },
        ] as any,
      },
    });
    const msg = usePrStore.getState().getReviewFixMessage("ws-1");
    expect(msg).toContain("`src/bar.ts`");
    expect(msg).not.toContain("null");
  });

  it("formats comment with no path as general", () => {
    usePrStore.setState({
      reviews: { "ws-1": [] },
      reviewComments: {
        "ws-1": [
          { id: 10, author: "bob", body: "General note", createdAt: "", path: null, line: null },
        ] as any,
      },
    });
    const msg = usePrStore.getState().getReviewFixMessage("ws-1");
    expect(msg).toContain("general");
  });
});

describe("prStore - loadWorkflowRuns", () => {
  it("fetches and stores workflow runs", async () => {
    const runs = [{ id: 1, name: "CI", status: "completed", conclusion: "success", url: "" }];
    vi.mocked(getWorkflowRuns).mockResolvedValue(runs as any);

    await usePrStore.getState().loadWorkflowRuns("ws-1");

    expect(usePrStore.getState().workflowRuns["ws-1"]).toEqual(runs);
    expect(usePrStore.getState().workflowLoading["ws-1"]).toBe(false);
  });

  it("handles errors gracefully", async () => {
    vi.mocked(getWorkflowRuns).mockRejectedValue(new Error("api error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await usePrStore.getState().loadWorkflowRuns("ws-1");

    expect(usePrStore.getState().workflowRuns["ws-1"]).toBeUndefined();
    expect(usePrStore.getState().workflowLoading["ws-1"]).toBe(false);
  });

  it("deduplicates concurrent calls", async () => {
    let resolve: () => void;
    vi.mocked(getWorkflowRuns).mockImplementation(
      () => new Promise<any>((r) => { resolve = () => r([]); }),
    );

    const p1 = usePrStore.getState().loadWorkflowRuns("ws-1");
    const p2 = usePrStore.getState().loadWorkflowRuns("ws-1");

    resolve!();
    await p1;
    await p2;

    expect(getWorkflowRuns).toHaveBeenCalledTimes(1);
  });
});
