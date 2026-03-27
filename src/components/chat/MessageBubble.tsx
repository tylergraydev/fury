import { memo, useState } from "react";
import {
  FileText,
  ChevronRight,
  ChevronDown,
  RotateCw,
  ClipboardCheck,
} from "lucide-react";
import type { ChatMessage, ContentBlock } from "../../lib/tauri";
import { normalizeToolName, getToolConfig, getToolSummary, formatToolDetail } from "../../lib/toolUtils";
import { MarkdownContent } from "./MarkdownContent";
import { AttachmentImage } from "./AttachmentImage";
import { InlineImageGroup } from "./InlineImageGroup";
import { ResponseMetadataRow } from "./ResponseMetadataRow";

// --- Attachment parsing ---

interface ParsedAttachment {
  type: "image" | "file";
  path: string;
  name: string;
}

function parseAttachments(text: string): { attachments: ParsedAttachment[]; remainingText: string } {
  const re = /\[Attached (image|file): ([^\]]+)\]/g;
  const attachments: ParsedAttachment[] = [];
  for (const match of text.matchAll(re)) {
    const kind = match[1] as "image" | "file";
    const path = match[2];
    /* v8 ignore start -- .pop() always returns a string on non-empty split result */
    attachments.push({ type: kind, path, name: path.split(/[/\\]/).pop() ?? path });
    /* v8 ignore stop */
  }
  const remainingText = text.replace(re, "").trim();
  return { attachments, remainingText };
}

// --- Grouping logic ---

interface ToolPair {
  use: { id: string; name: string; input: unknown };
  result: { content: string } | null;
}

type RenderGroup =
  | { kind: "text"; blocks: Array<ContentBlock & { type: "text" }> }
  | { kind: "tools"; pairs: ToolPair[] }
  | { kind: "images"; blocks: Array<ContentBlock & { type: "image" }> };

function groupContentBlocks(blocks: ContentBlock[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let currentToolPairs: ToolPair[] = [];
  let currentTextBlocks: Array<ContentBlock & { type: "text" }> = [];
  let currentImageBlocks: Array<ContentBlock & { type: "image" }> = [];

  const flushText = () => {
    if (currentTextBlocks.length > 0) {
      groups.push({ kind: "text", blocks: currentTextBlocks });
      currentTextBlocks = [];
    }
  };

  const flushTools = () => {
    if (currentToolPairs.length > 0) {
      groups.push({ kind: "tools", pairs: currentToolPairs });
      currentToolPairs = [];
    }
  };

  const flushImages = () => {
    if (currentImageBlocks.length > 0) {
      groups.push({ kind: "images", blocks: currentImageBlocks });
      currentImageBlocks = [];
    }
  };

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        flushTools();
        flushImages();
        currentTextBlocks.push(block);
        break;
      case "toolUse":
        flushText();
        flushImages();
        currentToolPairs.push({
          use: { id: block.id, name: block.name, input: block.input },
          result: null,
        });
        break;
      case "toolResult": {
        // Attach to the last tool pair that doesn't have a result yet
        const pending = [...currentToolPairs].reverse().find((p) => p.result === null);
        if (pending) {
          pending.result = { content: block.content };
        }
        break;
      }
      case "image":
        flushText();
        flushTools();
        currentImageBlocks.push(block);
        break;
    }
  }

  flushText();
  flushTools();
  flushImages();
  return groups;
}

// --- Components ---

