import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileText, Folder, GitBranch, Clock, CheckSquare, Search,
  History, StickyNote, Link2, Globe, AlertTriangle, Code2, Braces, BookOpen,
} from "lucide-react";
import { useFileTreeStore } from "../stores/fileTreeStore";
import { useTodoStore } from "../stores/todoStore";
import { getDiff, getRepoDiff } from "../lib/tauri/diff";
import { getGitLog, listRepoDirectories } from "../lib/tauri/repository";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { searchCodebase } from "../lib/tauri/search";

export interface AtMentionCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface AtMenuItem {
  label: string;
  description: string;
  value: string;
  category: string;
  icon?: LucideIcon;
  /** If true, this item represents a category header to drill into */
  isCategory?: boolean;
}

const CATEGORIES: AtMentionCategory[] = [
  { id: "files", label: "Files", icon: FileText, description: "Attach a file" },
  { id: "folders", label: "Folders", icon: Folder, description: "Attach a folder" },
  { id: "git", label: "Git", icon: GitBranch, description: "Git diff, log, branch" },
  { id: "recent-changes", label: "Recent Changes", icon: Clock, description: "Recent file changes" },
  { id: "todos", label: "Todos", icon: CheckSquare, description: "Insert todo list" },
  { id: "codebase", label: "Codebase", icon: Search, description: "Search entire codebase" },
  { id: "code", label: "Code", icon: Code2, description: "Reference a symbol" },
  { id: "definitions", label: "Definitions", icon: Braces, description: "Full symbol definition" },
  { id: "docs", label: "Docs", icon: BookOpen, description: "Library documentation" },
  { id: "web", label: "Web", icon: Globe, description: "Search the web" },
  { id: "link", label: "Link", icon: Link2, description: "Fetch URL content" },
  { id: "lint", label: "Lint Errors", icon: AlertTriangle, description: "Current diagnostics" },
  { id: "past-chats", label: "Past Chats", icon: History, description: "Previous conversations" },
  { id: "notepads", label: "Notepads", icon: StickyNote, description: "Saved context" },
];

/** Categories that require async fetching of items */
const ASYNC_CATEGORIES = new Set(["code", "definitions", "docs", "web", "past-chats"]);

const GIT_ITEMS: AtMenuItem[] = [
  { label: "Diff vs main", description: "Working changes diff", value: "git:diff", category: "git" },
  { label: "Recent commits", description: "Last 10 commits", value: "git:log", category: "git" },
  { label: "Current branch", description: "Branch name", value: "git:branch", category: "git" },
];

const MAX_FILE_ITEMS = 10;
const MAX_FOLDER_ITEMS = 10;
const MAX_DIFF_LINES = 500;

const EMPTY_FILES: string[] = [];

