import { useState, type ReactNode } from "react";
import {
  FileText,
  Pencil,
  FileOutput,
  Terminal,
  Search,
  FolderSearch,
  Zap,
  BookOpen,
  Globe,
  ChevronRight,
  ChevronDown,
  Circle,
  RotateCw,
} from "lucide-react";
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
    switch (block.type) {
      case "text":
        flushTools();
        currentTextBlocks.push(block);
        break;
      case "toolUse":
        flushText();
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

const TOOL_ICON_MAP: Record<string, ReactNode> = {
  Read: <FileText className="h-3 w-3" />,
  Edit: <Pencil className="h-3 w-3" />,
  Write: <FileOutput className="h-3 w-3" />,
  Bash: <Terminal className="h-3 w-3" />,
  Grep: <Search className="h-3 w-3" />,
  Glob: <FolderSearch className="h-3 w-3" />,
  Task: <Zap className="h-3 w-3" />,
  Notebook: <BookOpen className="h-3 w-3" />,
  Web: <Globe className="h-3 w-3" />,
};

function getToolIcon(normalized: string): ReactNode {
  return TOOL_ICON_MAP[normalized] ?? <Circle className="h-3 w-3" />;
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
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const groups = groupContentBlocks(message.content);

  // User messages: bubble with no avatar
  if (isUser) {
    return (
      <div className="mb-4 flex justify-end">
        <div
          className="max-w-[80%] rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--accent)",
            color: "#1e1e2e",
          }}
        >
          {groups.map((group, i) =>
            group.kind === "text" ? (
              group.blocks.map((block, j) => (
                <div key={`${i}-${j}`} className="whitespace-pre-wrap break-words">
                  {block.text}
                </div>
              ))
            ) : null,
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
          className="inline-flex max-w-[80%] items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "rgba(243, 139, 168, 0.1)",
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
  return (
    <div className="mb-3 text-sm" style={{ color: "var(--text-primary)" }}>
      {groups.map((group, i) =>
        group.kind === "text" ? (
          group.blocks.map((block, j) => (
            <div key={`${i}-${j}`} className="mb-1 whitespace-pre-wrap break-words">
              {block.text}
            </div>
          ))
        ) : (
          <ToolCallList key={i} pairs={group.pairs} />
        ),
      )}
    </div>
  );
}

function ToolCallList({ pairs }: { pairs: ToolPair[] }) {
  return (
    <div className="my-1">
      {pairs.map((pair) => (
        <ToolRow key={pair.use.id} pair={pair} />
      ))}
    </div>
  );
}

function ToolRow({ pair }: { pair: ToolPair }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const normalized = normalizeToolName(pair.use.name);
  const icon = getToolIcon(normalized);
  const summary = getToolSummary(pair.use.name, pair.use.input);

  return (
    <div>
      <button
        onClick={() => setDetailOpen(!detailOpen)}
        className="flex w-full items-center gap-2 py-0.5 text-left text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        {detailOpen ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        )}
        <span
          className="inline-flex flex-shrink-0 items-center gap-1 text-xs"
          style={{ color: "var(--accent)" }}
        >
          <span>{icon}</span>
          <span>{normalized}</span>
        </span>
        <span
          className="truncate text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {summary}
        </span>
      </button>

      {detailOpen && (
        <div
          className="mb-1 ml-5 mt-0.5 rounded border px-3 py-2"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}
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
