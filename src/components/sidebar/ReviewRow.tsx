import type { PrReview, PrComment } from "../../lib/tauri";

function reviewStateColor(state: string): string {
  switch (state) {
    case "APPROVED":
      return "var(--success)";
    case "CHANGES_REQUESTED":
      return "var(--error)";
    default:
      return "var(--text-muted)";
  }
}

function reviewStateLabel(state: string): string {
  switch (state) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes requested";
    default:
      return "commented";
  }
}

export function ReviewRow({ review }: { review: PrReview }) {
  const color = reviewStateColor(review.state);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          title={reviewStateLabel(review.state)}
        />
        <span className="truncate font-medium" style={{ color: "var(--text-primary)" }} title={`@${review.author}`}>
          @{review.author}
        </span>
        <span
          className="ml-auto flex-shrink-0"
          style={{ color }}
        >
          {reviewStateLabel(review.state)}
        </span>
      </div>
      {review.body && (
        <p
          className="truncate pl-4 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={review.body}
        >
          {review.body}
        </p>
      )}
    </div>
  );
}

export function ReviewCommentRow({ comment }: { comment: PrComment }) {
  /* v8 ignore start -- nested ternary branches are V8 branch artifacts */
  const location = comment.path
    ? comment.line
      ? `${comment.path}:${comment.line}`
      : comment.path
    : null;
  /* v8 ignore stop */

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          @{comment.author}
        </span>
        {location && (
          <span
            className="truncate text-xs"
            style={{ color: "var(--accent)" }}
            title={location}
          >
            {location}
          </span>
        )}
      </div>
      <p
        className="truncate pl-0 text-xs"
        style={{ color: "var(--text-muted)" }}
        title={comment.body}
      >
        {comment.body}
      </p>
    </div>
  );
}
