import { useEffect, useRef, useState } from "react";

export function ThinkingSpinner() {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(performance.now() - startRef.current);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const seconds = elapsed / 1000;
  const display =
    seconds < 60
      ? `${seconds.toFixed(1)}s`
      : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;

  return (
    <div className="mb-3 flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
      <div className="spinner-grid">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="spinner-dot"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <span className="text-sm tabular-nums">{display}</span>
    </div>
  );
}
