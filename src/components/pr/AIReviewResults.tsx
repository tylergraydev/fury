import { useState } from "react";
import type { AiReviewResult, AiReviewComment } from "../../stores/prStore";

interface AIReviewResultsProps {
  result: AiReviewResult;
  loading: boolean;
  error: string | null;
  onPostToProvider: () => void;
  onAutoFix: (comments: AiReviewComment[]) => void;
  onClear: () => void;
}

const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
const severityColor: Record<string, string> = {
  error: "var(--error)",
  warning: "var(--warning)",
  info: "var(--text-muted)",
};
const categoryLabel: Record<string, string> = {
  bug: "Bug",
  security: "Security",
  performance: "Perf",
  style: "Style",
  logic: "Logic",
};

const assessmentLabel: Record<string, string> = {
  approve: "Approved",
  request_changes: "Changes Requested",
  comment: "Commented",
};

const assessmentColor: Record<string, string> = {
  approve: "var(--success)",
  request_changes: "var(--error)",
  comment: "var(--text-muted)",
};

export function AIReviewResults({
  result,
  loading,
  error,
  onPostToProvider,
  onAutoFix,
  onClear,
}: AIReviewResultsProps) {
  const [expanded, setExpanded] = useState(true);

  const sortedComments = [...result.comments].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2),
  );

  const errorCount = result.comments.filter((c) => c.severity === "error").length;
  const warningCount = result.comments.filter((c) => c.severity === "warning").length;
  const infoCount = result.comments.filter((c) => c.severity === "info").length;

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex w-full items-center justify-between text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="flex items-center gap-2">
          <span>{expanded ? "\u25BE" : "\u25B8"}</span>
          AI Review
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: `color-mix(in srgb, ${assessmentColor[result.overallAssessment] ?? "var(--text-muted)"} 15%, transparent)`,
              color: assessmentColor[result.overallAssessment] ?? "var(--text-muted)",
            }}
          >
            {assessmentLabel[result.overallAssessment] ?? result.overallAssessment}
          </span>
          {result.comments.length > 0 && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {errorCount > 0 && `${errorCount} error${errorCount > 1 ? "s" : ""}`}
              {warningCount > 0 && `${errorCount > 0 ? ", " : ""}${warningCount} warning${warningCount > 1 ? "s" : ""}`}
              {infoCount > 0 && `${errorCount + warningCount > 0 ? ", " : ""}${infoCount} info`}
            </span>
          )}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="rounded px-1.5 py-0.5 text-[10px]"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
          }}
        >
          Clear
        </button>
      </button>

      {expanded && (
        <div
          className="space-y-2 rounded p-2"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          {/* Summary */}
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {result.summary}
          </p>

          {/* Error message */}
          {error && (
            <div
              className="rounded p-2 text-xs"
              style={{
                backgroundColor: "color-mix(in srgb, var(--error) 15%, transparent)",
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          )}

          {/* Comments list */}
          {sortedComments.length > 0 && (
            <div className="space-y-1.5">
              {sortedComments.map((comment, i) => (
                <ReviewCommentRow key={i} comment={comment} />
              ))}
            </div>
          )}

          {sortedComments.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No issues found.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={onPostToProvider}
              disabled={loading}
              className="rounded px-2.5 py-1 text-[11px] transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
              }}
            >
              {loading ? "Posting..." : "Post to PR"}
            </button>
            {result.comments.length > 0 && (
              <button
                onClick={() => onAutoFix(result.comments)}
                className="rounded px-2.5 py-1 text-[11px]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                }}
              >
                Auto-fix All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCommentRow({ comment }: { comment: AiReviewComment }) {
  const [showFix, setShowFix] = useState(false);

  return (
    <div
      className="rounded p-2 text-xs"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: severityColor[comment.severity] ?? "var(--text-muted)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-mono text-[10px]"
              style={{ color: "var(--accent)" }}
            >
              {comment.path}:{comment.line}
            </span>
            <span
              className="rounded px-1 py-0.5 text-[9px]"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              {categoryLabel[comment.category] ?? comment.category}
            </span>
          </div>
          <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
            {comment.body}
          </p>
          {comment.suggestedFix && (
            <>
              <button
                onClick={() => setShowFix(!showFix)}
                className="mt-1 text-[10px] underline"
                style={{ color: "var(--accent)" }}
              >
                {showFix ? "Hide fix" : "Show suggested fix"}
              </button>
              {showFix && (
                <pre
                  className="mt-1 overflow-x-auto rounded p-1.5 font-mono text-[10px]"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {comment.suggestedFix}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
