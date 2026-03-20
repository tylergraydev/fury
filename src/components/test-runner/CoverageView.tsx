import { BarChart3 } from "lucide-react";
import type { CoverageReport } from "../../lib/tauri";

export function CoverageView({ coverage }: { coverage: CoverageReport }) {
  return (
    <div className="space-y-0.5 p-1">
      {/* Total coverage bar */}
      <div
        className="mb-2 flex items-center gap-2 rounded px-2 py-1.5"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <BarChart3
          className="h-4 w-4 flex-shrink-0"
          style={{ color: "var(--accent)" }}
        />
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Total Coverage
        </span>
        <div
          className="ml-auto flex items-center gap-2"
        >
          <div
            className="h-2 w-24 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--border)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(coverage.totalLinesPct, 100)}%`,
                backgroundColor:
                  coverage.totalLinesPct >= 80
                    ? "var(--success)"
                    : coverage.totalLinesPct >= 50
                      ? "var(--warning)"
                      : "var(--error)",
              }}
            />
          </div>
          <span
            className="text-xs font-medium"
            style={{
              color:
                coverage.totalLinesPct >= 80
                  ? "var(--success)"
                  : coverage.totalLinesPct >= 50
                    ? "var(--warning)"
                    : "var(--error)",
            }}
          >
            {coverage.totalLinesPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Per-file coverage */}
      <div className="space-y-px">
        {coverage.files
          .sort((a, b) => a.linesPct - b.linesPct)
          .map((file) => (
            <div
              key={file.file}
              className="flex items-center gap-2 rounded px-2 py-0.5 text-[10px]"
            >
              <span
                className="flex-1 truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {file.file}
              </span>
              <div
                className="h-1.5 w-16 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(file.linesPct, 100)}%`,
                    backgroundColor:
                      file.linesPct >= 80
                        ? "var(--success)"
                        : file.linesPct >= 50
                          ? "var(--warning)"
                          : "var(--error)",
                  }}
                />
              </div>
              <span
                className="w-10 text-right"
                style={{
                  color:
                    file.linesPct >= 80
                      ? "var(--success)"
                      : file.linesPct >= 50
                        ? "var(--warning)"
                        : "var(--error)",
                }}
              >
                {file.linesPct.toFixed(0)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
