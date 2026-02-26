import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, User, Bot, AlertCircle } from "lucide-react";
import type { ChatMessageSearchResult } from "../../lib/tauri";
import { searchChatMessages } from "../../lib/tauri";

interface Props {
  contextId: string;
  onClose: () => void;
  onNavigate: (messageId: string) => void;
}

export function ChatSearch({ contextId, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatMessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchAll, setSearchAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchChatMessages(
          query,
          searchAll ? undefined : contextId,
        );
        setResults(res);
      } catch (e) {
        console.error("Chat search failed:", e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchAll, contextId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  const roleIcon = (role: string) => {
    switch (role) {
      case "user":
        return <User className="h-3 w-3 flex-shrink-0" />;
      case "assistant":
        return <Bot className="h-3 w-3 flex-shrink-0" />;
      default:
        return <AlertCircle className="h-3 w-3 flex-shrink-0" />;
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <div
      className="absolute right-3 top-12 z-30 w-80 max-h-96 flex flex-col rounded-lg shadow-lg"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Search
          className="h-3.5 w-3.5 flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: "var(--text-primary)" }}
        />
        <button
          onClick={onClose}
          className="rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-muted)" }}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scope toggle */}
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <input
            type="checkbox"
            checked={searchAll}
            onChange={(e) => setSearchAll(e.target.checked)}
            className="rounded"
          />
          Search all workspaces
        </label>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && query.trim() && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Searching...
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            No results found
          </div>
        )}

        {!loading &&
          results.map((result) => (
            <button
              key={`${result.messageId}-${result.timestamp}`}
              onClick={() => onNavigate(result.messageId)}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {roleIcon(result.role)}
                <span className="capitalize">{result.role}</span>
                {searchAll && (
                  <>
                    <span>·</span>
                    <span className="truncate">{result.workspaceName}</span>
                  </>
                )}
                <span className="ml-auto flex-shrink-0">
                  {formatTimestamp(result.timestamp)}
                </span>
              </div>
              <div
                className="text-xs leading-relaxed line-clamp-2"
                style={{ color: "var(--text-primary)" }}
              >
                {result.matchedText}
              </div>
            </button>
          ))}

        {!query.trim() && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Type to search conversation history
          </div>
        )}
      </div>
    </div>
  );
}
