import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, ArrowUp, X } from "lucide-react";

interface QuestionCardProps {
  question: string;
  options?: string[];
  onAnswer: (answer: string) => void;
  onCancel?: () => void;
}

export function QuestionCard({ question, options, onAnswer, onCancel }: QuestionCardProps) {
  const [customText, setCustomText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = customText.trim();
    if (trimmed) {
      onAnswer(trimmed);
      setCustomText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // While the custom input is empty, number keys 1-9 pick the matching option.
    if (customText.length === 0 && options && options.length > 0) {
      const digit = parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= options.length) {
        e.preventDefault();
        onAnswer(options[digit - 1]);
        return;
      }
    }
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        backgroundColor: "color-mix(in srgb, var(--accent) 6%, var(--bg-primary))",
        borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
      }}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Question from agent
        </span>
      </div>

      {/* Question text */}
      <p className="mb-3 text-sm" style={{ color: "var(--text-primary)" }}>
        {question}
      </p>

      {/* Vertical option list with number badges */}
      {options && options.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {options.map((option, idx) => (
            <button
              key={option}
              onClick={() => onAnswer(option)}
              className="group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:opacity-90"
              style={{
                color: "var(--text-primary)",
                borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)",
              }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
                  color: "var(--accent)",
                }}
              >
                {idx + 1}
              </span>
              <span className="flex-1">{option}</span>
            </button>
          ))}
        </div>
      )}

      {/* Custom answer input + cancel */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            options && options.length > 0
              ? `Type a custom answer (or press 1-${options.length})...`
              : "Type a custom answer..."
          }
          rows={1}
          className="flex-1 resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!customText.trim()}
          aria-label="Send answer"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md transition-opacity disabled:opacity-30"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Cancel question"
            title="Cancel (Esc)"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border transition-colors hover:opacity-80"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
