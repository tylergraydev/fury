import { useEffect, useState, useCallback, useRef } from "react";
import { Search, X, CircleDot, ExternalLink, Unlink } from "lucide-react";
import { useLinearStore } from "../../stores/linearStore";
import type { LinearIssue } from "../../lib/tauri";

interface Props {
  workspaceId: string;
  onClose: () => void;
}

export function IssuePicker({ workspaceId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    searchResults,
    searchLoading,
    searchError,
    searchIssues,
    clearSearch,
    loadLinkedIssues,
    linkIssue,
    unlinkIssue,
  } = useLinearStore();

  const linkedIssues = useLinearStore(
    (s) => s.linkedIssues[workspaceId] ?? [],
  );
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadLinkedIssues(workspaceId);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearSearch();
    };
  }, [workspaceId, loadLinkedIssues, clearSearch]);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        clearSearch();
        return;
      }
      debounceRef.current = setTimeout(() => {
        searchIssues(value);
      }, 300);
    },
    [searchIssues, clearSearch],
  );

  const handleLink = async (issue: LinearIssue) => {
    setLinkingId(issue.id);
    setActionError(null);
    try {
      await linkIssue({
        workspaceId,
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      });
    } catch (e) {
      setActionError(`Failed to link ${issue.identifier}: ${String(e)}`);
    } finally {
      setLinkingId(null);
    }
  };

  const handleUnlink = async (issueId: string) => {
    setActionError(null);
    try {
      await unlinkIssue(workspaceId, issueId);
    } catch (e) {
      setActionError(`Failed to unlink issue: ${String(e)}`);
    }
  };

  const linkedIds = new Set(linkedIssues.map((i) => i.issueId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[28rem] rounded-xl p-6"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Link Linear Issue
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search Linear issues..."
            className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              outline: "none",
            }}
            autoFocus
          />
        </div>

        {/* Linked issues */}
        {linkedIssues.length > 0 && (
          <div className="mb-3">
            <div
              className="mb-1 text-[10px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Linked
            </div>
            {linkedIssues.map((issue) => (
              <div
                key={issue.issueId}
                className="mb-1 flex items-center gap-2 rounded px-2 py-1.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <CircleDot
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {issue.identifier}
                </span>
                <span
                  className="flex-1 truncate text-xs"
                  style={{ color: "var(--text-primary)" }}
                >
                  {issue.title}
                </span>
                <button
                  onClick={() => window.open(issue.url, "_blank")}
                  className="p-0.5 transition-colors hover:opacity-70"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleUnlink(issue.issueId)}
                  className="p-0.5 transition-colors hover:opacity-70"
                  style={{ color: "var(--error)" }}
                >
                  <Unlink className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {actionError && (
          <div
            className="mb-3 rounded px-3 py-2 text-xs"
            style={{ color: "var(--error)" }}
          >
            {actionError}
          </div>
        )}

        {/* Search results */}
        <div
          className="max-h-60 overflow-y-auto rounded-lg"
          style={{
            border: query ? "1px solid var(--border)" : "none",
          }}
        >
          {searchLoading && (
            <div
              className="px-3 py-4 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Searching...
            </div>
          )}
          {searchError && (
            <div
              className="px-3 py-4 text-center text-xs"
              style={{ color: "var(--error)" }}
            >
              {searchError}
            </div>
          )}
          {!searchLoading &&
            query &&
            searchResults.length === 0 &&
            !searchError && (
              <div
                className="px-3 py-4 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                No issues found
              </div>
            )}
          {searchResults.map((issue) => (
            <button
              key={issue.id}
              onClick={() =>
                linkedIds.has(issue.id)
                  ? handleUnlink(issue.id)
                  : handleLink(issue)
              }
              disabled={linkingId === issue.id}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                backgroundColor: linkedIds.has(issue.id)
                  ? "var(--bg-hover)"
                  : "transparent",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <CircleDot
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{
                  color: linkedIds.has(issue.id)
                    ? "var(--accent)"
                    : "var(--text-muted)",
                }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    {issue.identifier}
                  </span>{" "}
                  {issue.title}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {[issue.teamName, issue.stateName]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
