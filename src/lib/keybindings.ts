import { useEffect } from "react";

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

/* v8 ignore next -- @preserve */
export const modLabel = isMac ? "\u2318" : "Ctrl";

export type ShortcutAction =
  | "toggle-palette"
  | "toggle-right-sidebar"
  | "focus-terminal"
  | "open-settings"
  | "new-workspace"
  | "right-sidebar-files"
  | "right-sidebar-changes"
  | "right-sidebar-checks"
  | "view-chat"
  | "view-merge"
  | "view-history"
  | "save-file"
  | "search-workspaces"
  | "toggle-notifications"
  | "view-team"
  | "escape";

interface ShortcutDef {
  key: string;
  mod: boolean;
  shift?: boolean;
  action: ShortcutAction;
  label: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: "s", mod: true, action: "save-file", label: "Save File" },
  { key: "k", mod: true, action: "toggle-palette", label: "Command Palette" },
  { key: "b", mod: true, action: "toggle-right-sidebar", label: "Toggle Sidebar" },
  { key: "j", mod: true, action: "focus-terminal", label: "Focus Terminal" },
  { key: ",", mod: true, action: "open-settings", label: "Settings" },
  { key: "n", mod: true, action: "new-workspace", label: "New Workspace" },
  { key: "1", mod: true, action: "right-sidebar-files", label: "Files" },
  { key: "2", mod: true, action: "right-sidebar-changes", label: "Changes" },
  { key: "3", mod: true, action: "right-sidebar-checks", label: "Checks" },
  { key: "4", mod: true, action: "toggle-notifications", label: "Notifications" },
  { key: "5", mod: true, action: "view-team", label: "Team View" },
  { key: "f", mod: true, shift: true, action: "search-workspaces", label: "Search Workspaces" },
  { key: "Escape", mod: false, action: "escape", label: "Close" },
];

export function shortcutLabel(def: ShortcutDef): string {
  const parts: string[] = [];
  if (def.mod) parts.push(modLabel);
  if (def.shift) parts.push("Shift");
  const keyLabel = def.key.length === 1 ? def.key.toUpperCase() : def.key;
  parts.push(keyLabel);
  /* v8 ignore next -- @preserve */
  return parts.join(isMac ? "" : "+");
}

export function useKeyboardShortcuts(
  handler: (action: ShortcutAction) => void,
) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      /* v8 ignore next -- @preserve */
      const mod = isMac ? e.metaKey : e.ctrlKey;

      for (const shortcut of SHORTCUTS) {
        const modMatch = shortcut.mod ? mod : !mod || shortcut.key === "Escape";
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const shiftMatch = shortcut.shift ? e.shiftKey : true;

        if (modMatch && keyMatch && shiftMatch) {
          if (
            !shortcut.mod &&
            shortcut.key !== "Escape" &&
            (e.target instanceof HTMLInputElement ||
              e.target instanceof HTMLTextAreaElement ||
              e.target instanceof HTMLSelectElement)
          ) {
            continue;
          }
          e.preventDefault();
          handler(shortcut.action);
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handler]);
}
