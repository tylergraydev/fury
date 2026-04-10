/** Shared hook to extract resolved CSS custom property values for chart libraries (e.g. recharts). */

/* v8 ignore start -- SSR/null-safety fallbacks; getPropertyValue always returns a string in DOM */
export function useThemeColors() {
  const style = typeof document !== "undefined"
    ? getComputedStyle(document.documentElement)
    : null;
  return {
    accent: style?.getPropertyValue("--accent").trim() ?? "#58a6ff",
    success: style?.getPropertyValue("--success").trim() ?? "#4ade80",
    warning: style?.getPropertyValue("--warning").trim() ?? "#facc15",
    error: style?.getPropertyValue("--error").trim() ?? "#f87171",
    textMuted: style?.getPropertyValue("--text-muted").trim() ?? "#8b949e",
    textPrimary: style?.getPropertyValue("--text-primary").trim() ?? "#e6edf3",
    border: style?.getPropertyValue("--border").trim() ?? "#30363d",
    bgHover: style?.getPropertyValue("--bg-hover").trim() ?? "#1c2028",
    bgSurface: style?.getPropertyValue("--bg-surface").trim() ?? "#161b22",
  };
}
/* v8 ignore stop */
