import { GitPullRequest, Search } from "lucide-react";
import type { PrListItem } from "../../lib/tauri";

interface Props {
  prs: PrListItem[];
  filteredPrs: PrListItem[];
  loadingPrs: boolean;
  prError: string | null;
  prSearch: string;
  selectedPr: PrListItem | null;
  onSearchChange: (value: string) => void;
  onSelectPr: (pr: PrListItem) => void;
  inputStyle: React.CSSProperties;
}

export function PrModeContent({
  prs,
  filteredPrs,
  loadingPrs,
  prError,
  prSearch,
  selectedPr,
  onSearchChange,
  onSelectPr,
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
          value={prSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search pull requests..."
          className="w-full rounded-lg py-2 pl-8 pr-3 text-xs"
          style={inputStyle}
          autoFocus
        />
      </div>
      <div
        className="max-h-40 overflow-y-auto rounded-lg"
        style={{ border: "1px solid var(--border)" }}
      >
        {loadingPrs ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Loading pull requests...
          </div>
        ) : prError ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--error)" }}
          >
            Failed to load pull requests: {prError}
          </div>
        ) : filteredPrs.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {prs.length === 0
              ? "No open pull requests"
              : "No matching pull requests"}
          </div>
        ) : (
          filteredPrs.map((pr) => (
            <button
              key={pr.number}
              onClick={() => onSelectPr(pr)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
              style={{
                backgroundColor:
                  selectedPr?.number === pr.number
                    ? "var(--bg-hover)"
                    : "transparent",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <GitPullRequest
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "var(--accent-green)" }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span style={{ color: "var(--text-muted)" }}>
                    #{pr.number}
                  </span>{" "}
                  {pr.title}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {pr.headBranch} &larr; {pr.baseBranch}
                  {pr.author && ` by ${pr.author}`}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
