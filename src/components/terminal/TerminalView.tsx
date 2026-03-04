import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen } from "@tauri-apps/api/event";
import {
  writeTerminal,
  resizeTerminal as resizeTerminalCmd,
} from "../../lib/tauri";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  terminalId: string;
}

export function TerminalView({ terminalId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    /* v8 ignore start -- defensive guard; ref is always assigned by React */
    if (!containerRef.current) return;
    /* v8 ignore stop */

    const term = new Terminal({
      theme: {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selectionBackground: "#252525",
        selectionForeground: "#ffffff",
        black: "#252525",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#b0b0b0",
        brightBlack: "#666666",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        import("@tauri-apps/plugin-shell").then(({ open }) => open(uri));
      }),
    );
    term.open(containerRef.current);

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = term;

    // Subscribe to backend output (base64-encoded)
    const unlistenPromise = listen<string>(
      `terminal-output:${terminalId}`,
      (event) => {
        try {
          const binary = atob(event.payload);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          term.write(bytes);
        } catch {
          // If decoding fails, write as plain text
          term.write(event.payload);
        }
      },
    );

    // Forward keystrokes to backend (base64-encoded)
    const onDataDisposable = term.onData((data: string) => {
      const encoded = btoa(data);
      writeTerminal(terminalId, encoded);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      resizeTerminalCmd(terminalId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
    };
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: "#000000" }}
    />
  );
}
