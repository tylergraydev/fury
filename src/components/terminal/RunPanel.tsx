import { useEffect, useRef } from "react";
import { useScriptStore } from "../../stores/scriptStore";

const EMPTY_OUTPUT: string[] = [];

interface RunPanelProps {
  workspaceId: string;
}

export function RunPanel({ workspaceId }: RunPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const output = useScriptStore(
    (s) => s.output[`${workspaceId}:run`] ?? EMPTY_OUTPUT,
  );
  const running = useScriptStore(
    (s) => s.running[`${workspaceId}:run`] ?? false,
  );
  const exitCode = useScriptStore(
    (s) => s.exitCodes[`${workspaceId}:run`],
  );

  useEffect(() => {
    const store = useScriptStore.getState();
    store.subscribe(workspaceId, "run");
    return () => useScriptStore.getState().unsubscribe(workspaceId, "run");
  }, [workspaceId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Controls */}
      <div
        className="flex items-center gap-2 px-3 py-1 text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ color: "var(--text-muted)" }}>Run Script</span>
        <div className="ml-auto flex items-center gap-2">
          {exitCode !== undefined && exitCode !== null && !running && (
            <span
              style={{
                color:
                  exitCode === 0 ? "var(--success)" : "var(--error)",
              }}
            >
              Exit: {exitCode}
            </span>
          )}
          {running && (
            <span
              className="animate-pulse"
              style={{ color: "var(--success)" }}
            >
              Running
            </span>
          )}
          <button
            onClick={() => useScriptStore.getState().clearOutput(workspaceId, "run")}
            className="rounded px-2 py-0.5"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
          >
            Clear
          </button>
          {running ? (
            <button
              onClick={() => useScriptStore.getState().stopScript(workspaceId, "run")}
              className="rounded px-2 py-0.5"
              style={{
                backgroundColor: "var(--error)",
                color: "var(--bg-primary)",
              }}
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => useScriptStore.getState().runScript(workspaceId, "run")}
              className="rounded px-2 py-0.5"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
              }}
            >
              Start
            </button>
          )}
        </div>
      </div>

      {/* Output log */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-2 font-mono text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        {output.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>
            No output yet. Click Start to run the script.
          </span>
        ) : (
          output.map((line, i) => (
            <div
              key={i}
              style={{
                color: line.startsWith("[stderr]")
                  ? "var(--error)"
                  : undefined,
              }}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
