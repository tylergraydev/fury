import { useState } from "react";
import type { ChatMessage, ContentBlock } from "../../lib/tauri";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? "ml-8" : "mr-8"}`}
        style={{
          backgroundColor: isUser
            ? "var(--accent)"
            : isSystem
              ? "rgba(243, 139, 168, 0.1)"
              : "var(--bg-surface)",
          color: isUser ? "#1e1e2e" : "var(--text-primary)",
        }}
      >
        {message.content.map((block, i) => (
          <ContentBlockView key={i} block={block} />
        ))}
      </div>
    </div>
  );
}

function ContentBlockView({
  block,
}: {
  block: ContentBlock;
}) {
  if (block.type === "text") {
    return (
      <div className="whitespace-pre-wrap break-words">{block.text}</div>
    );
  }

  if (block.type === "toolUse") {
    return <ToolUseView name={block.name} input={block.input} />;
  }

  if (block.type === "toolResult") {
    return <ToolResultView content={block.content} />;
  }

  return null;
}

function ToolUseView({ name, input }: { name: string; input: unknown }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="my-1 rounded border text-xs"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        <span
          className="text-[10px]"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          ▶
        </span>
        <span className="font-mono font-medium" style={{ color: "var(--accent)" }}>
          {name}
        </span>
      </button>
      {expanded && (
        <pre
          className="overflow-x-auto border-t px-2 py-1.5 font-mono text-[11px]"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {typeof input === "string"
            ? input
            : JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultView({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview =
    content.length > 100 ? content.slice(0, 100) + "..." : content;

  return (
    <div
      className="my-1 rounded border text-xs"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        <span
          className="text-[10px]"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          ▶
        </span>
        <span className="font-mono">Result</span>
        {!expanded && (
          <span className="truncate" style={{ color: "var(--text-muted)" }}>
            {preview}
          </span>
        )}
      </button>
      {expanded && (
        <pre
          className="overflow-x-auto border-t px-2 py-1.5 font-mono text-[11px]"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