export function useAtMentionAutocomplete(
  contextId: string,
  contextType: "workspace" | "repo",
  workspaceId: string | undefined,
  getText: () => string,
  setText: (value: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atFilter, setAtFilter] = useState("");
  const [selectedAtIndex, setSelectedAtIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Async items for categories that require fetching
  const [asyncItems, setAsyncItems] = useState<AtMenuItem[]>([]);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const asyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cached folder data
  const [folders, setFolders] = useState<string[]>([]);
  const foldersLoadedRef = useRef<string | null>(null);

  // File tree from store
  const files = useFileTreeStore((s) => s.files[contextId] ?? EMPTY_FILES);

  // Get repoId and branch for context resolution
  const repoId = useWorkspaceStore((s) => {
    if (contextType === "repo") return contextId;
    const ws = s.workspaces.find((w) => w.id === contextId);
    return ws?.repoId ?? null;
  });

  const currentBranch = useWorkspaceStore((s) => {
    if (contextType === "workspace") {
      const ws = s.workspaces.find((w) => w.id === contextId);
      return ws?.branch ?? null;
    }
    return null;
  });

  const repoBranch = useRepositoryStore((s) => {
    if (contextType === "repo") {
      const repo = s.repositories.find((r) => r.id === contextId);
      return repo?.defaultBranch ?? null;
    }
    return null;
  });

  const branch = currentBranch ?? repoBranch ?? "unknown";

  // Load folders on demand
  const loadFolders = useCallback(async () => {
    if (!repoId || foldersLoadedRef.current === repoId) return;
    foldersLoadedRef.current = repoId;
    try {
      const dirs = await listRepoDirectories(repoId, 3);
      setFolders(dirs);
    } catch {
      setFolders([]);
    }
  }, [repoId]);

  // Fetch async items when category and filter change
  useEffect(() => {
    if (!activeCategory || !ASYNC_CATEGORIES.has(activeCategory)) {
      setAsyncItems([]);
      return;
    }
    if (asyncDebounceRef.current) clearTimeout(asyncDebounceRef.current);

    const query = atFilter.trim();
    if (!query) {
      setAsyncItems([]);
      return;
    }

    setAsyncLoading(true);
    asyncDebounceRef.current = setTimeout(async () => {
      try {
        const items = await fetchAsyncItems(activeCategory, query, repoId);
        setAsyncItems(items);
      } catch {
        setAsyncItems([]);
      } finally {
        setAsyncLoading(false);
      }
    }, 250);

    return () => {
      if (asyncDebounceRef.current) clearTimeout(asyncDebounceRef.current);
    };
  }, [activeCategory, atFilter, repoId]);

  // Build menu items based on state
  const menuItems: AtMenuItem[] = useMemo(() => {
    const lower = atFilter.toLowerCase();

    // Smart shortcut: if filter starts with http(s)://, jump to link category
    if (!activeCategory && atFilter && (atFilter.startsWith("http://") || atFilter.startsWith("https://"))) {
      return [{ label: atFilter, description: "Fetch URL content", value: `link:${atFilter}`, category: "link", icon: Link2 }];
    }

    // Smart shortcut: if filter contains "/" or ".", jump straight to files
    if (!activeCategory && atFilter && (atFilter.includes("/") || atFilter.includes("."))) {
      const items: AtMenuItem[] = [];
      for (const f of files) {
        if (f.toLowerCase().includes(lower)) {
          const name = f.split("/").pop()!;
          items.push({ label: name, description: f, value: f, category: "files", icon: FileText });
        }
        if (items.length >= MAX_FILE_ITEMS) break;
      }
      return items;
    }

    // No active category — show category list
    if (!activeCategory) {
      return CATEGORIES
        .filter((c) => !lower || c.label.toLowerCase().includes(lower) || c.id.includes(lower))
        .map((c) => ({
          label: c.label,
          description: c.description,
          value: `category:${c.id}`,
          category: c.id,
          icon: c.icon,
          isCategory: true,
        }));
    }

    // Active category — show items within it
    switch (activeCategory) {
      case "files": {
        const items: AtMenuItem[] = [];
        for (const f of files) {
          if (!lower || f.toLowerCase().includes(lower)) {
            const name = f.split("/").pop()!;
            items.push({ label: name, description: f, value: f, category: "files", icon: FileText });
          }
          if (items.length >= MAX_FILE_ITEMS) break;
        }
        return items;
      }
      case "folders": {
        const items: AtMenuItem[] = [];
        for (const f of folders) {
          if (!lower || f.toLowerCase().includes(lower)) {
            items.push({ label: f, description: f, value: `folder:${f}`, category: "folders", icon: Folder });
          }
          if (items.length >= MAX_FOLDER_ITEMS) break;
        }
        return items;
      }
      case "git":
        return GIT_ITEMS.filter((item) => !lower || item.label.toLowerCase().includes(lower));
      case "recent-changes":
        // Single-item shortcut — immediately resolves
        return [{ label: "Recent Changes", description: "Diff of working changes", value: "recent-changes", category: "recent-changes", icon: Clock }];
      case "todos":
        return [{ label: "Todos", description: "Insert todo list", value: "@todos", category: "todos", icon: CheckSquare }];
      case "codebase":
        return [{ label: "Codebase", description: "Semantic search across project", value: "codebase:search", category: "codebase", icon: Search }];
      // Async categories — return fetched items
      case "code":
      case "definitions":
      case "docs":
      case "web":
      case "past-chats":
        return asyncItems;
      // Single-item shortcuts
      case "lint":
        return [{ label: "Lint Errors", description: "Current lint/diagnostic errors", value: "lint:all", category: "lint", icon: AlertTriangle }];
      case "link":
        if (lower && (lower.startsWith("http://") || lower.startsWith("https://"))) {
          return [{ label: atFilter, description: "Fetch URL content", value: `link:${atFilter}`, category: "link", icon: Link2 }];
        }
        return [{ label: "Enter a URL", description: "Type a URL to fetch its content", value: "link:", category: "link", icon: Link2 }];
      case "notepads":
        return asyncItems.length > 0 ? asyncItems : [];
      default:
        return [];
    }
  }, [atFilter, activeCategory, files, folders, asyncItems]);

  // Use a ref for latest text
  const textRef = useRef(getText);
  textRef.current = getText;

  const selectItem = useCallback(
    (item: AtMenuItem) => {
      // If selecting a category, drill in
      if (item.isCategory) {
        const catId = item.value.replace("category:", "");
        setActiveCategory(catId);
        setAtFilter("");
        setSelectedAtIndex(0);
        // Load folders lazily
        if (catId === "folders") {
          loadFolders();
        }
        return;
      }

      // Insert the mention into the text
      const text = textRef.current();
      const ta = textareaRef.current;
      /* v8 ignore next -- @preserve */
      const cursorPos = ta?.selectionStart ?? text.length;
      const textBeforeCursor = text.substring(0, cursorPos);
      const textAfterCursor = text.substring(cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");
      const before = text.substring(0, atIndex);

      let insertText: string;
      switch (item.category) {
        case "files":
          // Insert file path directly (same as current behavior)
          insertText = item.value;
          break;
        case "folders":
          insertText = `@[Folder: ${item.value.replace("folder:", "")}]`;
          break;
        case "git":
          insertText = `@[Git: ${item.label}]`;
          break;
        case "recent-changes":
          insertText = "@[Recent Changes]";
          break;
        case "todos":
          insertText = "@todos";
          break;
        case "codebase":
          insertText = "@[Codebase]";
          break;
        case "code":
          insertText = `@[Code: ${item.value}]`;
          break;
        case "definitions":
          insertText = `@[Def: ${item.value}]`;
          break;
        case "docs":
          insertText = `@[Docs: ${item.value}]`;
          break;
        case "web":
          insertText = `@[Web: ${item.value}]`;
          break;
        case "link":
          insertText = `@[Link: ${item.value.replace("link:", "")}]`;
          break;
        case "lint":
          insertText = "@[Lint Errors]";
          break;
        case "past-chats":
          insertText = `@[Chat: ${item.value}]`;
          break;
        case "notepads":
          insertText = `@[Notepad: ${item.value}]`;
          break;
        default:
          insertText = item.value;
      }

      setText(before + insertText + " " + textAfterCursor);
      setShowAtMenu(false);
      setActiveCategory(null);
      setAtFilter("");
    },
    [textareaRef, setText, loadFolders],
  );

  const handleAtInput = useCallback((textBeforeCursor: string) => {
    const lastAt = textBeforeCursor.lastIndexOf("@");
    if (lastAt >= 0) {
      const afterAt = textBeforeCursor.substring(lastAt + 1);
      // Allow "/" and "." for file path matching, but not spaces (unless in bracket notation)
      const inBracket = afterAt.includes("[");
      if (inBracket || !afterAt.includes(" ")) {
        const charBefore = lastAt > 0 ? textBeforeCursor[lastAt - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || lastAt === 0) {
          setShowAtMenu(true);
          // For bracket mentions already inserted, don't show menu
          if (afterAt.includes("]")) {
            setShowAtMenu(false);
            return;
          }
          setAtFilter(afterAt);
          setSelectedAtIndex(0);
          return;
        }
      }
    }
    setShowAtMenu(false);
  }, []);

  const handleAtKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!showAtMenu || menuItems.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedAtIndex((prev) => Math.min(prev + 1, menuItems.length - 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedAtIndex((prev) => Math.max(prev - 1, 0));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const idx = Math.min(selectedAtIndex, menuItems.length - 1);
      if (idx >= 0 && menuItems[idx]) {
        selectItem(menuItems[idx]);
      }
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (activeCategory) {
        // Go back to category list
        setActiveCategory(null);
        setAtFilter("");
        setSelectedAtIndex(0);
      } else {
        setShowAtMenu(false);
      }
      return true;
    }
    // Backspace when filter is empty in a category → go back
    if (e.key === "Backspace" && activeCategory && !atFilter) {
      setActiveCategory(null);
      setSelectedAtIndex(0);
      return false; // Let the default backspace handle text deletion
    }
    return false;
  }, [showAtMenu, menuItems, selectedAtIndex, selectItem, activeCategory, atFilter]);

  /** Resolve all @-mention placeholders in the message text before sending */
  const resolveAllMentions = useCallback(async (message: string): Promise<string> => {
    let result = message;

    // Resolve @todos (preserve existing behavior)
    if (workspaceId && result.includes("@todos")) {
      const todosText = useTodoStore.getState().getTodosAsText(workspaceId);
      result = result.replace(/@todos/g, todosText);
    }

    // Resolve @[...] bracket mentions
    const bracketPattern = /@\[([^\]]+)\]/g;
    const matches = [...result.matchAll(bracketPattern)];
    if (matches.length === 0) return result;

    // Resolve all bracket mentions concurrently
    const resolutions = await Promise.all(
      matches.map(async (match) => {
        const content = match[1];
        try {
          if (content === "Recent Changes" || content === "Git: Diff vs main") {
            return await resolveGitDiff(contextId, contextType);
          }
          if (content === "Git: Recent commits") {
            return await resolveGitLog(contextId);
          }
          if (content === "Git: Current branch") {
            return `Current branch: ${branch}`;
          }
          if (content.startsWith("Folder: ")) {
            const folderPath = content.replace("Folder: ", "");
            return `[Attached folder: ${folderPath}]`;
          }
          if (content === "Codebase") {
            return await resolveCodebaseSearch(repoId, message);
          }
          if (content.startsWith("Code: ")) {
            return await resolveCodeReference(repoId, content.replace("Code: ", ""));
          }
          if (content.startsWith("Def: ")) {
            return await resolveDefinition(repoId, content.replace("Def: ", ""));
          }
          if (content.startsWith("Docs: ")) {
            return await resolveDocsReference(content.replace("Docs: ", ""));
          }
          if (content.startsWith("Web: ")) {
            return await resolveWebSearch(content.replace("Web: ", ""));
          }
          if (content.startsWith("Link: ")) {
            return await resolveLinkFetch(content.replace("Link: ", ""));
          }
          if (content === "Lint Errors") {
            return await resolveLintErrors(repoId);
          }
          if (content.startsWith("Chat: ")) {
            return await resolvePastChat(content.replace("Chat: ", ""));
          }
          if (content.startsWith("Notepad: ")) {
            return await resolveNotepad(content.replace("Notepad: ", ""));
          }
        } catch (e) {
          return `[Error resolving ${content}: ${String(e)}]`;
        }
        return match[0]; // Unknown mention, leave as-is
      }),
    );

    // Replace matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      result =
        result.substring(0, match.index!) +
        resolutions[i] +
        result.substring(match.index! + match[0].length);
    }

    return result;
  }, [contextId, contextType, workspaceId, branch]);

  return {
    showAtMenu,
    setShowAtMenu,
    selectedAtIndex,
    activeCategory,
    menuItems,
    asyncLoading,
    selectItem,
    handleAtInput,
    handleAtKeyDown,
    resolveAllMentions,
  };
}

