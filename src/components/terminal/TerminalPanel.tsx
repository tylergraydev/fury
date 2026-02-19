import { useEffect, useRef, useState } from "react";
import { createTerminal, closeTerminal } from "../../lib/tauri";
import { TerminalView } from "./TerminalView";

interface TerminalPanelProps {
  workspaceId: string;
}

export function TerminalPanel({ workspaceId }: TerminalPanelProps) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    // Close previous terminal if workspace changed
    if (prevIdRef.current) {
      closeTerminal(prevIdRef.current).catch(() => {});
      prevIdRef.current = null;
    }

    setTerminalId(null);
    setError(null);

    createTerminal(workspaceId, 80, 24)
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
  }, [workspaceId]);

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
