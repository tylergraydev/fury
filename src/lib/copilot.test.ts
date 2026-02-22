import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const { mockDispose } = vi.hoisted(() => ({
  mockDispose: vi.fn(),
}));

vi.mock("monaco-editor", () => ({
  languages: {
    registerInlineCompletionsProvider: vi
      .fn()
      .mockReturnValue({ dispose: mockDispose }),
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
} from "./copilot";

describe("copilot document tracking", () => {
  beforeEach(() => {
    disposeCopilotProvider();
    vi.clearAllMocks();
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
      vi.useFakeTimers();
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
      vi.useRealTimers();
    });

    it("debounces multiple rapid changes", async () => {
      vi.useFakeTimers();
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
      vi.useRealTimers();
    });

    it("does nothing if the file is not tracked", async () => {
      vi.useFakeTimers();
      notifyDocumentChanged("/src/untracked.ts", "content");
      await vi.advanceTimersByTimeAsync(100);
      expect(invoke).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("handles invoke rejection in change handler", async () => {
      vi.useFakeTimers();
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
      vi.useRealTimers();
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
      const token = { isCancellationRequested: false };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
      expect(result).toEqual({ items: [] });
    });

    it("provideInlineCompletions returns completion items when doc is tracked", async () => {
      await notifyDocumentOpened("/src/complete.ts", "typescript", "content");
      vi.mocked(invoke).mockResolvedValueOnce({
        items: [
          {
            insertText: "completion text",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
          },
        ],
      });

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/complete.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
      expect(result.items.length).toBe(1);
      expect(result.items[0].insertText).toBe("completion text");
    });

    it("provideInlineCompletions returns empty items when token is cancelled", async () => {
      await notifyDocumentOpened("/src/cancel.ts", "typescript", "content");
      vi.mocked(invoke).mockResolvedValueOnce({
        items: [{ insertText: "text" }],
      });

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/cancel.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: true };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
      expect(result).toEqual({ items: [] });
    });

    it("provideInlineCompletions handles errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await notifyDocumentOpened("/src/err.ts", "typescript", "content");
      vi.mocked(invoke).mockRejectedValueOnce(new Error("completion failed"));

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/err.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
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
      vi.mocked(invoke).mockResolvedValueOnce({
        items: [{ insertText: "no range text" }],
      });

      registerCopilotProvider();
      const call = vi.mocked(monaco.languages.registerInlineCompletionsProvider).mock.calls[0];
      const provider = call[1] as any;
      const model = { uri: { path: "/src/norange.ts" } };
      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false };
      const result = await provider.provideInlineCompletions(model, position, {}, token);
      expect(result.items[0].insertText).toBe("no range text");
      expect(result.items[0].range).toBeUndefined();
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

    it("clears pending debounce timers", async () => {
      vi.useFakeTimers();
      await notifyDocumentOpened("/src/timer.ts", "typescript", "content");
      vi.mocked(invoke).mockClear();

      notifyDocumentChanged("/src/timer.ts", "updated");
      // Don't advance timer - dispose should clear it
      disposeCopilotProvider();

      await vi.advanceTimersByTimeAsync(200);
      // The change should NOT have been sent because timers were cleared
      expect(invoke).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