interface Props {
  message: ChatMessage;
  onRetry?: () => void;
  contextId?: string;
  contextType?: "workspace" | "repo";
  isPlanMessage?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, onRetry, contextId, contextType, isPlanMessage }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const groups = groupContentBlocks(message.content);

  // User messages: bubble with no avatar
  if (isUser) {
    // Parse attachments from text blocks
    const allText = groups
      .filter((g): g is RenderGroup & { kind: "text" } => g.kind === "text")
      .flatMap((g) => g.blocks.map((b) => b.text))
      .join("\n");
    const { attachments, remainingText } = parseAttachments(allText);

    return (
      <div className="mb-4 flex justify-end">
        <div
          className="max-w-[80%] rounded-lg px-4 py-3 text-[15px]"
          style={{
            backgroundColor: "var(--accent)",
            color: "#1e1e2e",
          }}
        >
          {/* Render image attachments */}
          {attachments.filter((a) => a.type === "image").map((a, i) => (
            <AttachmentImage key={`img-${i}`} path={a.path} name={a.name} />
          ))}
          {/* Render file attachments as badges */}
          {attachments.filter((a) => a.type === "file").map((a, i) => (
            <div
              key={`file-${i}`}
              className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[12px]"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{a.name}</span>
            </div>
          ))}
          {/* Render remaining text (or display label for slash commands) */}
          {(message.displayText ?? remainingText) && (
            <div className="whitespace-pre-wrap break-words">
              {message.displayText ?? remainingText}
            </div>
          )}
        </div>
      </div>
    );
  }

  // System messages: keep pink-tinted bubble, no avatar
  if (isSystem) {
    const textContent = message.content
      .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const isError = textContent.toLowerCase().includes("error") ||
      textContent.toLowerCase().includes("rate limit") ||
      textContent.toLowerCase().includes("timed out");

    return (
      <div className="mb-4">
        <div
          className="inline-flex max-w-[80%] items-center gap-2 rounded-lg px-4 py-3 text-[15px]"
          style={{
            backgroundColor: "color-mix(in srgb, var(--error) 10%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          <div className="whitespace-pre-wrap break-words">
            {groups.map((group, i) =>
              group.kind === "text" ? (
                group.blocks.map((block, j) => (
                  <span key={`${i}-${j}`}>{block.text}</span>
                ))
              ) : null,
            )}
          </div>
          {isError && onRetry && (
            <button
              onClick={onRetry}
              className="flex-shrink-0 rounded p-1 transition-colors hover:bg-white/10"
              style={{ color: "var(--text-muted)" }}
              title="Retry last message"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Assistant messages: plain output, no bubble, no avatar
  // Plan messages get a distinct card wrapper
  if (isPlanMessage) {
    return (
      <div
        className="mb-3 rounded-xl p-5 text-[15px]"
        style={{
          color: "var(--text-primary)",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid color-mix(in srgb, var(--success) 20%, var(--border))",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-medium" style={{ color: "var(--success)" }}>
          <ClipboardCheck className="h-4 w-4" />
          <span>Implementation Plan</span>
        </div>
        {groups.map((group, i) => {
          if (group.kind === "text") {
            return group.blocks.map((block, j) => (
              <div key={`${i}-${j}`} className="mb-1 break-words">
                <MarkdownContent content={block.text} contextId={contextId} contextType={contextType} />
              </div>
            ));
          }
          if (group.kind === "images") {
            return <InlineImageGroup key={i} blocks={group.blocks} />;
          }
          return <ToolCallList key={i} pairs={group.pairs} />;
        })}
        {message.metadata && <ResponseMetadataRow metadata={message.metadata} />}
      </div>
    );
  }

  return (
    <div className="mb-3 text-[15px]" style={{ color: "var(--text-primary)" }}>
      {groups.map((group, i) => {
        if (group.kind === "text") {
          return group.blocks.map((block, j) => (
            <div key={`${i}-${j}`} className="mb-1 break-words">
              <MarkdownContent content={block.text} contextId={contextId} contextType={contextType} />
            </div>
          ));
        }
        if (group.kind === "images") {
          return <InlineImageGroup key={i} blocks={group.blocks} />;
        }
        return <ToolCallList key={i} pairs={group.pairs} />;
      })}
      {message.metadata && <ResponseMetadataRow metadata={message.metadata} />}
    </div>
  );
});


function ToolCallList({ pairs }: { pairs: ToolPair[] }) {
  return (
    <div className="my-1.5 space-y-0.5">
      {pairs.map((pair) => (
        <ToolRow key={pair.use.id} pair={pair} />
      ))}
    </div>
  );
}

function ToolRow({ pair }: { pair: ToolPair }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const normalized = normalizeToolName(pair.use.name);
  const { icon, color } = getToolConfig(normalized);
  const summary = getToolSummary(pair.use.name, pair.use.input, pair.result);

  return (
    <div>
      <button
        onClick={() => setDetailOpen(!detailOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors"
        style={{
          backgroundColor: isHovered ? "var(--bg-hover)" : "transparent",
        }}
      >
        {(detailOpen || isHovered) ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        )}
        <span
          className="inline-flex flex-shrink-0 items-center gap-1.5 text-xs font-medium"
          style={{ color }}
        >
          {icon}
          <span>{summary.label}</span>
        </span>
        {summary.badges.map((badge, i) => (
          <span
            key={i}
            className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: badge.color ?? "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {badge.text}
          </span>
        ))}
        {summary.detail && (
          <span
            className="truncate text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {summary.detail}
          </span>
        )}
      </button>

      {detailOpen && (
        <div
          className="mb-1 ml-5 mt-0.5 rounded-md border px-3 py-2"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}
        >
          {formatToolDetail(normalized, pair.use.input, pair.result)}
        </div>
      )}
    </div>
  );
}
