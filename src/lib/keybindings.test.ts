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
    expect(actions).toContain("search-workspaces");
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

describe("isMac", () => {
  it("is a boolean value", () => {
    expect(typeof isMac).toBe("boolean");
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

  it("handles all mod+key shortcuts", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const modKey = isMac ? "metaKey" : "ctrlKey";
    // Test save-file shortcut
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("save-file");
    handler.mockClear();

    // Test toggle-right-sidebar
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("toggle-right-sidebar");
    handler.mockClear();

    // Test focus-terminal
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("focus-terminal");
    handler.mockClear();

    // Test open-settings
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("open-settings");
    handler.mockClear();

    // Test new-workspace
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("new-workspace");
    handler.mockClear();

    // Test number shortcuts
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("right-sidebar-files");
    handler.mockClear();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("right-sidebar-changes");
    handler.mockClear();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", [modKey]: true }));
    expect(handler).toHaveBeenCalledWith("right-sidebar-checks");
  });

  it("does not trigger mod shortcut when mod key is not held", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    // Press 's' without modifier - should not trigger save-file
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("Escape works even when mod key is held", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    // Escape with mod key should still work (modMatch allows it)
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      [isMac ? "metaKey" : "ctrlKey"]: true,
    }));
    expect(handler).toHaveBeenCalledWith("escape");
  });

  it("prevents default on matched shortcut", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const event = new KeyboardEvent("keydown", {
      key: "k",
      [isMac ? "metaKey" : "ctrlKey"]: true,
    });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("ignores non-mod shortcuts when target is an input element", () => {
    // To test the input element guard (lines 66-74), we need a non-mod, non-Escape shortcut.
    // Temporarily add one to SHORTCUTS so we can trigger the guard branch.
    const tempShortcut = { key: "q", mod: false, action: "escape" as const, label: "Temp" };
    SHORTCUTS.push(tempShortcut);

    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    // Create an input element and dispatch the non-mod shortcut key
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // Dispatch 'q' on the input - should be ignored (continue branch, line 73)
    const qEvent = new KeyboardEvent("keydown", { key: "q", bubbles: true });
    input.dispatchEvent(qEvent);
    expect(handler).not.toHaveBeenCalled();

    // Escape should still work even when target is an input
    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    input.dispatchEvent(escEvent);
    expect(handler).toHaveBeenCalledWith("escape");

    document.body.removeChild(input);
    // Remove the temporary shortcut
    SHORTCUTS.pop();
  });

  it("ignores non-mod shortcuts when target is a textarea", () => {
    const tempShortcut = { key: "q", mod: false, action: "escape" as const, label: "Temp" };
    SHORTCUTS.push(tempShortcut);

    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    // Dispatch 'q' on textarea - should be ignored
    const qEvent = new KeyboardEvent("keydown", { key: "q", bubbles: true });
    textarea.dispatchEvent(qEvent);
    expect(handler).not.toHaveBeenCalled();

    // Escape should still work
    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    textarea.dispatchEvent(escEvent);
    expect(handler).toHaveBeenCalledWith("escape");

    document.body.removeChild(textarea);
    SHORTCUTS.pop();
  });

  it("ignores non-mod shortcuts when target is a select element", () => {
    const tempShortcut = { key: "q", mod: false, action: "escape" as const, label: "Temp" };
    SHORTCUTS.push(tempShortcut);

    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const select = document.createElement("select");
    document.body.appendChild(select);
    select.focus();

    // Dispatch 'q' on select - should be ignored
    const qEvent = new KeyboardEvent("keydown", { key: "q", bubbles: true });
    select.dispatchEvent(qEvent);
    expect(handler).not.toHaveBeenCalled();

    // Escape should still work
    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    select.dispatchEvent(escEvent);
    expect(handler).toHaveBeenCalledWith("escape");

    document.body.removeChild(select);
    SHORTCUTS.pop();
  });

  it("triggers non-mod shortcut when target is NOT an input element", () => {
    // This tests that the non-mod shortcut DOES fire when not on an input
    const tempShortcut = { key: "q", mod: false, action: "escape" as const, label: "Temp" };
    SHORTCUTS.push(tempShortcut);

    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    // Dispatch 'q' on window (not on an input) - should trigger
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    expect(handler).toHaveBeenCalledWith("escape");

    SHORTCUTS.pop();
  });

  it("calls handler for Cmd+Shift+F (search-workspaces)", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const modKey = isMac ? "metaKey" : "ctrlKey";
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", [modKey]: true, shiftKey: true }));
    expect(handler).toHaveBeenCalledWith("search-workspaces");
  });

  it("matches shift+mod shortcut when shift is required", () => {
    // Temporarily add a shift shortcut to test the shiftMatch true branch (line 63)
    const shiftShortcut = { key: "p", mod: true, shift: true, action: "toggle-palette" as const, label: "Palette" };
    SHORTCUTS.push(shiftShortcut);

    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts(handler));

    const modKey = isMac ? "metaKey" : "ctrlKey";
    // With shift held - should match
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", [modKey]: true, shiftKey: true }));
    expect(handler).toHaveBeenCalledWith("toggle-palette");

    handler.mockClear();

    // Without shift held - should NOT match (shiftMatch fails)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", [modKey]: true, shiftKey: false }));
    // 'p' without shift might match toggle-palette from the original SHORTCUTS (which has mod: true, no shift)
    // But the original shortcut for toggle-palette uses 'k', not 'p'. So this should not match.
    expect(handler).not.toHaveBeenCalled();

    SHORTCUTS.pop();
  });
});

describe("non-Mac platform", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it("modLabel is Ctrl on non-Mac", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
    });
    const kb = await import("./keybindings");
    expect(kb.isMac).toBe(false);
    expect(kb.modLabel).toBe("Ctrl");
  });

  it("shortcutLabel uses + separator on non-Mac", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      configurable: true,
    });
    const kb = await import("./keybindings");
    const label = kb.shortcutLabel({ key: "s", mod: true, action: "save-file" as any, label: "Save" });
    expect(label).toBe("Ctrl+S");
  });

  it("useKeyboardShortcuts uses ctrlKey on non-Mac", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      configurable: true,
    });
    const kb = await import("./keybindings");
    const handler = vi.fn();
    const { renderHook: rh } = await import("@testing-library/react");
    rh(() => kb.useKeyboardShortcuts(handler));
    // Dispatch a keyboard event with ctrlKey (not metaKey)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    expect(handler).toHaveBeenCalledWith("toggle-palette");
  });
});
