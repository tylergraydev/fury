export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "": 1_000_000,           // Default = Opus 4.6
  "opus": 1_000_000,       // Claude Opus 4.6
  "sonnet": 200_000,       // Claude Sonnet
  "haiku": 200_000,        // Claude Haiku
  "gpt-5.1-codex": 200_000,
  "o3": 200_000,
  "o4-mini": 128_000,
  "gpt-4.1": 128_000,
};

export const DEFAULT_CONTEXT_WINDOW = 200_000;

export function getContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}