async function resolveGitDiff(contextId: string, contextType: "workspace" | "repo"): Promise<string> {
  const diff = contextType === "workspace"
    ? await getDiff(contextId)
    : await getRepoDiff(contextId);

  if (diff.files.length === 0) return "[No changes detected]";

  const lines: string[] = [`${diff.totalAdditions} additions, ${diff.totalDeletions} deletions across ${diff.files.length} files:\n`];
  for (const f of diff.files) {
    lines.push(`  ${f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"} ${f.path} (+${f.additions} -${f.deletions})`);
  }

  const summary = lines.join("\n");
  if (summary.split("\n").length > MAX_DIFF_LINES) {
    return `<git-diff>\n${summary.split("\n").slice(0, MAX_DIFF_LINES).join("\n")}\n[truncated — ${summary.split("\n").length - MAX_DIFF_LINES} more lines]\n</git-diff>`;
  }
  return `<git-diff>\n${summary}\n</git-diff>`;
}

async function resolveGitLog(contextId: string): Promise<string> {
  const entries = await getGitLog(contextId, 10);
  if (entries.length === 0) return "[No commits found]";

  const lines = entries.map((e) =>
    `${e.hash} ${e.author} ${e.timestamp} ${e.message}`,
  );
  return `<git-log>\n${lines.join("\n")}\n</git-log>`;
}

