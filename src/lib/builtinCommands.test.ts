import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tauri")>();
  return {
    ...actual,
    clearSession: vi.fn().mockResolvedValue(undefined),
    clearChatMessages: vi.fn().mockResolvedValue(undefined),
    saveChatMessage: vi.fn().mockResolvedValue(undefined),
    listChatMessages: vi.fn().mockResolvedValue([]),
    listWorkspaces: vi.fn().mockResolvedValue([]),
    listArchivedWorkspaces: vi.fn().mockResolvedValue([]),
  };
});

import { BUILTIN_COMMANDS } from "./builtinCommands";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useChatStore } from "../stores/chatStore";
import { clearSession } from "./tauri";

describe("BUILTIN_COMMANDS", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    useChatStore.setState({ messages: {} });
    vi.clearAllMocks();
  });

  it("is an array with at least one command", () => {
    expect(Array.isArray(BUILTIN_COMMANDS)).toBe(true);
    expect(BUILTIN_COMMANDS.length).toBeGreaterThanOrEqual(1);
  });

  it("has a 'clear' command", () => {
    const clearCmd = BUILTIN_COMMANDS.find((c) => c.name === "clear");
    expect(clearCmd).toBeDefined();
  });

  it("clear command has source 'built-in'", () => {
    const clearCmd = BUILTIN_COMMANDS.find((c) => c.name === "clear")!;
    expect(clearCmd.source).toBe("built-in");
  });

  it("clear command has a description", () => {
    const clearCmd = BUILTIN_COMMANDS.find((c) => c.name === "clear")!;
    expect(clearCmd.description).toBeTruthy();
    expect(typeof clearCmd.description).toBe("string");
  });

  it("clear action calls clearSession when workspace is active", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: "ws-1" });
    const clearCmd = BUILTIN_COMMANDS.find((c) => c.name === "clear")!;
    clearCmd.action!();
    expect(clearSession).toHaveBeenCalledWith("ws-1");
  });

  it("clear action does nothing when no workspace is active", () => {
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    const clearCmd = BUILTIN_COMMANDS.find((c) => c.name === "clear")!;
    clearCmd.action!();
    expect(clearSession).not.toHaveBeenCalled();
  });
});
