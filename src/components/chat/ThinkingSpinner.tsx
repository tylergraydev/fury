import { useEffect, useRef, useState } from "react";

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

export function ThinkingSpinner({ startedAt }: { startedAt?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const fallbackRef = useRef(Date.now());
  const origin = startedAt ?? fallbackRef.current;

  useEffect(() => {
    setElapsed(Date.now() - origin);
    const id = setInterval(() => {
      setElapsed(Date.now() - origin);
    }, 100);
    return () => clearInterval(id);
  }, [origin]);

  return (
    <div data-testid="thinking-spinner" className="mb-3 flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
      <div className="spinner-grid">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="spinner-dot"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <span className="text-sm tabular-nums">{formatElapsed(elapsed)}</span>
    </div>
  );
}
