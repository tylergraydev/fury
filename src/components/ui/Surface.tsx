import type { ReactNode, HTMLAttributes } from "react";

type SurfaceVariant = "default" | "interactive";

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** "default" for static cards, "interactive" adds hover state. */
  variant?: SurfaceVariant;
  /** Additional border radius class. Defaults to "rounded-lg". */
  rounded?: string;
  children: ReactNode;
}

/**
 * The ubiquitous surface card pattern: bg-surface + border + rounded.
 * Used for settings sections, repo rows, toast items, shortcut cards, etc.
 *
 * Replaces the inline pattern:
 * ```tsx
 * style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
 * ```
 */
export function Surface({
  variant = "default",
  rounded = "rounded-lg",
  className = "",
  children,
  ...rest
}: SurfaceProps) {
  const interactive = variant === "interactive"
    ? " transition-colors hover:bg-[var(--bg-hover)]"
    : "";

  return (
    <div
      className={`${rounded}${interactive} ${className}`}
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        ...rest.style,
      }}
      {...rest}
      // Re-spread style after rest to avoid override from rest.style
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectionHeader                                                      */
/* ------------------------------------------------------------------ */

interface SectionHeaderProps {
  /** Whether to show the accent bar. Defaults to true. */
  accent?: boolean;
  children: ReactNode;
}

/**
 * Uppercase muted section label, optionally with a left accent bar.
 *
 * Usage:
 * ```tsx
 * <SectionHeader>Recent Repositories</SectionHeader>
 * ```
 */
export function SectionHeader({ accent = true, children }: SectionHeaderProps) {
  return (
    <h2
      className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider"
      style={{ color: "var(--text-muted)" }}
    >
      {accent && (
        <span
          className="h-3 w-0.5 rounded-full"
          style={{ backgroundColor: "var(--accent)" }}
        />
      )}
      {children}
    </h2>
  );
}
