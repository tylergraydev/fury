import type React from "react";

export function ActionBar({ icon, description, bgStyle, secondaryActions, primaryAction }: {
  icon?: React.ReactNode;
  description: React.ReactNode;
  bgStyle: React.CSSProperties;
  secondaryActions?: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={bgStyle}>
      {icon}
      <span className="flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>{description}</span>
      {secondaryActions}
      {primaryAction}
    </div>
  );
}

export function ActionBarButton({ onClick, icon: Icon, label, color, bgColor, showShortcut, disabled, title, className }: {
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor?: string;
  showShortcut?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:opacity-80 ${bgColor ? "font-medium" : ""} ${className ?? ""}`}
      style={{ color, ...(bgColor ? { backgroundColor: bgColor } : {}) }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {showShortcut && (
        <kbd className="ml-1 rounded bg-black/20 px-1 py-0.5 text-[9px] font-normal" style={{ color: "inherit" }}>
          ⌘⇧↵
        </kbd>
      )}
    </button>
  );
}
