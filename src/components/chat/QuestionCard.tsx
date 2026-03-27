import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, ArrowUp } from "lucide-react";

interface QuestionCardProps {
  question: string;
  options?: string[];
  onAnswer: (answer: string) => void;
}

export function QuestionCard({ question, options, onAnswer }: QuestionCardProps) {
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

      {/* Option pills */}
      {options && options.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => onAnswer(option)}
              className="rounded-full border px-3 py-1 text-xs transition-colors hover:opacity-80"
              style={{
                color: "var(--accent)",
                borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {/* Custom answer input */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a custom answer..."
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
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md transition-opacity disabled:opacity-30"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
