import { useEffect, useRef } from "react";
import { useScriptStore } from "../../stores/scriptStore";

interface Props {
  workspaceId: string;
}

export function SetupPanel({ workspaceId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const output = useScriptStore((s) => s.getOutput(workspaceId, "setup"));
  const running = useScriptStore((s) => s.isRunning(workspaceId, "setup"));
  const exitCode = useScriptStore(
    (s) => s.exitCodes[`${workspaceId}:setup`],
  );
  const { subscribe, unsubscribe, runScript, stopScript, clearOutput } =
    useScriptStore();

  useEffect(() => {
    subscribe(workspaceId, "setup");
    return () => unsubscribe(workspaceId, "setup");
  }, [workspaceId, subscribe, unsubscribe]);

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
        <span style={{ color: "var(--text-muted)" }}>Setup Script</span>
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
            onClick={() => clearOutput(workspaceId, "setup")}
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
              onClick={() => stopScript(workspaceId, "setup")}
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
              onClick={() => runScript(workspaceId, "setup")}
              className="rounded px-2 py-0.5"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
              }}
            >
              Run Setup
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
            No output yet. Click Run Setup to execute the setup script.
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
