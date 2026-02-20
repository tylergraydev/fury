import { useEffect, useRef } from "react";
import { useScriptStore } from "../../stores/scriptStore";
import type { SidebarContext } from "../../App";

const EMPTY_OUTPUT: string[] = [];

interface RunPanelProps {
  context: SidebarContext;
}

export function RunPanel({ context }: RunPanelProps) {
  const contextId = context.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const output = useScriptStore(
    (s) => s.output[`${contextId}:run`] ?? EMPTY_OUTPUT,
  );
  const running = useScriptStore(
    (s) => s.running[`${contextId}:run`] ?? false,
  );
  const exitCode = useScriptStore(
    (s) => s.exitCodes[`${contextId}:run`],
  );

  useEffect(() => {
    const store = useScriptStore.getState();
    store.subscribe(contextId, "run");
    return () => useScriptStore.getState().unsubscribe(contextId, "run");
  }, [contextId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = () => {
    const store = useScriptStore.getState();
    if (context.type === "workspace") {
      store.runScript(contextId, "run");
    } else {
      store.runRepoScript(contextId, "run");
    }
  };

  const handleStop = () => {
    const store = useScriptStore.getState();
    if (context.type === "workspace") {
      store.stopScript(contextId, "run");
    } else {
      store.stopRepoScript(contextId, "run");
    }
  };

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
            onClick={() => useScriptStore.getState().clearOutput(contextId, "run")}
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
              onClick={handleStop}
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
              onClick={handleRun}
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