// --- Async item fetching for new categories ---

async function fetchAsyncItems(category: string, query: string, repoId: string | null): Promise<AtMenuItem[]> {
  switch (category) {
    case "code":
    case "definitions": {
      if (!repoId) return [];
      const { searchSymbols } = await import("../lib/tauri/search");
      const results = await searchSymbols(repoId, query, 10);
      return results.map((r) => ({
        label: r.symbolName ?? r.filePath.split("/").pop()!,
        description: `${r.filePath}:${r.startLine}`,
        value: `${r.symbolName ?? "unknown"} @ ${r.filePath}:${r.startLine}`,
        category,
        icon: category === "code" ? Code2 : Braces,
      }));
    }
    case "docs": {
      const { resolveLibraryId } = await import("../lib/tauri/docs");
      const libs = await resolveLibraryId(query);
      return libs.map((lib) => ({
        label: lib.name,
        description: lib.version ? `v${lib.version}` : "Library",
        value: `${lib.id}/${query}`,
        category: "docs",
        icon: BookOpen,
      }));
    }
    case "web": {
      const { webSearch } = await import("../lib/tauri/web");
      const results = await webSearch(query, 5);
      return results.map((r) => ({
        label: r.title,
        description: r.snippet,
        value: query,
        category: "web",
        icon: Globe,
      }));
    }
    case "past-chats": {
      const { searchChatMessages } = await import("../lib/tauri/chat");
      const results = await searchChatMessages(query);
      return results.map((r) => ({
        label: r.workspaceName,
        description: r.matchedText,
        value: r.workspaceId,
        category: "past-chats",
        icon: History,
      }));
    }
    default:
      return [];
  }
}

