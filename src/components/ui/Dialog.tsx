import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  /** Controls visibility. When false, nothing renders. */
  open: boolean;
  /** Called when the user clicks the backdrop or the X button. */
  onClose: () => void;
  /** Accessible label for the dialog. */
  "aria-label": string;
  /** Width class — defaults to "w-[28rem]". Pass any Tailwind width. */
  width?: string;
  /** "padded" (default) adds p-6 + rounded-xl. "flush" uses rounded-lg with no padding, flex-col, and max-height for full-bleed section layouts. */
  variant?: "padded" | "flush";
  children: ReactNode;
}

/**
 * Shared dialog shell: overlay + centered panel + close button + focus trap.
 *
 * Usage:
 * ```tsx
 * <Dialog open={show} onClose={close} aria-label="Clone repository">
 *   <DialogHeader icon={<Git />} iconColor="#a78bfa" title="Clone" subtitle="From URL" />
 *   <div>...body...</div>
 *   <DialogFooter>
 *     <DialogButton onClick={close}>Cancel</DialogButton>
 *     <DialogButton variant="primary" onClick={go}>Clone</DialogButton>
 *   </DialogFooter>
 * </Dialog>
 * ```
 */
export function Dialog({
  open,
  onClose,
  "aria-label": ariaLabel,
  width = "w-[28rem]",
  variant = "padded",
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Trap focus inside the dialog
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--overlay)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className={`dialog-panel ${width} max-w-[90vw] ${variant === "flush" ? "flex max-h-[80vh] flex-col rounded-lg" : "rounded-xl p-6"}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DialogHeader                                                       */
/* ------------------------------------------------------------------ */

interface DialogHeaderProps {
  /** Icon element rendered inside a colored circle. */
  icon: ReactNode;
  /** Background color for the icon circle. */
  iconColor?: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function DialogHeader({
  icon,
  iconColor = "var(--accent)",
  title,
  subtitle,
  onClose,
}: DialogHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: iconColor }}
        >
          <span style={{ color: "#1e1e2e" }}>{icon}</span>
        </div>
        <div>
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        className="btn-press rounded p-1 transition-colors hover:opacity-70"
        style={{ color: "var(--text-muted)" }}
        aria-label="Close dialog"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DialogFooter                                                       */
/* ------------------------------------------------------------------ */

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  DialogButton                                                       */
/* ------------------------------------------------------------------ */

interface DialogButtonProps {
  variant?: "ghost" | "primary";
  /** Override the primary accent color (e.g. "#a78bfa" for purple). */
  color?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function DialogButton({
  variant = "ghost",
  color,
  disabled,
  onClick,
  children,
}: DialogButtonProps) {
  const isPrimary = variant === "primary";
  const bg = isPrimary ? color ?? "var(--accent)" : undefined;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${disabled ? "opacity-50" : "btn-press"} rounded-lg px-4 py-2 text-xs transition-colors ${isPrimary ? "font-medium" : ""}`}
      style={
        isPrimary
          ? { backgroundColor: bg, color: "#1e1e2e" }
          : { color: "var(--text-secondary)", border: "1px solid var(--border)" }
      }
    >
      {children}
    </button>
  );
}
