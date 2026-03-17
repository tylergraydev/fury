import { memo, useState, useEffect, type ReactNode } from "react";
import {
  FileText,
  Pencil,
  FilePlus2,
  SquareTerminal,
  FileSearch,
  FolderSearch,
  Bot,
  NotebookPen,
  Globe,
  Radar,
  ChevronRight,
  ChevronDown,
  Wrench,
  RotateCw,
  Brain,
  ListPlus,
  ListChecks,
  GitCompare,
  ImageIcon,
} from "lucide-react";
import type { ChatMessage, ContentBlock, ResponseMetadata } from "../../lib/tauri";
import { readFileBase64 } from "../../lib/tauri";
import { formatDuration, formatTokens, formatCost } from "../../lib/format";
import { MarkdownContent } from "./MarkdownContent";
import { ImageLightbox } from "./ImageLightbox";

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
    attachments.push({ type: kind, path, name: path.split(/[/\\]/).pop() ?? path });
  }
  const remainingText = text.replace(re, "").trim();
  return { attachments, remainingText };
}

function AttachmentImage({ path, name }: { path: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readFileBase64(path)
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        console.warn(`Failed to load image attachment "${path}":`, err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [path]);

  if (failed) {
    return (
      <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[12px]">
        <ImageIcon className="h-3.5 w-3.5" />
        <span>{name}</span>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className="mb-2 h-24 w-32 animate-pulse rounded bg-[var(--bg-hover)]" />
    );
  }

  return (
    <div className="mb-2">
      <img
        src={dataUrl}
        alt={name}
        className="max-h-48 max-w-full rounded"
        style={{ objectFit: "contain" }}
      />
      <div className="mt-0.5 text-[11px] opacity-70">{name}</div>
    </div>
  );
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

// --- Tool name normalization & summaries ---

function normalizeToolName(name: string): string {
  const lower = name.toLowerCase();
  // Check compound names before their substrings
  if (lower.includes("todowrite") || lower.includes("todo_write")) return "TodoWrite";
  if (lower.includes("todoread") || lower.includes("todo_read")) return "TodoRead";
  if (lower.includes("webfetch")) return "WebFetch";
  if (lower.includes("websearch")) return "WebSearch";
  if (lower.includes("read")) return "Read";
  if (lower.includes("edit")) return "Edit";
  if (lower.includes("write")) return "Write";
  if (lower.includes("bash") || lower.includes("command") || lower.includes("execute")) return "Bash";
  if (lower.includes("grep") || lower.includes("search_code")) return "Grep";
  if (lower.includes("glob") || lower.includes("find_file")) return "Glob";
  if (lower.includes("task")) return "Task";
  if (lower.includes("notebook")) return "Notebook";
  if (lower.includes("web")) return "Web";
  if (lower.includes("think") || lower.includes("plan")) return "Think";
  if (lower.includes("diff")) return "Diff";
  return name;
}

interface ToolConfig {
  icon: ReactNode;
  color: string;
  label: string;
}

const ICON = "h-3.5 w-3.5";

const TOOL_CONFIG: Record<string, ToolConfig> = {
  Read:      { icon: <FileText className={ICON} />,       color: "#79c0ff", label: "Read" },
  Edit:      { icon: <Pencil className={ICON} />,         color: "#f59e0b", label: "Edit" },
  Write:     { icon: <FilePlus2 className={ICON} />,      color: "#34d399", label: "Write" },
  Bash:      { icon: <SquareTerminal className={ICON} />, color: "#d2a8ff", label: "Run" },
  Grep:      { icon: <FileSearch className={ICON} />,     color: "#fb923c", label: "Search" },
  Glob:      { icon: <FolderSearch className={ICON} />,   color: "#fb923c", label: "Find" },
  Task:      { icon: <Bot className={ICON} />,            color: "#ec4899", label: "Agent" },
  Notebook:  { icon: <NotebookPen className={ICON} />,    color: "#d2a8ff", label: "Notebook" },
  WebFetch:  { icon: <Globe className={ICON} />,          color: "#22d3ee", label: "Fetch" },
  WebSearch: { icon: <Radar className={ICON} />,          color: "#22d3ee", label: "Search web" },
  Web:       { icon: <Globe className={ICON} />,          color: "#22d3ee", label: "Web" },
  TodoWrite: { icon: <ListPlus className={ICON} />,       color: "#facc15", label: "Update todos" },
  TodoRead:  { icon: <ListChecks className={ICON} />,     color: "#facc15", label: "Read todos" },
  Think:     { icon: <Brain className={ICON} />,          color: "#6b7280", label: "Thinking" },
  Diff:      { icon: <GitCompare className={ICON} />,     color: "#58a6ff", label: "Diff" },
};

const DEFAULT_CONFIG: ToolConfig = { icon: <Wrench className={ICON} />, color: "var(--text-muted)", label: "" };

function getToolConfig(normalized: string): ToolConfig {
  return TOOL_CONFIG[normalized] ?? { ...DEFAULT_CONFIG, label: normalized };
}

function shortenPath(filepath: string): string {
  const parts = filepath.split("/");
  if (parts.length <= 2) return filepath;
  return parts.slice(-2).join("/");
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

interface ToolSummaryParts {
  label: string;
  detail: string;
  badges: Array<{ text: string; color?: string }>;
}

function getToolSummary(name: string, input: unknown, result: { content: string } | null): ToolSummaryParts {
  const normalized = normalizeToolName(name);
  const inp = input as Record<string, unknown> | null;
  const label = getToolConfig(normalized).label;
  const empty: ToolSummaryParts = { label, detail: "", badges: [] };

  if (!inp || typeof inp !== "object") return empty;

  switch (normalized) {
    case "Read": {
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      const lineCount = result ? countLines(result.content) : null;
      const lineInfo = lineCount !== null ? `${lineCount} lines` : "";
      return {
        label: lineInfo ? `Read ${lineInfo}` : label,
        detail: "",
        badges: fp ? [{ text: shortenPath(fp) }] : [],
      };
    }
    case "Edit": {
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      const oldStr = (inp.old_string ?? "") as string;
      const newStr = (inp.new_string ?? "") as string;
      const oldLines = oldStr ? countLines(oldStr) : 0;
      const newLines = newStr ? countLines(newStr) : 0;
      const badges: Array<{ text: string; color?: string }> = [];
      if (fp) badges.push({ text: shortenPath(fp) });
      if (oldStr || newStr) {
        if (newLines > 0) badges.push({ text: `+${newLines}`, color: "var(--success)" });
        if (oldLines > 0) badges.push({ text: `-${oldLines}`, color: "var(--error)" });
      }
      return { label, detail: "", badges };
    }
    case "Write": {
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      const content = (inp.content ?? "") as string;
      const lines = content ? countLines(content) : 0;
      const badges: Array<{ text: string; color?: string }> = [];
      if (fp) badges.push({ text: shortenPath(fp) });
      if (lines > 0) badges.push({ text: `${lines} lines`, color: "var(--success)" });
      return { label, detail: "", badges };
    }
    case "Bash": {
      const cmd = (inp.command ?? inp.cmd ?? "") as string;
      const desc = (inp.description ?? "") as string;
      const display = desc || cmd;
      return {
        label,
        detail: display.length > 80 ? display.slice(0, 77) + "..." : display,
        badges: [],
      };
    }
    case "Grep": {
      const pat = (inp.pattern ?? inp.query ?? "") as string;
      const path = (inp.path ?? "") as string;
      const badges: Array<{ text: string; color?: string }> = [];
      if (pat) badges.push({ text: pat });
      if (path) badges.push({ text: shortenPath(path) });
      // Try to extract match count from result
      if (result) {
        const lines = result.content.trim().split("\n").filter(Boolean);
        if (lines.length > 0) {
          badges.push({ text: `${lines.length} matches`, color: "var(--success)" });
        }
      }
      return { label: "Search", detail: "", badges };
    }
    case "Glob": {
      const pat = (inp.pattern ?? "") as string;
      return {
        label: "Find files",
        detail: "",
        badges: pat ? [{ text: pat }] : [],
      };
    }
    case "Task": {
      const desc = (inp.description ?? inp.prompt ?? "") as string;
      const subagent = (inp.subagent_type ?? "") as string;
      const detail = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
      return {
        label: subagent ? `Agent (${subagent})` : "Agent",
        detail,
        badges: [],
      };
    }
    case "WebSearch": {
      const query = (inp.query ?? "") as string;
      return {
        label: "Search web",
        detail: "",
        badges: query ? [{ text: query }] : [],
      };
    }
    case "WebFetch": {
      const url = (inp.url ?? "") as string;
      let host = "";
      try { host = new URL(url).hostname; } catch { host = url; }
      return {
        label: "Fetch",
        detail: "",
        badges: host ? [{ text: host }] : [],
      };
    }
    default: {
      const firstVal = Object.values(inp)[0];
      if (typeof firstVal === "string") {
        const detail = firstVal.length > 60 ? firstVal.slice(0, 57) + "..." : firstVal;
        return { label, detail, badges: [] };
      }
      return empty;
    }
  }
}

// --- Dropdown content formatting ---

function formatToolDetail(normalized: string, input: unknown, result: { content: string } | null): ReactNode {
  const inp = (typeof input === "object" && input !== null) ? input as Record<string, unknown> : null;

  switch (normalized) {
    case "Edit": {
      if (!inp) break;
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      const oldStr = (inp.old_string ?? "") as string;
      const newStr = (inp.new_string ?? "") as string;
      return (
        <div className="space-y-2">
          {fp && (
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="font-medium">File:</span> {fp}
            </div>
          )}
          {oldStr && (
            <div>
              <div className="mb-0.5 text-[10px] font-medium" style={{ color: "var(--error)" }}>Removed</div>
              <pre className="overflow-x-auto rounded px-2 py-1 font-mono text-[11px]" style={{ color: "var(--error)", backgroundColor: "color-mix(in srgb, var(--error) 8%, transparent)" }}>
                {oldStr}
              </pre>
            </div>
          )}
          {newStr && (
            <div>
              <div className="mb-0.5 text-[10px] font-medium" style={{ color: "var(--success)" }}>Added</div>
              <pre className="overflow-x-auto rounded px-2 py-1 font-mono text-[11px]" style={{ color: "var(--success)", backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)" }}>
                {newStr}
              </pre>
            </div>
          )}
        </div>
      );
    }
    case "Bash": {
      if (!inp) break;
      const cmd = (inp.command ?? inp.cmd ?? "") as string;
      return (
        <div className="space-y-2">
          {cmd && (
            <div>
              <div className="mb-0.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Command</div>
              <pre className="overflow-x-auto rounded px-2 py-1 font-mono text-[11px]" style={{ color: "var(--accent-purple)", backgroundColor: "color-mix(in srgb, var(--accent-purple) 8%, transparent)" }}>
                $ {cmd}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <div className="mb-0.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Output</div>
              <pre className="max-h-40 overflow-auto rounded px-2 py-1 font-mono text-[11px]" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-surface)" }}>
                {result.content}
              </pre>
            </div>
          )}
        </div>
      );
    }
    case "Read": {
      if (!inp) break;
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      const offset = inp.offset as number | undefined;
      const limit = inp.limit as number | undefined;
      return (
        <div className="space-y-2">
          {fp && (
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="font-medium">File:</span> {fp}
              {offset != null && <span className="ml-2">offset: {offset}</span>}
              {limit != null && <span className="ml-2">limit: {limit}</span>}
            </div>
          )}
          {result && (
            <div>
              <pre className="max-h-40 overflow-auto rounded px-2 py-1 font-mono text-[11px]" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-surface)" }}>
                {result.content}
              </pre>
            </div>
          )}
        </div>
      );
    }
  }

  // Fallback: generic Input/Result display
  return (
    <div className="space-y-2">
      <div>
        <div className="mb-0.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Input</div>
        <pre className="overflow-x-auto font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
        </pre>
      </div>
      {result && (
        <div>
          <div className="mb-0.5 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Result</div>
          <pre className="max-h-40 overflow-auto font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {result.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// --- Components ---

interface Props {
  message: ChatMessage;
  onRetry?: () => void;
  contextId?: string;
  contextType?: "workspace" | "repo";
}

export const MessageBubble = memo(function MessageBubble({ message, onRetry, contextId, contextType }: Props) {
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


function InlineImageGroup({ blocks }: { blocks: Array<ContentBlock & { type: "image" }> }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <>
      <div className="my-2 flex flex-wrap gap-2">
        {blocks.map((block, i) => {
          const src = block.data.startsWith("data:")
            ? block.data
            : block.data.startsWith("http")
              ? block.data
              : `data:${block.mediaType};base64,${block.data}`;
          return (
            <button
              key={i}
              type="button"
              className="cursor-pointer overflow-hidden rounded-md border transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setLightboxSrc(src)}
            >
              <img
                src={src}
                alt={`Image ${i + 1}`}
                className="max-h-64 max-w-full object-contain"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}

function ResponseMetadataRow({ metadata }: { metadata: ResponseMetadata }) {
  const parts: string[] = [];

  if (metadata.durationMs != null) {
    parts.push(formatDuration(metadata.durationMs));
  }
  if (metadata.inputTokens != null || metadata.outputTokens != null) {
    const inTok = metadata.inputTokens != null ? formatTokens(metadata.inputTokens) : "?";
    const outTok = metadata.outputTokens != null ? formatTokens(metadata.outputTokens) : "?";
    parts.push(`${inTok} in / ${outTok} out`);
  }
  if (metadata.cacheReadTokens != null && metadata.cacheReadTokens > 0) {
    parts.push(`${formatTokens(metadata.cacheReadTokens)} cached`);
  }
  if (metadata.totalCostUsd != null) {
    parts.push(formatCost(metadata.totalCostUsd));
  }

  if (parts.length === 0) return null;

  return (
    <div
      className="mt-2 flex items-center gap-1.5 text-[11px] select-none"
      style={{ color: "var(--text-muted)" }}
    >
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1 opacity-40">·</span>}
          {part}
        </span>
      ))}
    </div>
  );
}

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
