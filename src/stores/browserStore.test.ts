import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useBrowserStore } from "./browserStore";

const mockedInvoke = vi.mocked(invoke);

describe("browserStore", () => {
  beforeEach(() => {
    useBrowserStore.setState({
      webviewId: null,
      url: "http://localhost:3000",
      isLoading: false,
      error: null,
      consoleVisible: false,
    });
    mockedInvoke.mockReset();
  });

  describe("initial state", () => {
    it("starts with no webview", () => {
      expect(useBrowserStore.getState().webviewId).toBeNull();
    });

    it("starts with default URL", () => {
      expect(useBrowserStore.getState().url).toBe("http://localhost:3000");
    });

    it("starts not loading", () => {
      expect(useBrowserStore.getState().isLoading).toBe(false);
    });

    it("starts with no error", () => {
      expect(useBrowserStore.getState().error).toBeNull();
    });

    it("starts with console hidden", () => {
      expect(useBrowserStore.getState().consoleVisible).toBe(false);
    });
  });

  describe("create", () => {
    it("sets webviewId and url on success", async () => {
      mockedInvoke.mockResolvedValueOnce("browser-123");
      await useBrowserStore.getState().create("http://localhost:5173", 0, 0, 800, 600);
      const state = useBrowserStore.getState();
      expect(state.webviewId).toBe("browser-123");
      expect(state.url).toBe("http://localhost:5173");
      expect(state.isLoading).toBe(false);
    });

    it("sets error on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("Failed to create"));
      await useBrowserStore.getState().create("http://localhost:3000", 0, 0, 800, 600);
      const state = useBrowserStore.getState();
      expect(state.webviewId).toBeNull();
      expect(state.error).toContain("Failed to create");
      expect(state.isLoading).toBe(false);
    });

    it("sets isLoading during create", async () => {
      let resolveInvoke: (v: string) => void;
      mockedInvoke.mockReturnValueOnce(
        new Promise<string>((r) => { resolveInvoke = r; }) as ReturnType<typeof invoke>,
      );
      const promise = useBrowserStore.getState().create("http://localhost:3000", 0, 0, 800, 600);
      expect(useBrowserStore.getState().isLoading).toBe(true);
      resolveInvoke!("id-1");
      await promise;
      expect(useBrowserStore.getState().isLoading).toBe(false);
    });
  });

  describe("navigate", () => {
    it("updates url on navigate", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockResolvedValueOnce(undefined);
      await useBrowserStore.getState().navigate("http://localhost:5173");
      expect(useBrowserStore.getState().url).toBe("http://localhost:5173");
      expect(useBrowserStore.getState().isLoading).toBe(false);
    });

    it("does nothing without webviewId", async () => {
      await useBrowserStore.getState().navigate("http://localhost:5173");
      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it("sets error on failure", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockRejectedValueOnce(new Error("nav failed"));
      await useBrowserStore.getState().navigate("http://bad-url");
      expect(useBrowserStore.getState().error).toContain("nav failed");
    });
  });

  describe("show/hide", () => {
    it("calls show when webviewId exists", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockResolvedValueOnce(undefined);
      await useBrowserStore.getState().show();
      expect(mockedInvoke).toHaveBeenCalledWith("show_browser", { browserId: "browser-1" });
    });

    it("calls hide when webviewId exists", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockResolvedValueOnce(undefined);
      await useBrowserStore.getState().hide();
      expect(mockedInvoke).toHaveBeenCalledWith("hide_browser", { browserId: "browser-1" });
    });

    it("does nothing without webviewId", async () => {
      await useBrowserStore.getState().show();
      await useBrowserStore.getState().hide();
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("closes and clears webviewId", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockResolvedValueOnce(undefined);
      await useBrowserStore.getState().close();
      expect(useBrowserStore.getState().webviewId).toBeNull();
    });

    it("does nothing without webviewId", async () => {
      await useBrowserStore.getState().close();
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });

  describe("updateBounds", () => {
    it("calls update_browser_bounds with correct args", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockResolvedValueOnce(undefined);
      await useBrowserStore.getState().updateBounds(10, 20, 800, 600);
      expect(mockedInvoke).toHaveBeenCalledWith("update_browser_bounds", {
        browserId: "browser-1",
        x: 10,
        y: 20,
        width: 800,
        height: 600,
      });
    });

    it("silently ignores errors", async () => {
      useBrowserStore.setState({ webviewId: "browser-1" });
      mockedInvoke.mockRejectedValueOnce(new Error("bounds fail"));
      // Should not throw
      await useBrowserStore.getState().updateBounds(0, 0, 100, 100);
      expect(useBrowserStore.getState().error).toBeNull();
    });
  });

  describe("setConsoleVisible", () => {
    it("toggles console visibility", () => {
      useBrowserStore.getState().setConsoleVisible(true);
      expect(useBrowserStore.getState().consoleVisible).toBe(true);
      useBrowserStore.getState().setConsoleVisible(false);
      expect(useBrowserStore.getState().consoleVisible).toBe(false);
    });
  });

  describe("setError", () => {
    it("sets and clears error", () => {
      useBrowserStore.getState().setError("something broke");
      expect(useBrowserStore.getState().error).toBe("something broke");
      useBrowserStore.getState().setError(null);
      expect(useBrowserStore.getState().error).toBeNull();
    });
  });
});
