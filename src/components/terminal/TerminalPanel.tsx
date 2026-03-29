import { useCallback, useEffect, useRef, useState } from "react";
import { createTerminal, createRepoTerminal, closeTerminal } from "../../lib/tauri";
import { TerminalView } from "./TerminalView";
import type { SidebarContext } from "../../App";

interface TerminalPanelProps {
  context: SidebarContext;
}

/** How long to wait for the backend to create a PTY before showing a timeout error. */
const TERMINAL_CREATE_TIMEOUT_MS = 10_000;

export function TerminalPanel({ context }: TerminalPanelProps) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevIdRef = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let active = true;

    setTerminalId(null);
    setError(null);

    // Defer terminal creation by one frame to avoid blocking the initial
    // layout paint with a synchronous IPC call.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const rafId = requestAnimationFrame(() => {
      const terminalPromise = context.type === "workspace"
        ? createTerminal(context.id, 80, 24)
        : createRepoTerminal(context.id, 80, 24);

      // Race the IPC call against a timeout so the UI doesn't hang indefinitely
      // if the backend never responds (e.g. mutex deadlock, invalid worktree).
      timeoutId = setTimeout(() => {
        if (active) {
          setError("Terminal creation timed out. The backend did not respond within 10 seconds.");
        }
      }, TERMINAL_CREATE_TIMEOUT_MS);

      terminalPromise
        .then((id) => {
          clearTimeout(timeoutId);
          if (active) {
            setTerminalId(id);
            prevIdRef.current = id;
          } else {
            closeTerminal(id).catch(() => {});
          }
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          if (active) {
            setError(String(err));
          }
        });
    });

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (prevIdRef.current) {
        closeTerminal(prevIdRef.current).catch(() => {});
        prevIdRef.current = null;
      }
    };
  }, [context.type, context.id, retryCount]);

  if (error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 text-xs"
      >
        <span style={{ color: "var(--error)" }}>
          Failed to create terminal: {error}
        </span>
        <button
          type="button"
          onClick={retry}
          className="rounded px-3 py-1 text-xs"
          style={{
            background: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!terminalId) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Starting terminal...
      </div>
    );
  }

  return <TerminalView terminalId={terminalId} />;
}
