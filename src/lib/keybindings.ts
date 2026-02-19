import { useEffect } from "react";

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const modLabel = isMac ? "⌘" : "Ctrl";

export type ShortcutAction =
  | "toggle-palette"
  | "toggle-diff"
  | "focus-terminal"
  | "open-settings"
  | "new-workspace"
  | "view-chat"
  | "view-diff"
  | "view-pr"
  | "view-notes"
  | "escape";

interface ShortcutDef {
  key: string;
  mod: boolean;
  shift?: boolean;
  action: ShortcutAction;
  label: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: "k", mod: true, action: "toggle-palette", label: "Command Palette" },
  { key: "d", mod: true, action: "toggle-diff", label: "Toggle Diff" },
  { key: "j", mod: true, action: "focus-terminal", label: "Focus Terminal" },
  { key: ",", mod: true, action: "open-settings", label: "Settings" },
  { key: "n", mod: true, action: "new-workspace", label: "New Workspace" },
  { key: "1", mod: true, action: "view-chat", label: "Chat View" },
  { key: "2", mod: true, action: "view-diff", label: "Diff View" },
  { key: "3", mod: true, action: "view-pr", label: "PR View" },
  { key: "4", mod: true, action: "view-notes", label: "Notes View" },
  { key: "Escape", mod: false, action: "escape", label: "Close" },
];

export function shortcutLabel(def: ShortcutDef): string {
  const parts: string[] = [];
  if (def.mod) parts.push(modLabel);
  if (def.shift) parts.push("Shift");
  const keyLabel = def.key.length === 1 ? def.key.toUpperCase() : def.key;
  parts.push(keyLabel);
  return parts.join(isMac ? "" : "+");
}

export function useKeyboardShortcuts(
  handler: (action: ShortcutAction) => void,
) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;

      for (const shortcut of SHORTCUTS) {
        const modMatch = shortcut.mod ? mod : !mod || shortcut.key === "Escape";
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const shiftMatch = shortcut.shift ? e.shiftKey : true;

        if (modMatch && keyMatch && shiftMatch) {
          // Don't capture shortcuts when typing in inputs (except Escape and mod shortcuts)
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
