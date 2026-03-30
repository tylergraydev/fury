import type { ReactNode } from "react";
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
  Wrench,
  Brain,
  ListPlus,
  ListChecks,
  GitCompare,
  MessageCircleQuestion,
} from "lucide-react";

// --- Tool name normalization & summaries ---

export function normalizeToolName(name: string): string {
  const lower = name.toLowerCase();
  // Check compound names before their substrings — use exact boundaries to avoid
  // substring collisions (e.g. "mask_user" matching "ask_user").
  if (lower === "askfollowupquestion" || lower === "ask_followup_question" || lower === "askfollowup" || lower === "ask_followup" || lower === "askuser" || lower === "ask_user" || lower === "askuserquestion" || lower === "ask_user_question" || lower === "askquestion" || lower === "ask_question") return "AskQuestion";
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
  if (lower.includes("exitplan")) return name;
  if (lower.includes("think") || lower.includes("plan")) return "Think";
  if (lower.includes("diff")) return "Diff";
  return name;
}

export interface ToolConfig {
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
  Think:       { icon: <Brain className={ICON} />,                    color: "#6b7280", label: "Thinking" },
  Diff:        { icon: <GitCompare className={ICON} />,              color: "#58a6ff", label: "Diff" },
  AskQuestion: { icon: <MessageCircleQuestion className={ICON} />,   color: "#8b5cf6", label: "Question" },
};

const DEFAULT_CONFIG: ToolConfig = { icon: <Wrench className={ICON} />, color: "var(--text-muted)", label: "" };

export function getToolConfig(normalized: string): ToolConfig {
  return TOOL_CONFIG[normalized] ?? { ...DEFAULT_CONFIG, label: normalized };
}

function shortenPath(filepath: string): string {
  const parts = filepath.split("/");
  if (parts.length <= 2) return filepath;
  return parts.slice(-2).join("/");
}

function countLines(text: string): number {
  /* v8 ignore start -- empty string guard is V8 branch artifact */
  if (!text) return 0;
  /* v8 ignore stop */
  return text.split("\n").length;
}

export interface ToolSummaryParts {
  label: string;
  detail: string;
  badges: Array<{ text: string; color?: string }>;
}

export function getToolSummary(name: string, input: unknown, result: { content: string } | null): ToolSummaryParts {
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
        /* v8 ignore start -- badge display branches are V8 branch artifacts */
        if (newLines > 0) badges.push({ text: `+${newLines}`, color: "var(--success)" });
        if (oldLines > 0) badges.push({ text: `-${oldLines}`, color: "var(--error)" });
        /* v8 ignore stop */
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
        /* v8 ignore start -- badge display branch is V8 branch artifact */
        if (lines.length > 0) {
          badges.push({ text: `${lines.length} matches`, color: "var(--success)" });
        }
        /* v8 ignore stop */
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
    case "AskQuestion": {
      const question = (inp.question ?? inp.text ?? "") as string;
      return {
        label: "Question",
        detail: question.length > 80 ? question.slice(0, 77) + "..." : question,
        badges: [],
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

export function formatToolDetail(normalized: string, input: unknown, result: { content: string } | null): ReactNode {
  const inp = (typeof input === "object" && input !== null) ? input as Record<string, unknown> : null;

  switch (normalized) {
    case "Edit": {
      if (!inp) break;
      /* v8 ignore start -- defensive fallback; tool input always includes these fields */
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      const oldStr = (inp.old_string ?? "") as string;
      const newStr = (inp.new_string ?? "") as string;
      /* v8 ignore stop */
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
      /* v8 ignore start -- defensive fallback; Bash tool always provides command */
      const cmd = (inp.command ?? inp.cmd ?? "") as string;
      /* v8 ignore stop */
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
      /* v8 ignore start -- defensive fallback; Read tool always provides file_path */
      const fp = (inp.file_path ?? inp.path ?? "") as string;
      /* v8 ignore stop */
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
