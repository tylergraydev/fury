import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { TerminalView } from "./TerminalView";

const mockWrite = vi.fn();
const mockDispose = vi.fn();
const mockLoadAddon = vi.fn();
const mockOpen = vi.fn();
const mockOnDataDispose = vi.fn();
const mockOnData = vi.fn().mockReturnValue({ dispose: mockOnDataDispose });
const mockFit = vi.fn();

vi.mock("@xterm/xterm", () => {
  const TerminalClass = vi.fn(function (this: any) {
    this.write = mockWrite;
    this.dispose = mockDispose;
    this.loadAddon = mockLoadAddon;
    this.open = mockOpen;
    this.onData = mockOnData;
    this.cols = 80;
    this.rows = 24;
  });
  return { Terminal: TerminalClass };
});

vi.mock("@xterm/addon-fit", () => {
  const FitAddonClass = vi.fn(function (this: any) {
    this.fit = mockFit;
  });
  return { FitAddon: FitAddonClass };
});

let webLinksCallback: ((_event: any, uri: string) => void) | null = null;
vi.mock("@xterm/addon-web-links", () => {
  const WebLinksAddonClass = vi.fn(function (_cb: any) {
    webLinksCallback = _cb;
  });
  return { WebLinksAddon: WebLinksAddonClass };
});

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

let listenCallback: ((event: any) => void) | null = null;
const mockUnlisten = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((_event: string, cb: any) => {
    listenCallback = cb;
    return Promise.resolve(mockUnlisten);
  }),
}));

vi.mock("../../lib/tauri", () => ({
  writeTerminal: vi.fn().mockResolvedValue(undefined),
  resizeTerminal: vi.fn().mockResolvedValue(undefined),
}));

// Mock CSS import
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { writeTerminal, resizeTerminal } from "../../lib/tauri";

// jsdom does not provide ResizeObserver
let resizeCallback: (() => void) | null = null;
const mockDisconnect = vi.fn();
const mockObserve = vi.fn();
const mockResizeObserver = vi.fn(function (this: any, cb: () => void) {
  resizeCallback = cb;
  this.observe = mockObserve;
  this.unobserve = vi.fn();
  this.disconnect = mockDisconnect;
});
vi.stubGlobal("ResizeObserver", mockResizeObserver);

// Mock requestAnimationFrame
vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { cb(); return 0; });

describe("TerminalView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenCallback = null;
    resizeCallback = null;
  });

  it("renders a container div", () => {
    const { container } = render(<TerminalView terminalId="t-1" />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it("creates Terminal instance on mount", () => {
    render(<TerminalView terminalId="t-1" />);
    expect(Terminal).toHaveBeenCalled();
  });

  it("opens terminal in container element", () => {
    render(<TerminalView terminalId="t-1" />);
    expect(mockOpen).toHaveBeenCalled();
  });

  it("loads FitAddon and WebLinksAddon", () => {
    render(<TerminalView terminalId="t-1" />);
    expect(mockLoadAddon).toHaveBeenCalledTimes(2);
  });

  it("listens for terminal output events", () => {
    render(<TerminalView terminalId="t-1" />);
    expect(listen).toHaveBeenCalledWith("terminal-output:t-1", expect.any(Function));
  });

  it("disposes terminal on unmount", async () => {
    const { unmount } = render(<TerminalView terminalId="t-1" />);
    // Wait for listen promise to resolve
    await vi.waitFor(() => expect(listenCallback).not.toBeNull());
    unmount();
    expect(mockDispose).toHaveBeenCalled();
    expect(mockOnDataDispose).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    // unlisten is called via .then() which is async
    await vi.waitFor(() => expect(mockUnlisten).toHaveBeenCalled());
  });

  it("decodes base64 output and writes to terminal", async () => {
    render(<TerminalView terminalId="t-1" />);
    await vi.waitFor(() => expect(listenCallback).not.toBeNull());
    // btoa("hello") = "aGVsbG8="
    listenCallback!({ payload: btoa("hello") });
    expect(mockWrite).toHaveBeenCalled();
    // It writes a Uint8Array derived from the base64 decoded string
    const arg = mockWrite.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Uint8Array);
  });

  it("falls back to plain text when base64 decode fails", async () => {
    render(<TerminalView terminalId="t-1" />);
    await vi.waitFor(() => expect(listenCallback).not.toBeNull());
    // Mock atob to throw for invalid base64
    const origAtob = globalThis.atob;
    globalThis.atob = () => { throw new Error("Invalid base64"); };
    listenCallback!({ payload: "not-base64!!!" });
    expect(mockWrite).toHaveBeenCalledWith("not-base64!!!");
    globalThis.atob = origAtob;
  });

  it("forwards keystrokes to backend via writeTerminal", async () => {
    render(<TerminalView terminalId="t-1" />);
    // Get the onData callback
    expect(mockOnData).toHaveBeenCalled();
    const onDataCb = mockOnData.mock.calls[0][0];
    onDataCb("hello");
    expect(writeTerminal).toHaveBeenCalledWith("t-1", btoa("hello"));
  });

  it("handles resize by fitting and sending resize command", async () => {
    render(<TerminalView terminalId="t-1" />);
    expect(mockObserve).toHaveBeenCalled();
    expect(resizeCallback).not.toBeNull();
    // Trigger resize
    resizeCallback!();
    expect(mockFit).toHaveBeenCalled();
    expect(resizeTerminal).toHaveBeenCalledWith("t-1", 80, 24);
  });

  it("calls fit on initial requestAnimationFrame", () => {
    render(<TerminalView terminalId="t-1" />);
    // requestAnimationFrame is mocked to run synchronously
    expect(mockFit).toHaveBeenCalled();
  });

  it("opens URI in shell when WebLinksAddon link is clicked", async () => {
    const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
    render(<TerminalView terminalId="t-1" />);
    expect(webLinksCallback).not.toBeNull();
    await act(async () => {
      webLinksCallback!(null, "https://example.com");
    });
    // The callback dynamically imports the shell plugin and calls open
    await vi.waitFor(() => {
      expect(shellOpen).toHaveBeenCalledWith("https://example.com");
    });
  });
});
