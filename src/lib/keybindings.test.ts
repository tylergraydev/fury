import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  shortcutLabel,
  useKeyboardShortcuts,
  SHORTCUTS,
  isMac,
  modLabel,
} from "./keybindings";

describe("shortcutLabel", () => {
  it("formats a mod+key shortcut", () => {
    const label = shortcutLabel({ key: "s", mod: true, action: "save-file", label: "Save" });
    if (isMac) {
      expect(label).toBe("\u2318S");
    } else {
      expect(label).toBe("Ctrl+S");
    }
  });

  it("formats a mod+shift+key shortcut", () => {
    const label = shortcutLabel({ key: "p", mod: true, shift: true, action: "toggle-palette", label: "Palette" });
    if (isMac) {
      expect(label).toBe("\u2318ShiftP");
    } else {
      expect(label).toBe("Ctrl+Shift+P");
    }
  });

  it("formats a non-mod shortcut with multi-char key", () => {
    const label = shortcutLabel({ key: "Escape", mod: false, action: "escape", label: "Close" });
    expect(label).toBe("Escape");
  });

  it("uppercases single-character keys", () => {
    const label = shortcutLabel({ key: "k", mod: true, action: "toggle-palette", label: "Palette" });
    expect(label).toContain("K");
  });
});

describe("SHORTCUTS", () => {
  it("contains expected shortcut actions", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(actions).toContain("save-file");
    expect(actions).toContain("toggle-palette");
    expect(actions).toContain("escape");
    expect(actions).toContain("focus-terminal");
  });

  it("has unique actions", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(new Set(actions).size).toBe(actions.length);
  });
});

describe("modLabel", () => {
  it("is a string", () => {
    expect(typeof modLabel).toBe("string");
  });
});

describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls handler when mod+key is pressed", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const event = new KeyboardEvent("keydown", {
      key: "k",
      [isMac ? "metaKey" : "ctrlKey"]: true,
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledWith("toggle-palette");
  });

  it("calls handler for Escape without mod", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledWith("escape");
  });

  it("does not call handler for unregistered keys", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const event = new KeyboardEvent("keydown", { key: "z" });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts(handler));
    unmount();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      [isMac ? "metaKey" : "ctrlKey"]: true,
    });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });
});
