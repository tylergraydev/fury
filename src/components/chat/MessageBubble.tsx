import { useState } from "react";
import type { ChatMessage, ContentBlock } from "../../lib/tauri";

// --- Grouping logic ---

interface ToolPair {
  use: { id: string; name: string; input: unknown };
  result: { content: string } | null;
}

type RenderGroup =
  | { kind: "text"; blocks: Array<ContentBlock & { type: "text" }> }
  | { kind: "tools"; pairs: ToolPair[] };

function groupContentBlocks(blocks: ContentBlock[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let currentToolPairs: ToolPair[] = [];
  let currentTextBlocks: Array<ContentBlock & { type: "text" }> = [];

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

  for (const block of blocks) {
    if (block.type === "text") {
      flushTools();
      currentTextBlocks.push(block);
    } else if (block.type === "toolUse") {
      flushText();
      currentToolPairs.push({
        use: { id: block.id, name: block.name, input: block.input },
        result: null,
      });
    } else if (block.type === "toolResult") {
      // Attach to the last tool pair that doesn't have a result yet
      const pending = [...currentToolPairs].reverse().find((p) => p.result === null);
      if (pending) {
        pending.result = { content: block.content };
      }
    }
  }

  flushText();
  flushTools();
  return groups;
}

// --- Tool name normalization & summaries ---

function normalizeToolName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("read")) return "Read";
  if (lower.includes("edit")) return "Edit";
  if (lower.includes("write")) return "Write";
  if (lower.includes("bash") || lower.includes("command") || lower.includes("execute")) return "Bash";
  if (lower.includes("grep") || lower.includes("search_code")) return "Grep";
  if (lower.includes("glob") || lower.includes("find_file")) return "Glob";
  if (lower.includes("task")) return "Task";
  if (lower.includes("notebook")) return "Notebook";
  if (lower.includes("web")) return "Web";
  return name;
}

const TOOL_ICONS: Record<string, string> = {
  Read: "\uD83D\uDCC4",
  Edit: "\u270F\uFE0F",
  Write: "\uD83D\uDCDD",
  Bash: ">_",
  Grep: "\uD83D\uDD0D",
  Glob: "\uD83D\uDCC1",
  Task: "\u26A1",
  Notebook: "\uD83D\uDCD3",
  Web: "\uD83C\uDF10",
};

function getToolIcon(normalized: string): string {
  return TOOL_ICONS[normalized] ?? "\u2022";
}

function shortenPath(filepath: string): string {
  const parts = filepath.split("/");
  if (parts.length <= 2) return filepath;
  return parts.slice(-2).join("/");
}

function getToolSummary(name: string, input: unknown): string {
  const normalized = normalizeToolName(name);
  const inp = input as Record<string, unknown> | null;
  if (!inp || typeof inp !== "object") return "";

  switch (normalized) {
    case "Read": {
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      return fp ? shortenPath(fp) : "";
    }
    case "Edit": {
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      return fp ? shortenPath(fp) : "";
    }
    case "Write": {
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      return fp ? shortenPath(fp) : "";
    }
    case "Bash": {
      const cmd = (inp.command ?? inp.cmd ?? "") as string;
      return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
    }
    case "Grep": {
      const pat = (inp.pattern ?? inp.query ?? "") as string;
      return pat ? `"${pat}"` : "";
    }
    case "Glob": {
      const pat = (inp.pattern ?? "") as string;
      return pat || "";
    }
    case "Task": {
      const desc = (inp.description ?? inp.prompt ?? "") as string;
      return desc.length > 50 ? desc.slice(0, 47) + "..." : desc;
    }
    default: {
      const firstVal = Object.values(inp)[0];
      if (typeof firstVal === "string") {
        return firstVal.length > 50 ? firstVal.slice(0, 47) + "..." : firstVal;
      }
      return "";
    }
  }
}

// --- Components ---

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const groups = groupContentBlocks(message.content);

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
        {groups.map((group, i) =>
          group.kind === "text" ? (
            group.blocks.map((block, j) => (
              <div key={`${i}-${j}`} className="whitespace-pre-wrap break-words">
                {block.text}
              </div>
            ))
          ) : (
            <ToolCallGroup key={i} pairs={group.pairs} />
          ),
        )}
      </div>
    </div>
  );
}

function ToolCallGroup({ pairs }: { pairs: ToolPair[] }) {
  const [expanded, setExpanded] = useState(false);

  // Collect unique normalized tool names in order of first appearance
  const seenNames = new Map<string, number>();
  for (const pair of pairs) {
    const norm = normalizeToolName(pair.use.name);
    seenNames.set(norm, (seenNames.get(norm) ?? 0) + 1);
  }
  const uniqueNames = [...seenNames.keys()];

  const callCount = pairs.length;

  return (
    <div
      className="my-1.5 rounded border text-xs"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        <span
          className="flex-shrink-0 text-[10px]"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            display: "inline-block",
          }}
        >
          {"\u25B6"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {callCount} tool call{callCount !== 1 ? "s" : ""}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {uniqueNames.map((name) => {
            const count = seenNames.get(name) ?? 0;
            return (
              <span
                key={name}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-muted)",
                }}
              >
                <span>{getToolIcon(name)}</span>
                {count > 1 && <span>{count}</span>}
              </span>
            );
          })}
        </span>
      </button>

      {/* Expanded: individual tool entries */}
      {expanded && (
        <div
          className="border-t"
          style={{ borderColor: "var(--border)" }}
        >
          {pairs.map((pair) => (
            <ToolEntry key={pair.use.id} pair={pair} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolEntry({ pair }: { pair: ToolPair }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const normalized = normalizeToolName(pair.use.name);
  const icon = getToolIcon(normalized);
  const summary = getToolSummary(pair.use.name, pair.use.input);

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <button
        onClick={() => setDetailOpen(!detailOpen)}
        className="flex w-full items-center gap-2 px-2 py-1 text-left"
        style={{ color: "var(--text-secondary)" }}
      >
        <span
          className="flex-shrink-0 text-[9px]"
          style={{
            transform: detailOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            display: "inline-block",
            color: "var(--text-muted)",
          }}
        >
          {"\u25B6"}
        </span>
        <span
          className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--accent)",
          }}
        >
          <span>{icon}</span>
          <span>{normalized}</span>
        </span>
        <span
          className="truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          {summary}
        </span>
      </button>

      {detailOpen && (
        <div
          className="border-t px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="mb-1 text-[10px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Input
          </div>
          <pre
            className="overflow-x-auto font-mono text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {typeof pair.use.input === "string"
              ? pair.use.input
              : JSON.stringify(pair.use.input, null, 2)}
          </pre>
          {pair.result && (
            <>
              <div
                className="mb-1 mt-2 text-[10px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Result
              </div>
              <pre
                className="max-h-40 overflow-auto font-mono text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {pair.result.content}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
