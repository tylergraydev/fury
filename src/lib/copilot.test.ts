import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const { mockDispose, mockCommandDispose } = vi.hoisted(() => ({
  mockDispose: vi.fn(),
  mockCommandDispose: vi.fn(),
}));

vi.mock("monaco-editor", () => ({
  languages: {
    registerInlineCompletionsProvider: vi
      .fn()
      .mockReturnValue({ dispose: mockDispose }),
  },
  editor: {
    registerCommand: vi.fn().mockReturnValue({ dispose: mockCommandDispose }),
  },
  Range: vi.fn(function (this: any, a: number, b: number, c: number, d: number) {
    this.startLineNumber = a;
    this.startColumn = b;
    this.endLineNumber = c;
    this.endColumn = d;
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import * as monaco from "monaco-editor";
import {
  startCopilot,
  stopCopilot,
  copilotSignIn,
  copilotCheckStatus,
  notifyDocumentOpened,
  notifyDocumentClosed,
  notifyDocumentChanged,
  registerCopilotProvider,
  disposeCopilotProvider,
  speculativeComplete,
  toFileUri,
} from "./copilot";

describe("copilot document tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disposeCopilotProvider();
    vi.clearAllMocks();
    // Reset invoke to default resolved value (clearAllMocks doesn't reset implementations)
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Tauri IPC wrappers", () => {
    it("startCopilot calls invoke with start_copilot", async () => {
      await startCopilot("/root");
      expect(invoke).toHaveBeenCalledWith("start_copilot", { rootUri: "/root" });
    });

    it("stopCopilot calls invoke with stop_copilot", async () => {
      await stopCopilot();
      expect(invoke).toHaveBeenCalledWith("stop_copilot");
    });

    it("copilotSignIn calls invoke with copilot_sign_in", async () => {
      await copilotSignIn();
      expect(invoke).toHaveBeenCalledWith("copilot_sign_in");
    });

    it("copilotCheckStatus calls invoke with copilot_check_status", async () => {
      await copilotCheckStatus();
      expect(invoke).toHaveBeenCalledWith("copilot_check_status");
    });
  });

  describe("notifyDocumentOpened", () => {
    it("calls invoke with correct URI for a Unix path", async () => {
      await notifyDocumentOpened("/src/test.ts", "typescript", "content");
      expect(invoke).toHaveBeenCalledWith("copilot_did_open", {
        event: expect.objectContaining({ uri: "file:///src/test.ts" }),
      });
    });

    it("calls invoke with correct URI for a Windows path", async () => {
      await notifyDocumentOpened(
        "C:\\Users\\test.ts",
        "typescript",
        "content",
      );
      expect(invoke).toHaveBeenCalledWith("copilot_did_open", {
        event: expect.objectContaining({ uri: "file:///C:/Users/test.ts" }),
      });
    });

    it("passes a file:// URI through as-is", async () => {
      await notifyDocumentOpened(
        "file:///already/formed.ts",
        "typescript",
        "content",
      );
      expect(invoke).toHaveBeenCalledWith("copilot_did_open", {
        event: expect.objectContaining({
          uri: "file:///already/formed.ts",
        }),
      });
    });

    it("does not call invoke twice for the same file", async () => {
      await notifyDocumentOpened("/src/dup.ts", "typescript", "content");
      await notifyDocumentOpened("/src/dup.ts", "typescript", "content v2");
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it("sends languageId, version 1, and text in the event", async () => {
      await notifyDocumentOpened("/app.tsx", "typescriptreact", "hello");
      expect(invoke).toHaveBeenCalledWith("copilot_did_open", {
        event: {
          uri: "file:///app.tsx",
          languageId: "typescriptreact",
          version: 1,
          text: "hello",
        },
      });
    });

    it("handles invoke rejection by cleaning up the doc entry", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(invoke).mockRejectedValueOnce(new Error("not running"));
      await notifyDocumentOpened("/src/failopen.ts", "typescript", "content");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to notify document opened"),
        expect.any(Error),
      );
      // After failure, the file should be removable from tracking, allowing re-open
      vi.mocked(invoke).mockResolvedValue(undefined);
      await notifyDocumentOpened("/src/failopen.ts", "typescript", "content");
      expect(invoke).toHaveBeenCalledTimes(2); // first failed, second succeeds
      consoleSpy.mockRestore();
    });
  });

  describe("notifyDocumentChanged", () => {
    it("sends change event after debounce", async () => {
      await notifyDocumentOpened("/src/change.ts", "typescript", "initial");
      vi.mocked(invoke).mockClear();

      notifyDocumentChanged("/src/change.ts", "updated content");
      // Not called yet (debounced)
      expect(invoke).not.toHaveBeenCalled();

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(100);

      expect(invoke).toHaveBeenCalledWith("copilot_did_change", {
        event: expect.objectContaining({
          uri: "file:///src/change.ts",
          version: 2,
          text: "updated content",
        }),
      });
    });

    it("debounces multiple rapid changes", async () => {
      await notifyDocumentOpened("/src/debounce.ts", "typescript", "initial");
      vi.mocked(invoke).mockClear();

      notifyDocumentChanged("/src/debounce.ts", "change 1");
      notifyDocumentChanged("/src/debounce.ts", "change 2");
      notifyDocumentChanged("/src/debounce.ts", "change 3");

      await vi.advanceTimersByTimeAsync(100);

      // Only the last change should have been sent
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("copilot_did_change", {
        event: expect.objectContaining({ text: "change 3" }),
      });
    });

    it("does nothing if the file is not tracked", async () => {
      notifyDocumentChanged("/src/untracked.ts", "content");
      await vi.advanceTimersByTimeAsync(100);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles invoke rejection in change handler", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await notifyDocumentOpened("/src/changefail.ts", "typescript", "initial");
      vi.mocked(invoke).mockClear();
      vi.mocked(invoke).mockRejectedValueOnce(new Error("fail"));

      notifyDocumentChanged("/src/changefail.ts", "updated");
      await vi.advanceTimersByTimeAsync(100);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to notify document change"),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("notifyDocumentClosed", () => {
    it("calls invoke with copilot_did_close for a tracked file", async () => {
      await notifyDocumentOpened("/src/close.ts", "typescript", "content");
      vi.mocked(invoke).mockClear();

      await notifyDocumentClosed("/src/close.ts");
      expect(invoke).toHaveBeenCalledWith("copilot_did_close", {
        uri: "file:///src/close.ts",
      });
    });

    it("is a no-op for an untracked file", async () => {
      await notifyDocumentClosed("/never/opened.ts");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("allows re-opening a file after it was closed", async () => {
      await notifyDocumentOpened("/src/reopen.ts", "typescript", "v1");
      await notifyDocumentClosed("/src/reopen.ts");
      vi.mocked(invoke).mockClear();

      await notifyDocumentOpened("/src/reopen.ts", "typescript", "v2");
      expect(invoke).toHaveBeenCalledWith("copilot_did_open", {
        event: expect.objectContaining({
          uri: "file:///src/reopen.ts",
          text: "v2",
          version: 1,
        }),
      });
    });

    it("handles invoke rejection gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await notifyDocumentOpened("/src/closefail.ts", "typescript", "content");
      vi.mocked(invoke).mockClear();
      vi.mocked(invoke).mockRejectedValueOnce(new Error("close failed"));
      await notifyDocumentClosed("/src/closefail.ts");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to notify document closed"),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("registerCopilotProvider", () => {
    it("registers an inline completions provider", () => {
      registerCopilotProvider();
      expect(monaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledWith(
        { pattern: "**" },
        expect.objectContaining({
          provideInlineCompletions: expect.any(Function),
          disposeInlineCompletions: expect.any(Function),
        }),
      );
    });

    it("registers an acceptance tracking command", () => {
      registerCopilotProvider();
      expect(monaco.editor.registerCommand).toHaveBeenCalledWith(
        "copilot.completionAccepted",
        expect.any(Function),
      );
    });

    it("does not register twice", () => {
      registerCopilotProvider();
      registerCopilotProvider();
      // Should only be called once (the second call is a no-op because providerDisposable is already set)
      expect(monaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledTimes(1);
    });

    it("provideInlineCompletions returns empty items when doc not tracked", async () => {
      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/untracked.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
      expect(result).toEqual({ items: [] });
    });

    it("provideInlineCompletions returns completion items after debounce", async () => {
      await notifyDocumentOpened("/src/complete.ts", "typescript", "content");
      vi.mocked(invoke).mockImplementation(() =>
        Promise.resolve({
          items: [
            {
              insertText: "completion text",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
              },
            },
          ],
        }),
      );

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/complete.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      const resultPromise = provider.provideInlineCompletions(model, position, {}, token);
      // Advance past debounce
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.items.length).toBe(1);
      expect(result.items[0].insertText).toBe("completion text");
    });

    it("provideInlineCompletions returns empty items when token is already cancelled", async () => {
      await notifyDocumentOpened("/src/cancel.ts", "typescript", "content");

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/cancel.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: true, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
      expect(result).toEqual({ items: [] });
    });

    it("provideInlineCompletions handles errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await notifyDocumentOpened("/src/err.ts", "typescript", "content");
      vi.mocked(invoke).mockRejectedValue(new Error("completion failed"));

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/err.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      const resultPromise = provider.provideInlineCompletions(model, position, {}, token);
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result).toEqual({ items: [] });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("disposeInlineCompletions is callable", () => {
      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      // Should not throw
      expect(() => provider.disposeInlineCompletions({}, "reason")).not.toThrow();
    });

    it("handles items without range", async () => {
      await notifyDocumentOpened("/src/norange.ts", "typescript", "content");
      vi.mocked(invoke).mockImplementation(() =>
        Promise.resolve({
          items: [{ insertText: "no range text" }],
        }),
      );

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/norange.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      const resultPromise = provider.provideInlineCompletions(model, position, {}, token);
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.items[0].insertText).toBe("no range text");
      expect(result.items[0].range).toBeUndefined();
    });

    it("serves cached results without IPC call", async () => {
      await notifyDocumentOpened("/src/cached.ts", "typescript", "content");
      vi.mocked(invoke).mockImplementation(() =>
        Promise.resolve({
          items: [{ insertText: "cached result" }],
        }),
      );

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/cached.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      // First call — goes through debounce + IPC
      const resultPromise1 = provider.provideInlineCompletions(model, position, {}, token);
      await vi.advanceTimersByTimeAsync(100);
      await resultPromise1;

      const invokeCountAfterFirst = vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === "copilot_complete",
      ).length;

      // Second call at same position — should hit cache (no additional IPC)
      const result2 = await provider.provideInlineCompletions(model, position, {}, token);
      const invokeCountAfterSecond = vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === "copilot_complete",
      ).length;

      expect(result2.items[0].insertText).toBe("cached result");
      expect(invokeCountAfterSecond).toBe(invokeCountAfterFirst);
    });

    it("debounce supersedes earlier requests", async () => {
      await notifyDocumentOpened("/src/supersede.ts", "typescript", "content");
      vi.mocked(invoke).mockImplementation(() =>
        Promise.resolve({ items: [{ insertText: "result" }] }),
      );

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/supersede.ts" } };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      // Fire two rapid requests — the first should be superseded
      const promise1 = provider.provideInlineCompletions(
        model, { lineNumber: 1, column: 1 }, {}, token,
      );
      const promise2 = provider.provideInlineCompletions(
        model, { lineNumber: 1, column: 5 }, {}, token,
      );

      await vi.advanceTimersByTimeAsync(100);

      const result1 = await promise1;
      const result2 = await promise2;

      // First should return empty (superseded), second should have results
      expect(result1).toEqual({ items: [] });
      expect(result2.items.length).toBe(1);
    });

    it("attaches acceptance command when completion has UUID", async () => {
      await notifyDocumentOpened("/src/accept.ts", "typescript", "content");
      vi.mocked(invoke).mockImplementation(() =>
        Promise.resolve({
          items: [
            {
              insertText: "accepted",
              command: { arguments: ["test-uuid-123"] },
            },
          ],
        }),
      );

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/accept.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      const resultPromise = provider.provideInlineCompletions(model, position, {}, token);
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.items[0].command).toEqual({
        id: "copilot.completionAccepted",
        title: "Copilot Completion Accepted",
        arguments: ["test-uuid-123"],
      });
    });
  });

  describe("disposeCopilotProvider", () => {
    it("clears tracked documents so a file can be re-opened", async () => {
      await notifyDocumentOpened("/src/dispose.ts", "typescript", "content");
      vi.mocked(invoke).mockClear();

      disposeCopilotProvider();

      await notifyDocumentOpened("/src/dispose.ts", "typescript", "new");
      expect(invoke).toHaveBeenCalledWith("copilot_did_open", {
        event: expect.objectContaining({
          uri: "file:///src/dispose.ts",
          text: "new",
        }),
      });
    });

    it("disposes the provider when registered", () => {
      registerCopilotProvider();
      disposeCopilotProvider();
      expect(mockDispose).toHaveBeenCalled();
    });

    it("disposes the acceptance command when registered", () => {
      registerCopilotProvider();
      disposeCopilotProvider();
      expect(mockCommandDispose).toHaveBeenCalled();
    });

    it("clears pending debounce timers", async () => {
      await notifyDocumentOpened("/src/timer.ts", "typescript", "content");
      vi.mocked(invoke).mockClear();

      notifyDocumentChanged("/src/timer.ts", "updated");
      // Don't advance timer - dispose should clear it
      disposeCopilotProvider();

      await vi.advanceTimersByTimeAsync(200);
      // The change should NOT have been sent because timers were cleared
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("speculativeComplete", () => {
    it("fires a completion request and caches the result", async () => {
      await notifyDocumentOpened("/src/spec.ts", "typescript", "content");
      vi.mocked(invoke).mockImplementation(() =>
        Promise.resolve({ items: [{ insertText: "speculative" }] }),
      );

      speculativeComplete(toFileUri("/src/spec.ts"), 5, 0);

      // Let the async request resolve
      await vi.advanceTimersByTimeAsync(0);
      // Flush microtask queue
      await Promise.resolve();

      // Now request a completion at the same position — should hit cache
      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/spec.ts" } };
      const position = { lineNumber: 6, column: 1 }; // line 5 (0-indexed) = lineNumber 6 (1-indexed)
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }) };

      const completeCalls = vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === "copilot_complete",
      ).length;

      const result = await provider.provideInlineCompletions(model, position, {}, token);

      // Should serve from cache — no additional copilot_complete call
      const completeCallsAfter = vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === "copilot_complete",
      ).length;
      expect(completeCallsAfter).toBe(completeCalls);
      expect(result.items[0].insertText).toBe("speculative");
    });

    it("does nothing for untracked documents", () => {
      vi.mocked(invoke).mockClear();
      speculativeComplete(toFileUri("/src/unknown.ts"), 5, 0);
      // Should not call copilot_complete
      expect(vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === "copilot_complete",
      ).length).toBe(0);
    });

    it("silently ignores errors", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await notifyDocumentOpened("/src/specfail.ts", "typescript", "content");
      vi.mocked(invoke).mockRejectedValue(new Error("fail"));

      // Should not throw
      speculativeComplete(toFileUri("/src/specfail.ts"), 5, 0);
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      // No console.warn from speculative (errors are silently swallowed)
      // The warn from notifyDocumentOpened mock rejection is separate
      consoleSpy.mockRestore();
    });
  });

  describe("toFileUri", () => {
    it("converts Unix paths", () => {
      expect(toFileUri("/src/test.ts")).toBe("file:///src/test.ts");
    });

    it("converts Windows paths", () => {
      expect(toFileUri("C:\\Users\\test.ts")).toBe("file:///C:/Users/test.ts");
    });

    it("passes through file:// URIs", () => {
      expect(toFileUri("file:///already/formed.ts")).toBe("file:///already/formed.ts");
    });
  });
});
