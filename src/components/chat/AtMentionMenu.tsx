import { ChevronLeft } from "lucide-react";
import type { AtMenuItem } from "../../hooks/useAtMentionAutocomplete";

interface Props {
  items: AtMenuItem[];
  selectedIndex: number;
  activeCategory: string | null;
  onSelect: (item: AtMenuItem) => void;
  onBack: () => void;
}

export function AtMentionMenu({ items, selectedIndex, activeCategory, onSelect, onBack }: Props) {
  if (items.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 z-10 mb-1 w-full max-h-48 overflow-y-auto rounded-lg shadow-lg"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Category breadcrumb header */}
      {activeCategory && (
        <button
          onClick={onBack}
          className="flex w-full items-center gap-1.5 px-3 py-1 text-[10px] border-b"
          style={{
            color: "var(--text-muted)",
            borderColor: "var(--border)",
          }}
        >
          <ChevronLeft className="h-3 w-3" />
          <span>Back</span>
          <span className="ml-1 capitalize" style={{ color: "var(--text-secondary)" }}>
            {activeCategory.replace("-", " ")}
          </span>
        </button>
      )}

      {items.map((item, i) => (
        <button
          key={item.value}
          onClick={() => onSelect(item)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
          style={{
            backgroundColor: i === selectedIndex ? "var(--bg-hover)" : "transparent",
            color: "var(--text-primary)",
          }}
        >
          {item.icon && (
            <item.icon
              className="h-3.5 w-3.5 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          )}
          <span style={{ color: "var(--accent)" }}>{item.label}</span>
          {item.label !== item.description && (
            <span className="truncate" style={{ color: "var(--text-muted)" }}>
              {item.description}
            </span>
          )}
          {item.isCategory && (
            <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
              &rsaquo;
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