// --- Resolution functions for new @-mention types ---

async function resolveCodeReference(repoId: string | null, ref: string): Promise<string> {
  if (!repoId) return "[No repository selected]";
  const { searchSymbols } = await import("../lib/tauri/search");
  const parts = ref.split(" @ ");
  const symbolName = parts[0];
  const results = await searchSymbols(repoId, symbolName, 1);
  if (results.length === 0) return `[Symbol not found: ${symbolName}]`;
  const r = results[0];
  return `<code-reference symbol="${r.symbolName ?? symbolName}" file="${r.filePath}" line="${r.startLine}">\n${r.content}\n</code-reference>`;
}

async function resolveDefinition(repoId: string | null, ref: string): Promise<string> {
  if (!repoId) return "[No repository selected]";
  const { searchSymbols } = await import("../lib/tauri/search");
  const parts = ref.split(" @ ");
  const symbolName = parts[0];
  const results = await searchSymbols(repoId, symbolName, 1);
  if (results.length === 0) return `[Definition not found: ${symbolName}]`;
  const r = results[0];
  return `<definition symbol="${r.symbolName ?? symbolName}" file="${r.filePath}" line="${r.startLine}">\n${r.content}\n</definition>`;
}

async function resolveDocsReference(ref: string): Promise<string> {
  const { queryLibraryDocs } = await import("../lib/tauri/docs");
  const slashIdx = ref.indexOf("/");
  if (slashIdx === -1) return "[Invalid docs reference]";
  const libraryId = ref.substring(0, slashIdx);
  const query = ref.substring(slashIdx + 1);
  const docs = await queryLibraryDocs(libraryId, query);
  return `<library-docs library="${libraryId}">\n${docs}\n</library-docs>`;
}

