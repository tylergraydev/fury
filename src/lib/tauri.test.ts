import { describe, it, expect } from "vitest";
import { toPersisted, fromPersisted } from "./tauri";
import type { ChatMessage, PersistedChatMessage } from "./tauri";

describe("toPersisted", () => {
  it("converts a ChatMessage to PersistedChatMessage with ISO timestamp", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
      timestamp: 1704067200000, // 2024-01-01T00:00:00.000Z
    };
    const result = toPersisted(msg, "ws-1");
    expect(result).toEqual({
      id: "msg-1",
      workspaceId: "ws-1",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    });
  });

  it("preserves all content block types", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: [
        { type: "text", text: "Let me help" },
        { type: "toolUse", id: "tu-1", name: "read", input: { path: "/foo" } },
        { type: "toolResult", toolUseId: "tu-1", content: "file contents" },
      ],
      timestamp: 1704067200000,
    };
    const result = toPersisted(msg, "ws-2");
    expect(result.content).toHaveLength(3);
    expect(result.content[0]).toEqual({ type: "text", text: "Let me help" });
    expect(result.content[1]).toEqual({ type: "toolUse", id: "tu-1", name: "read", input: { path: "/foo" } });
    expect(result.content[2]).toEqual({ type: "toolResult", toolUseId: "tu-1", content: "file contents" });
  });
});

describe("fromPersisted", () => {
  it("converts a PersistedChatMessage to ChatMessage with numeric timestamp", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-1",
      workspaceId: "ws-1",
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = fromPersisted(persisted);
    expect(result).toEqual({
      id: "msg-1",
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      timestamp: 1704067200000,
    });
  });

  it("does not include workspaceId in the result", () => {
    const persisted: PersistedChatMessage = {
      id: "msg-1",
      workspaceId: "ws-1",
      role: "user",
      content: [],
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const result = fromPersisted(persisted);
    expect(result).not.toHaveProperty("workspaceId");
  });
});

describe("toPersisted/fromPersisted round-trip", () => {
  it("round-trips a message preserving all data", () => {
    const original: ChatMessage = {
      id: "msg-rt",
      role: "system",
      content: [{ type: "text", text: "System message" }],
      timestamp: 1704153600000, // 2024-01-02T00:00:00.000Z
    };
    const persisted = toPersisted(original, "ws-rt");
    const restored = fromPersisted(persisted);
    expect(restored).toEqual(original);
  });

  it("round-trips with complex content blocks", () => {
    const original: ChatMessage = {
      id: "msg-complex",
      role: "assistant",
      content: [
        { type: "text", text: "Working on it" },
        { type: "toolUse", id: "tu-1", name: "bash", input: { command: "ls" } },
        { type: "toolResult", toolUseId: "tu-1", content: "file1.ts\nfile2.ts" },
        { type: "text", text: "Done!" },
      ],
      timestamp: 1704240000000,
    };
    const persisted = toPersisted(original, "ws-complex");
    const restored = fromPersisted(persisted);
    expect(restored).toEqual(original);
  });
});
