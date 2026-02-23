import { useCallback } from "react";
import { List, X } from "lucide-react";
import type { Turn } from "./MessageList";

interface Props {
  turns: Turn[];
  onClose: () => void;
}

export function ChatTOC({ turns, onClose }: Props) {
  const handleScrollToTurn = useCallback((turnIndex: number) => {
    const el = document.querySelector(`[data-turn-index="${turnIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      console.warn(
        `[ChatTOC] Could not find turn element with data-turn-index="${turnIndex}"`,
      );
    }
  }, []);

  return (
    <div
      className="absolute right-3 top-12 z-30 w-72 max-h-80 overflow-y-auto rounded-lg shadow-lg"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 flex items-center justify-between px-3 py-2"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          <List className="h-3.5 w-3.5" />
          Table of Contents
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Turn list */}
      <div className="py-1">
        {turns.map((turn, idx) => {
          const userText =
            turn.userMessage.displayText ??
            turn.userMessage.content
              .filter(
                (b): b is { type: "text"; text: string } => b.type === "text",
              )
              .map((b) => b.text)
              .join(" ");
          const preview =
            userText.length > 60 ? userText.slice(0, 57) + "..." : userText;

          return (
            <button
              key={turn.userMessage.id}
              onClick={() => handleScrollToTurn(idx)}
              className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              <span
                className="flex-shrink-0 font-mono text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                {idx + 1}.
              </span>
              <span className="truncate">{preview || "(empty)"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
