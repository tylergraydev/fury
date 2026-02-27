import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceInput } from "./useVoiceInput";

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => {
    this.onstart?.();
  });
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();
}

let mockInstance: MockSpeechRecognition;
const OriginalSpeechRecognition = (globalThis as any).SpeechRecognition;
const OriginalWebkit = (globalThis as any).webkitSpeechRecognition;

describe("useVoiceInput", () => {
  beforeEach(() => {
    // Patch the class so each new instance is captured
    (globalThis as any).SpeechRecognition = class extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstance = this;
      }
    };
    delete (globalThis as any).webkitSpeechRecognition;
  });

  afterEach(() => {
    // Restore originals
    if (OriginalSpeechRecognition) {
      (globalThis as any).SpeechRecognition = OriginalSpeechRecognition;
    } else {
      delete (globalThis as any).SpeechRecognition;
    }
    if (OriginalWebkit) {
      (globalThis as any).webkitSpeechRecognition = OriginalWebkit;
    } else {
      delete (globalThis as any).webkitSpeechRecognition;
    }
  });

  it("reports isSupported true when SpeechRecognition exists", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    expect(result.current.isSupported).toBe(true);
  });

  it("starts listening and fires onstart", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    expect(mockInstance.start).toHaveBeenCalled();
    expect(result.current.isListening).toBe(true);
  });

  it("stops listening", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    act(() => result.current.stopListening());
    expect(mockInstance.stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it("toggleListening toggles between start and stop", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.toggleListening());
    expect(result.current.isListening).toBe(true);
    act(() => result.current.toggleListening());
    expect(result.current.isListening).toBe(false);
  });

  it("calls onTranscript with final result", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceInput({ onTranscript }));
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "hello world" }, isFinal: true, length: 1 },
        },
      });
    });
    expect(onTranscript).toHaveBeenCalledWith("hello world");
  });

  it("updates interimTranscript for non-final results", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "hel" }, isFinal: false, length: 1 },
        },
      });
    });
    expect(result.current.interimTranscript).toBe("hel");
  });

  it("clears interimTranscript when result is final", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    // Interim first
    act(() => {
      mockInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "hel" }, isFinal: false, length: 1 },
        },
      });
    });
    expect(result.current.interimTranscript).toBe("hel");
    // Then final
    act(() => {
      mockInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "hello" }, isFinal: true, length: 1 },
        },
      });
    });
    expect(result.current.interimTranscript).toBe("");
  });

  it("sets error for not-allowed and calls onError", () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn(), onError }),
    );
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onerror?.({ error: "not-allowed" });
    });
    expect(result.current.error).toContain("Microphone access denied");
    expect(result.current.isListening).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Microphone"));
  });

  it("does not surface error for no-speech", () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn(), onError }),
    );
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onerror?.({ error: "no-speech" });
    });
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("auto-restarts on onend while still in listening mode", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    const firstCallCount = mockInstance.start.mock.calls.length;
    // Simulate browser stopping recognition (e.g., silence timeout)
    act(() => {
      mockInstance.onend?.();
    });
    expect(mockInstance.start.mock.calls.length).toBe(firstCallCount + 1);
    expect(result.current.isListening).toBe(true);
  });

  it("does not restart on onend after explicit stop", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    act(() => result.current.stopListening());
    expect(result.current.isListening).toBe(false);
  });

  it("calls abort on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    unmount();
    expect(mockInstance.abort).toHaveBeenCalled();
  });

  it("ignores startListening when already listening", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    const callCount = mockInstance.start.mock.calls.length;
    act(() => result.current.startListening());
    expect(mockInstance.start.mock.calls.length).toBe(callCount);
  });

  it("sets error for network errors", () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn(), onError }),
    );
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onerror?.({ error: "network" });
    });
    expect(result.current.error).toContain("network");
    expect(result.current.isListening).toBe(false);
  });
});
