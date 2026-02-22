import { useEffect, useRef, useState } from "react";
import { createTerminal, createRepoTerminal, closeTerminal } from "../../lib/tauri";
import { TerminalView } from "./TerminalView";
import type { SidebarContext } from "../../App";

interface TerminalPanelProps {
  context: SidebarContext;
}

export function TerminalPanel({ context }: TerminalPanelProps) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    setTerminalId(null);
    setError(null);

    const terminalPromise = context.type === "workspace"
      ? createTerminal(context.id, 80, 24)
      : createRepoTerminal(context.id, 80, 24);

    terminalPromise
      .then((id) => {
        if (active) {
          setTerminalId(id);
          prevIdRef.current = id;
        } else {
          closeTerminal(id).catch(() => {});
        }
      })
      .catch((err) => {
        if (active) {
          setError(String(err));
        }
      });

    return () => {
      active = false;
      if (prevIdRef.current) {
        closeTerminal(prevIdRef.current).catch(() => {});
        prevIdRef.current = null;
      }
    };
  }, [context.type, context.id]);

  if (error) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--error)" }}
      >
        Failed to create terminal: {error}
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
