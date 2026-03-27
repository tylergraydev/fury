import { useEffect, useState } from "react";
import { Search } from "lucide-react";

interface Props {
  toolCallCount: number;
  startedAt?: number;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function ResearchingIndicator({ toolCallCount, startedAt }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <div
      className="mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <Search className="h-3.5 w-3.5 animate-pulse" style={{ color: "var(--text-muted)" }} />
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        Researching codebase...
        <span className="ml-1.5" style={{ color: "var(--text-secondary)" }}>
          {toolCallCount} operation{toolCallCount !== 1 ? "s" : ""}
        </span>
        {startedAt && elapsed > 0 && (
          <span className="ml-1.5">({formatElapsed(elapsed)})</span>
        )}
      </span>
    </div>
  );
}