async function resolveWebSearch(query: string): Promise<string> {
  const { webSearch } = await import("../lib/tauri/web");
  const results = await webSearch(query, 5);
  if (results.length === 0) return "[No web results found]";
  const formatted = results.map((r) => `- [${r.title}](${r.url})\n  ${r.snippet}`).join("\n");
  return `<web-search query="${query}">\n${formatted}\n</web-search>`;
}

async function resolveLinkFetch(url: string): Promise<string> {
  const { fetchUrlContent } = await import("../lib/tauri/url");
  const result = await fetchUrlContent(url);
  return `<url-content url="${result.url}" title="${result.title ?? ""}">\n${result.content}\n</url-content>`;
}

async function resolveLintErrors(repoId: string | null): Promise<string> {
  if (!repoId) return "[No repository selected]";
  const { runLint } = await import("../lib/tauri/diagnostics");
  const diagnostics = await runLint(repoId);
  if (diagnostics.length === 0) return "[No lint errors found]";
  const formatted = diagnostics.map(
    (d) => `${d.severity.toUpperCase()} ${d.filePath}:${d.line}:${d.column} ${d.message}${d.rule ? ` (${d.rule})` : ""}`,
  ).join("\n");
  return `<diagnostics>\n${formatted}\n</diagnostics>`;
}

async function resolvePastChat(workspaceId: string): Promise<string> {
  const { listChatMessages } = await import("../lib/tauri/chat");
  const messages = await listChatMessages(workspaceId);
  if (messages.length === 0) return "[No messages in this conversation]";
  const formatted = messages.slice(-20).map(
    (m) => `[${m.role}] ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`,
  ).join("\n");
  return `<past-chat workspaceId="${workspaceId}">\n${formatted}\n</past-chat>`;
}

async function resolveNotepad(title: string): Promise<string> {
  const { listNotepads } = await import("../lib/tauri/notepads");
  const notepads = await listNotepads();
  const notepad = notepads.find((n) => n.title === title);
  if (!notepad) return `[Notepad not found: ${title}]`;
  return `<notepad title="${title}">\n${notepad.content}\n</notepad>`;
}

async function resolveCodebaseSearch(repoId: string | null, message: string): Promise<string> {
  if (!repoId) return "[No repository selected]";

  // Use the message text (minus the @[Codebase] mention) as the search query
  const query = message.replace(/@\[Codebase\]/g, "").trim();
  if (!query) return "[No search query provided]";

  try {
    const results = await searchCodebase(repoId, query, 10);
    if (results.length === 0) return "[No codebase results found]";

    const formatted = results
      .map(
        (r) =>
          `--- ${r.filePath}:${r.startLine}-${r.endLine} (${r.kind}) ---\n${r.content}`,
      )
      .join("\n\n");
    return `<codebase-search query="${query}">\n${formatted}\n</codebase-search>`;
  } catch (e) {
    return `[Codebase search error: ${String(e)}]`;
  }
}
