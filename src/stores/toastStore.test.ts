import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useToastStore } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("addToast", () => {
    it("adds a toast with default info type", () => {
      useToastStore.getState().addToast("hello");
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("hello");
      expect(toasts[0].type).toBe("info");
    });

    it("adds a toast with explicit error type", () => {
      useToastStore.getState().addToast("fail", "error");
      expect(useToastStore.getState().toasts[0].type).toBe("error");
    });

    it("adds a toast with explicit success type", () => {
      useToastStore.getState().addToast("done", "success");
      expect(useToastStore.getState().toasts[0].type).toBe("success");
    });

    it("includes action when provided", () => {
      const onClick = vi.fn();
      useToastStore
        .getState()
        .addToast("act", "info", { action: { label: "Undo", onClick } });
      const toast = useToastStore.getState().toasts[0];
      expect(toast.action?.label).toBe("Undo");
      toast.action?.onClick();
      expect(onClick).toHaveBeenCalled();
    });

    it("includes persistent flag when provided", () => {
      useToastStore
        .getState()
        .addToast("sticky", "info", { persistent: true });
      expect(useToastStore.getState().toasts[0].persistent).toBe(true);
    });
  });

  describe("auto-dismiss timers", () => {
    it("auto-removes info toast after 3000ms", () => {
      useToastStore.getState().addToast("info msg");
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(3000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("auto-removes success toast after 3000ms", () => {
      useToastStore.getState().addToast("ok", "success");
      vi.advanceTimersByTime(3000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("auto-removes error toast after 8000ms", () => {
      useToastStore.getState().addToast("err", "error");
      vi.advanceTimersByTime(7999);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("does not auto-remove persistent toast", () => {
      useToastStore
        .getState()
        .addToast("stay", "info", { persistent: true });
      vi.advanceTimersByTime(10000);
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });

    it("info toast still present before 3000ms", () => {
      useToastStore.getState().addToast("brief");
      vi.advanceTimersByTime(2999);
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe("removeToast", () => {
    it("removes a specific toast by id", () => {
      useToastStore.getState().addToast("a");
      useToastStore.getState().addToast("b");
      const id = useToastStore.getState().toasts[0].id;
      useToastStore.getState().removeToast(id);
      const remaining = useToastStore.getState().toasts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe("b");
    });

    it("is a no-op when id does not exist", () => {
      useToastStore.getState().addToast("a");
      useToastStore.getState().removeToast("nonexistent");
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });
});
