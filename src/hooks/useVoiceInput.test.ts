import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceInput } from "./useVoiceInput";

interface MockInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

let mockInstance: MockInstance;
const OriginalSpeechRecognition = (globalThis as any).SpeechRecognition;
const OriginalWebkit = (globalThis as any).webkitSpeechRecognition;

function createMockInstance(): MockInstance {
  const inst: MockInstance = {
    continuous: false,
    interimResults: false,
    lang: "",
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(() => { inst.onstart?.(); }),
    stop: vi.fn(() => { inst.onend?.(); }),
    abort: vi.fn(),
  };
  mockInstance = inst;
  return inst;
}

describe("useVoiceInput", () => {
  beforeEach(() => {
    (globalThis as any).SpeechRecognition = vi.fn().mockImplementation(createMockInstance);
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

  it("gives up when auto-restart on onend throws", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    // Make start() throw on the next call (auto-restart)
    mockInstance.start.mockImplementationOnce(() => {
      throw new Error("cannot restart");
    });
    // Simulate onend while intentRef is still true (auto-restart path)
    act(() => {
      mockInstance.onend?.();
    });
    // Should give up and stop listening
    expect(result.current.isListening).toBe(false);
  });

  it("handles start() throwing on initial startListening", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    // After the hook is created, override SpeechRecognition so start() throws
    // The hook calls getSpeechRecognitionClass() inside startListening
    (globalThis as any).SpeechRecognition = vi.fn(function (this: any) {
      const inst = createMockInstance();
      Object.assign(this, inst);
      this.start = vi.fn(() => {
        throw new Error("not allowed");
      });
    });
    act(() => result.current.startListening());
    // Should not be listening since start() threw
    expect(result.current.isListening).toBe(false);
  });

  it("reports isSupported false when no SpeechRecognition", () => {
    delete (globalThis as any).SpeechRecognition;
    delete (globalThis as any).webkitSpeechRecognition;
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    expect(result.current.isSupported).toBe(false);
  });

  it("startListening is no-op when not supported", () => {
    delete (globalThis as any).SpeechRecognition;
    delete (globalThis as any).webkitSpeechRecognition;
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(false);
  });

  it("uses webkitSpeechRecognition as fallback", () => {
    delete (globalThis as any).SpeechRecognition;
    (globalThis as any).webkitSpeechRecognition = vi.fn().mockImplementation(createMockInstance);
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn() }),
    );
    expect(result.current.isSupported).toBe(true);
    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(true);
  });

  it("handles aborted error silently", () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn(), onError }),
    );
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onerror?.({ error: "aborted" });
    });
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("maps unknown error codes to generic message", () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: vi.fn(), onError }),
    );
    act(() => result.current.startListening());
    act(() => {
      mockInstance.onerror?.({ error: "service-not-allowed" });
    });
    expect(result.current.error).toBe("Voice input error. Please try again.");
    expect(onError).toHaveBeenCalledWith("Voice input error. Please try again.");
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
