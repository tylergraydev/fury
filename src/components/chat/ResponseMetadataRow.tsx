import type { ResponseMetadata } from "../../lib/tauri";
import { formatDuration, formatTokens, formatCost } from "../../lib/format";

export function ResponseMetadataRow({ metadata }: { metadata: ResponseMetadata }) {
  const parts: string[] = [];

  if (metadata.durationMs != null) {
    parts.push(formatDuration(metadata.durationMs));
  }
  if (metadata.inputTokens != null || metadata.outputTokens != null) {
    const inTok = metadata.inputTokens != null ? formatTokens(metadata.inputTokens) : "?";
    const outTok = metadata.outputTokens != null ? formatTokens(metadata.outputTokens) : "?";
    parts.push(`${inTok} in / ${outTok} out`);
  }
  if (metadata.cacheReadTokens != null && metadata.cacheReadTokens > 0) {
    parts.push(`${formatTokens(metadata.cacheReadTokens)} cached`);
  }
  if (metadata.totalCostUsd != null) {
    parts.push(formatCost(metadata.totalCostUsd));
  }

  if (parts.length === 0) return null;

  return (
    <div
      className="mt-2 flex items-center gap-1.5 text-[11px] select-none"
      style={{ color: "var(--text-muted)" }}
    >
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1 opacity-40">·</span>}
          {part}
        </span>
      ))}
    </div>
  );
}
