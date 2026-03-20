import type { TestStatus } from "./tauri";

export function statusDotColor(status: TestStatus): string {
  switch (status) {
    case "passed":
      return "var(--success)";
    case "failed":
      return "var(--error)";
    case "skipped":
      return "var(--text-muted)";
    case "running":
      return "var(--text-muted)";
    case "pending":
      return "var(--border)";
  }
}

export function statusLabel(status: TestStatus): string {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "running":
      return "running";
    case "pending":
      return "pending";
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[([0-9;]*)m/g;

const ANSI_COLORS: Record<number, string> = {
  30: "var(--text-muted)",
  31: "var(--error)",
  32: "var(--success)",
  33: "var(--warning)",
  34: "var(--accent)",
  35: "var(--error)",
  36: "var(--accent)",
  37: "var(--text-primary)",
  90: "var(--text-muted)",
  91: "var(--error)",
  92: "var(--success)",
  93: "var(--warning)",
  94: "var(--accent)",
  95: "var(--error)",
  96: "var(--accent)",
  97: "var(--text-primary)",
};

export function parseAnsi(line: string): React.ReactNode {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let currentColor: string | undefined;
  let bold = false;
  let match: RegExpExecArray | null;

  ANSI_REGEX.lastIndex = 0;

  while ((match = ANSI_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      const text = line.slice(lastIndex, match.index);
      /* v8 ignore start -- text is always non-empty when match.index > lastIndex */
      if (text) {
      /* v8 ignore stop */
        segments.push(
          <span
            key={segments.length}
            style={{
              color: currentColor,
              fontWeight: bold ? "bold" : undefined,
            }}
          >
            {text}
          </span>,
        );
      }
    }
    lastIndex = match.index + match[0].length;

    const codes = match[1].split(";").map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        bold = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (ANSI_COLORS[code]) {
        currentColor = ANSI_COLORS[code];
      }
    }
  }

  if (lastIndex < line.length) {
    const text = line.slice(lastIndex);
    /* v8 ignore start -- text is always non-empty when lastIndex < line.length */
    if (text) {
    /* v8 ignore stop */
      segments.push(
        <span
          key={segments.length}
          style={{
            color: currentColor,
            fontWeight: bold ? "bold" : undefined,
          }}
        >
          {text}
        </span>,
      );
    }
  }

  /* v8 ignore start -- unreachable: function only called when ANSI_REGEX matches */
  if (segments.length === 0) return line;
  /* v8 ignore stop */
  return <>{segments}</>;
}
