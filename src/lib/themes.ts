export type ThemeName = "blend" | "midnight" | "github";

interface ThemeVars {
  "--bg-primary": string;
  "--bg-secondary": string;
  "--bg-surface": string;
  "--bg-hover": string;
  "--text-primary": string;
  "--text-secondary": string;
  "--text-muted": string;
  "--border": string;
  "--accent": string;
  "--accent-hover": string;
  "--accent-green": string;
  "--accent-purple": string;
  "--accent-orange": string;
  "--success": string;
  "--warning": string;
  "--error": string;
  "--composer-border": string;
}

const themes: Record<ThemeName, ThemeVars> = {
  // Blend: black base + Figma panel colors + blue accent
  blend: {
    "--bg-primary": "#000000",
    "--bg-secondary": "#0d1117",
    "--bg-surface": "#161b22",
    "--bg-hover": "#1c2128",
    "--text-primary": "#f0f6fc",
    "--text-secondary": "#b0b0b0",
    "--text-muted": "#6e7681",
    "--border": "#30363d",
    "--accent": "#3b82f6",
    "--accent-hover": "#2563eb",
    "--accent-green": "#22c55e",
    "--accent-purple": "#a855f7",
    "--accent-orange": "#f97316",
    "--success": "#4ade80",
    "--warning": "#facc15",
    "--error": "#f87171",
    "--composer-border": "#8B6E5A",
  },

  // Midnight: original Fury pure-black theme
  midnight: {
    "--bg-primary": "#000000",
    "--bg-secondary": "#0a0a0a",
    "--bg-surface": "#1a1a1a",
    "--bg-hover": "#252525",
    "--text-primary": "#ffffff",
    "--text-secondary": "#b0b0b0",
    "--text-muted": "#666666",
    "--border": "#262626",
    "--accent": "#ffffff",
    "--accent-hover": "#d4d4d4",
    "--accent-green": "#4ade80",
    "--accent-purple": "#a855f7",
    "--accent-orange": "#f97316",
    "--success": "#4ade80",
    "--warning": "#facc15",
    "--error": "#f87171",
    "--composer-border": "#8B6E5A",
  },

  // GitHub: full GitHub dark theme from Figma
  github: {
    "--bg-primary": "#0d1117",
    "--bg-secondary": "#161b22",
    "--bg-surface": "#1c2128",
    "--bg-hover": "#262c36",
    "--text-primary": "#f0f6fc",
    "--text-secondary": "#c9d1d9",
    "--text-muted": "#6e7681",
    "--border": "#30363d",
    "--accent": "#3b82f6",
    "--accent-hover": "#2563eb",
    "--accent-green": "#22c55e",
    "--accent-purple": "#a855f7",
    "--accent-orange": "#f97316",
    "--success": "#4ade80",
    "--warning": "#facc15",
    "--error": "#f87171",
    "--composer-border": "#8B6E5A",
  },
};

export function applyTheme(name: ThemeName): void {
  const vars = themes[name];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export function getThemeNames(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}
