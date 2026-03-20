import { CircleDot, Search } from "lucide-react";
import type { IssueListItem } from "../../lib/tauri";

interface Props {
  issues: IssueListItem[];
  filteredIssues: IssueListItem[];
  loadingIssues: boolean;
  issueError: string | null;
  issueSearch: string;
  selectedIssue: IssueListItem | null;
  onSearchChange: (value: string) => void;
  onSelectIssue: (issue: IssueListItem) => void;
  inputStyle: React.CSSProperties;
}

export function IssueModeContent({
  issues,
  filteredIssues,
  loadingIssues,
  issueError,
  issueSearch,
  selectedIssue,
  onSearchChange,
  onSelectIssue,
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
          value={issueSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search issues..."
          className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
          style={inputStyle}
          autoFocus
        />
      </div>
      <div
        className="max-h-40 overflow-y-auto rounded-lg"
        style={{ border: "1px solid var(--border)" }}
      >
        {loadingIssues ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Loading issues...
          </div>
        ) : issueError ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--error)" }}
          >
            Failed to load issues: {issueError}
          </div>
        ) : filteredIssues.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {/* v8 ignore next 2 -- ternary branch for empty vs filtered issues */
            issues.length === 0
              ? "No open issues"
              : "No matching issues"}
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <button
              key={issue.number}
              onClick={() => onSelectIssue(issue)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
              style={{
                backgroundColor:
                  selectedIssue?.number === issue.number
                    ? "var(--bg-hover)"
                    : "transparent",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <CircleDot
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "var(--accent-green)" }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    #{issue.number}
                  </span>{" "}
                  {issue.title}
                </div>
                {issue.labels.length > 0 && (
                  <div className="mt-0.5 flex gap-1">
                    {issue.labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
