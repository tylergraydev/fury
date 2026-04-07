import { useCallback, useEffect, useRef, useState } from "react";
import { useInlineEditStore } from "../../stores/inlineEditStore";

interface Props {
  workspaceId: string;
  fullFileContent: string;
}

export function InlineEditWidget({ workspaceId, fullFileContent }: Props) {
  const session = useInlineEditStore((s) => s.session);
  const submitInstruction = useInlineEditStore((s) => s.submitInstruction);
  const cancelSession = useInlineEditStore((s) => s.cancelSession);
  const acceptEdit = useInlineEditStore((s) => s.acceptEdit);
  const rejectEdit = useInlineEditStore((s) => s.rejectEdit);

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input when widget appears
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!session) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (session.status === "previewing") {
          rejectEdit();
        } else {
          cancelSession();
        }
      } else if (e.key === "Enter" && session.status === "prompting") {
        e.preventDefault();
        e.stopPropagation();
        if (input.trim()) {
          submitInstruction(workspaceId, input.trim(), fullFileContent);
        }
      } else if (e.key === "Tab" && session.status === "previewing") {
        e.preventDefault();
        e.stopPropagation();
        acceptEdit();
      }
    },
    [
      session,
      input,
      workspaceId,
      fullFileContent,
      submitInstruction,
      cancelSession,
      acceptEdit,
      rejectEdit,
    ],
  );

  if (!session) return null;

  return (
    <div
      className="flex items-center gap-1.5 rounded border px-2 py-1"
      style={{
        background: "var(--bg-primary)",
        borderColor: "var(--border-primary)",
        width: 360,
        fontSize: 12,
      }}
      onKeyDown={handleKeyDown}
    >
      {session.status === "prompting" && (
        <>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the edit..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <span
            className="shrink-0 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            Enter ↵
          </span>
        </>
      )}

      {session.status === "generating" && (
        <div className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            style={{ color: "var(--accent)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Generating edit...
          </span>
          <span
            className="cursor-pointer text-[10px]"
            style={{ color: "var(--text-muted)" }}
            onClick={cancelSession}
          >
            Esc to cancel
          </span>
        </div>
      )}

      {session.status === "previewing" && (
        <div className="flex items-center gap-3 py-0.5">
          <span
            className="cursor-pointer text-xs"
            style={{ color: "var(--text-muted)" }}
            onClick={acceptEdit}
          >
            <kbd className="rounded border px-1 py-0.5 text-[10px]" style={{ borderColor: "var(--border-primary)" }}>Tab</kbd>{" "}
            Accept
          </span>
          <span
            className="cursor-pointer text-xs"
            style={{ color: "var(--text-muted)" }}
            onClick={rejectEdit}
          >
            <kbd className="rounded border px-1 py-0.5 text-[10px]" style={{ borderColor: "var(--border-primary)" }}>Esc</kbd>{" "}
            Reject
          </span>
        </div>
      )}

      {session.error && (
        <span className="ml-1 text-[10px]" style={{ color: "var(--error)" }}>
          {session.error}
        </span>
      )}
    </div>
  );
}
