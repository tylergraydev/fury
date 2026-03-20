import { ExternalLink } from "lucide-react";
import type { PrCheck } from "../../lib/tauri";

export function isCheckSuccess(conclusion: string | null): boolean {
  return conclusion === "SUCCESS" || conclusion === "success";
}

export function isCheckFailure(conclusion: string | null): boolean {
  return conclusion === "FAILURE" || conclusion === "failure";
}

export function CheckRow({ check }: { check: PrCheck }) {
  const isSuccess = isCheckSuccess(check.conclusion);
  const isFailure = isCheckFailure(check.conclusion);
  const isPending = check.conclusion === null;

  const dotColor = isSuccess
    ? "var(--success)"
    : isFailure
      ? "var(--error)"
      : "var(--text-muted)";

  const content = (
    <>
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${isPending ? "animate-pulse" : ""}`}
        style={{ backgroundColor: dotColor }}
      />
      <span className="truncate" style={{ color: "var(--text-primary)" }}>
        {check.name}
      </span>
      {check.detailsUrl && (
        <ExternalLink
          className="h-2.5 w-2.5 flex-shrink-0 opacity-0 transition-opacity group-hover/check:opacity-60"
          style={{ color: "var(--text-muted)" }}
        />
      )}
      <span
        className="ml-auto flex-shrink-0"
        style={{ color: dotColor }}
      >
        {check.conclusion?.toLowerCase() ?? "pending"}
      </span>
    </>
  );

  if (check.detailsUrl) {
    return (
      <a
        href={check.detailsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group/check flex items-center gap-2 rounded px-2 py-1 text-sm no-underline transition-colors hover:bg-[var(--bg-surface)]"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="group/check flex items-center gap-2 px-2 py-1 text-sm">
      {content}
    </div>
  );
}
