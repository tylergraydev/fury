import { useState, useRef, useCallback, useEffect } from "react";

// Web Speech API type definitions (not available in all TS DOM libs)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string; readonly confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseVoiceInputOptions {
  lang?: string;
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  error: string | null;
}

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  /* v8 ignore start -- window always defined in jsdom; neither SpeechRecognition API exists in jsdom */
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  /* v8 ignore stop */
}

function mapError(errorCode: string): string | null {
  switch (errorCode) {
    case "not-allowed":
      return "Microphone access denied. Please allow microphone access in system settings.";
    case "network":
      return "Voice recognition unavailable. Check your network connection.";
    case "no-speech":
      return null; // silence — restart silently
    case "aborted":
      return null; // user-initiated stop
    default:
      return "Voice input error. Please try again.";
  }
}

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
  const { lang = "en-US", onTranscript, onError } = options;
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const intentRef = useRef(false); // tracks whether user wants to be listening
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  const SpeechRecognition = getSpeechRecognitionClass();
  const isSupported = SpeechRecognition !== null;

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionClass();
    if (!Ctor) return;

    // If already listening, do nothing
    if (intentRef.current) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setInterimTranscript("");
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          onTranscriptRef.current(result[0].transcript);
          setInterimTranscript("");
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      const message = mapError(event.error);
      if (message) {
        setError(message);
        onErrorRef.current?.(message);
        // Stop on real errors
        intentRef.current = false;
        setIsListening(false);
        setInterimTranscript("");
      }
      // no-speech and aborted: handled by onend auto-restart
    };

    recognition.onend = () => {
      if (intentRef.current) {
        // User still wants to listen — auto-restart
        try {
          recognition.start();
        } catch {
          // If restart fails, give up
          intentRef.current = false;
          setIsListening(false);
          setInterimTranscript("");
        }
      } else {
        setIsListening(false);
        setInterimTranscript("");
      }
    };

    recognitionRef.current = recognition;
    intentRef.current = true;

    try {
      recognition.start();
    } catch {
      intentRef.current = false;
      setIsListening(false);
    }
  }, [lang]);

  const stopListening = useCallback(() => {
    intentRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const toggleListening = useCallback(() => {
    if (intentRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
    error,
  };
}
