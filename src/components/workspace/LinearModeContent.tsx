import { CircleDot, Search } from "lucide-react";
import type { LinearIssue } from "../../lib/tauri";

interface Props {
  linearIssues: LinearIssue[];
  linearSearch: string;
  linearSearching: boolean;
  linearError: string | null;
  selectedLinearIssue: LinearIssue | null;
  onSearchChange: (value: string) => void;
  onSelectLinearIssue: (issue: LinearIssue) => void;
  inputStyle: React.CSSProperties;
}

export function LinearModeContent({
  linearIssues,
  linearSearch,
  linearSearching,
  linearError,
  selectedLinearIssue,
  onSearchChange,
  onSelectLinearIssue,
  inputStyle,
}: Props) {
  return (
    <div className="mb-4">
      <div className="relative mb-2">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          value={linearSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search Linear issues..."
          className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
          style={inputStyle}
          autoFocus
        />
      </div>
      <div
        className="max-h-40 overflow-y-auto rounded-lg"
        style={{
          border: linearSearch
            ? "1px solid var(--border)"
            : "none",
        }}
      >
        {/* v8 ignore next */ linearSearching ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Searching...
          </div>
        ) : linearError ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--error)" }}
          >
            {linearError}
          </div>
        ) : !linearSearch.trim() ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Type to search Linear issues
          </div>
        ) : linearIssues.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No matching issues
          </div>
        ) : (
          linearIssues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => onSelectLinearIssue(issue)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
              style={{
                backgroundColor:
                  selectedLinearIssue?.id === issue.id
                    ? "var(--bg-hover)"
                    : "transparent",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <CircleDot
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "var(--accent)" }}
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
          ))
        )}
      </div>
    </div>
  );
}
