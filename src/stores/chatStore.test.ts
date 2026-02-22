import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  listChatMessages: vi.fn().mockResolvedValue([]),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  toPersisted: vi.fn((msg: any, wsId: string) => ({
    ...msg,
    workspaceId: wsId,
    timestamp: new Date(msg.timestamp).toISOString(),
  })),
  fromPersisted: vi.fn((msg: any) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp).getTime(),
  })),
}));

import { useChatStore } from "./chatStore";
import { listen } from "@tauri-apps/api/event";
import {
  saveChatMessage,
  listChatMessages,
  clearChatMessages,
} from "../lib/tauri";

beforeEach(() => {
  useChatStore.setState(
    { messages: {}, streamingText: {}, subscriptions: {} },
  );
  vi.clearAllMocks();
});

describe("chatStore - subscribe", () => {
  it("registers a listener and stores unlisten", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    vi.mocked(listChatMessages).mockResolvedValue([]);

    await useChatStore.getState().subscribe("ws-1");

    expect(listen).toHaveBeenCalledWith(
      "agent-stream:ws-1",
      expect.any(Function),
    );
    expect(useChatStore.getState().subscriptions["ws-1"]).toBe(unlisten);
  });

  it("skips if already subscribed", async () => {
    const unlisten = vi.fn();
    useChatStore.setState({ subscriptions: { "ws-1": unlisten } });

    await useChatStore.getState().subscribe("ws-1");

    expect(listen).not.toHaveBeenCalled();
  });

  it("loads persisted messages if none in memory", async () => {
    const persisted = [
      {
        id: "m1",
        workspaceId: "ws-1",
        role: "user",
        content: [{ type: "text", text: "hello" }],
        timestamp: "2024-01-01T00:00:00Z",
      },
    ];
    vi.mocked(listChatMessages).mockResolvedValue(persisted as any);
    vi.mocked(listen).mockResolvedValue(vi.fn());

    await useChatStore.getState().subscribe("ws-1");

    expect(listChatMessages).toHaveBeenCalledWith("ws-1");
    expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1);
  });

  it("does not load messages if already present", async () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          {
            id: "m1",
            role: "user",
            content: [{ type: "text", text: "hi" }],
            timestamp: 1000,
          },
        ],
      },
    });
    vi.mocked(listen).mockResolvedValue(vi.fn());

    await useChatStore.getState().subscribe("ws-1");

    expect(listChatMessages).not.toHaveBeenCalled();
  });
});

describe("chatStore - unsubscribe", () => {
  it("calls unlisten and removes subscription", () => {
    const unlisten = vi.fn();
    useChatStore.setState({ subscriptions: { "ws-1": unlisten } });

    useChatStore.getState().unsubscribe("ws-1");

    expect(unlisten).toHaveBeenCalled();
    expect(useChatStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });

  it("is a no-op for unknown workspace", () => {
    useChatStore.getState().unsubscribe("unknown");
    expect(useChatStore.getState().subscriptions).toEqual({});
  });
});

describe("chatStore - addUserMessage", () => {
  it("adds a user message to the workspace", () => {
    useChatStore.getState().addUserMessage("ws-1", "hello");

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toEqual([{ type: "text", text: "hello" }]);
    expect(saveChatMessage).toHaveBeenCalled();
  });

  it("appends to existing messages", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          {
            id: "m1",
            role: "user",
            content: [{ type: "text", text: "first" }],
            timestamp: 1000,
          },
        ],
      },
    });

    useChatStore.getState().addUserMessage("ws-1", "second");

    expect(useChatStore.getState().messages["ws-1"]).toHaveLength(2);
  });
});

describe("chatStore - clearMessages", () => {
  it("clears messages and streaming text", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          {
            id: "m1",
            role: "user",
            content: [{ type: "text", text: "hi" }],
            timestamp: 1000,
          },
        ],
      },
      streamingText: { "ws-1": "partial text" },
    });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);

    useChatStore.getState().clearMessages("ws-1");

    expect(useChatStore.getState().messages["ws-1"]).toEqual([]);
    expect(useChatStore.getState().streamingText["ws-1"]).toBe("");
    expect(clearChatMessages).toHaveBeenCalledWith("ws-1");
  });
});

describe("chatStore - getters", () => {
  it("getMessages returns messages for known workspace", () => {
    const msgs = [
      {
        id: "m1",
        role: "user" as const,
        content: [{ type: "text" as const, text: "hi" }],
        timestamp: 1000,
      },
    ];
    useChatStore.setState({ messages: { "ws-1": msgs } });
    expect(useChatStore.getState().getMessages("ws-1")).toEqual(msgs);
  });

  it("getMessages returns empty array for unknown workspace", () => {
    expect(useChatStore.getState().getMessages("unknown")).toEqual([]);
  });

  it("getStreamingText returns text for known workspace", () => {
    useChatStore.setState({ streamingText: { "ws-1": "streaming..." } });
    expect(useChatStore.getState().getStreamingText("ws-1")).toBe(
      "streaming...",
    );
  });

  it("getStreamingText returns empty string for unknown workspace", () => {
    expect(useChatStore.getState().getStreamingText("unknown")).toBe("");
  });
});

describe("chatStore - loadMessages", () => {
  it("loads persisted messages into state", async () => {
    const persisted = [
      {
        id: "m1",
        workspaceId: "ws-1",
        role: "user",
        content: [{ type: "text", text: "hello" }],
        timestamp: "2024-01-01T00:00:00Z",
      },
    ];
    vi.mocked(listChatMessages).mockResolvedValue(persisted as any);

    await useChatStore.getState().loadMessages("ws-1");

    expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1);
  });

  it("does not set state for empty persisted messages", async () => {
    vi.mocked(listChatMessages).mockResolvedValue([]);

    await useChatStore.getState().loadMessages("ws-1");

    expect(useChatStore.getState().messages["ws-1"]).toBeUndefined();
  });

  it("handles load failure gracefully", async () => {
    vi.mocked(listChatMessages).mockRejectedValue(new Error("fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await useChatStore.getState().loadMessages("ws-1");

    expect(useChatStore.getState().messages["ws-1"]).toBeUndefined();
  });
});

describe("chatStore - removeTrailingSystemMessages", () => {
  it("removes trailing system messages", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          {
            id: "m1",
            role: "user",
            content: [{ type: "text", text: "hi" }],
            timestamp: 1000,
          },
          {
            id: "m2",
            role: "system",
            content: [{ type: "text", text: "sys" }],
            timestamp: 2000,
          },
          {
            id: "m3",
            role: "system",
            content: [{ type: "text", text: "sys2" }],
            timestamp: 3000,
          },
        ],
      },
    });

    useChatStore.getState().removeTrailingSystemMessages("ws-1");

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
  });

  it("is a no-op when last message is not system", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          {
            id: "m1",
            role: "user",
            content: [{ type: "text", text: "hi" }],
            timestamp: 1000,
          },
        ],
      },
    });

    useChatStore.getState().removeTrailingSystemMessages("ws-1");

    expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1);
  });
});

describe("chatStore - stream events", () => {
  let handleEvent: (event: { payload: any }) => void;

  beforeEach(async () => {
    vi.mocked(listen).mockImplementation(async (_channel, handler) => {
      handleEvent = handler as any;
      return () => {};
    });
    vi.mocked(listChatMessages).mockResolvedValue([]);
    vi.mocked(saveChatMessage).mockResolvedValue(undefined);

    await useChatStore.getState().subscribe("ws-1");
  });

  it("handles system event with message", () => {
    handleEvent({
      payload: { type: "system", sessionId: null, message: "Starting..." },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content[0]).toEqual({ type: "text", text: "Starting..." });
  });

  it("handles system event without message (no-op)", () => {
    handleEvent({
      payload: { type: "system", sessionId: null, message: null },
    });

    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    expect(msgs).toHaveLength(0);
  });

  it("handles assistantText event by accumulating streaming text", () => {
    handleEvent({ payload: { type: "assistantText", text: "Hello " } });
    handleEvent({ payload: { type: "assistantText", text: "world" } });

    expect(useChatStore.getState().streamingText["ws-1"]).toBe("Hello world");
  });

  it("handles toolUse event - finalizes streaming text then adds tool block", () => {
    handleEvent({ payload: { type: "assistantText", text: "thinking..." } });
    handleEvent({
      payload: {
        type: "toolUse",
        id: "tool-1",
        name: "read_file",
        input: { path: "/test" },
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    // First message: finalized text, second content block: toolUse
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].content).toHaveLength(2);
    expect(msgs[0].content[0]).toEqual({ type: "text", text: "thinking..." });
    expect(msgs[0].content[1]).toEqual({
      type: "toolUse",
      id: "tool-1",
      name: "read_file",
      input: { path: "/test" },
    });
    expect(useChatStore.getState().streamingText["ws-1"]).toBe("");
  });

  it("handles toolResult event - appends to existing assistant message", () => {
    handleEvent({
      payload: {
        type: "toolUse",
        id: "tool-1",
        name: "read_file",
        input: {},
      },
    });
    handleEvent({
      payload: {
        type: "toolResult",
        toolUseId: "tool-1",
        content: "file content",
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toHaveLength(2);
    expect(msgs[0].content[1]).toEqual({
      type: "toolResult",
      toolUseId: "tool-1",
      content: "file content",
    });
  });

  it("handles result event - finalizes streaming text", () => {
    handleEvent({ payload: { type: "assistantText", text: "done" } });
    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].content[0]).toEqual({ type: "text", text: "done" });
    expect(useChatStore.getState().streamingText["ws-1"]).toBe("");
  });

  it("handles result event with error - adds friendly error message", () => {
    handleEvent({
      payload: {
        type: "result",
        isError: true,
        result: "500 Internal server error",
        sessionId: null,
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content[0].type).toBe("text");
    expect((msgs[0].content[0] as any).text).toContain("500");
  });

  it("handles toolUse without prior streaming text - creates new assistant msg", () => {
    handleEvent({
      payload: {
        type: "toolUse",
        id: "tool-1",
        name: "write_file",
        input: {},
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].content[0]).toEqual({
      type: "toolUse",
      id: "tool-1",
      name: "write_file",
      input: {},
    });
  });
});

describe("chatStore - formatErrorMessage (via result events)", () => {
  let handleEvent: (event: { payload: any }) => void;

  beforeEach(async () => {
    vi.mocked(listen).mockImplementation(async (_channel, handler) => {
      handleEvent = handler as any;
      return () => {};
    });
    vi.mocked(listChatMessages).mockResolvedValue([]);
    vi.mocked(saveChatMessage).mockResolvedValue(undefined);

    await useChatStore.getState().subscribe("ws-1");
  });

  const getErrorText = (raw: string): string => {
    handleEvent({
      payload: { type: "result", isError: true, result: raw, sessionId: null },
    });
    const msgs = useChatStore.getState().messages["ws-1"];
    const text = (msgs[msgs.length - 1].content[0] as any).text;
    // Reset for next call
    useChatStore.setState({ messages: { "ws-1": [] } });
    return text;
  };

  it("formats 500 internal server error", () => {
    expect(getErrorText("status: 500 Internal server error")).toContain(
      "API error (500)",
    );
  });

  it("formats 429 rate limit", () => {
    expect(getErrorText("error: 429 rate limit exceeded")).toContain(
      "Rate limited (429)",
    );
  });

  it("formats 401 unauthorized", () => {
    expect(getErrorText("HTTP 401 Unauthorized")).toContain(
      "Authentication error (401)",
    );
  });

  it("formats 403 forbidden", () => {
    expect(getErrorText("error: 403 Forbidden")).toContain(
      "Access denied (403)",
    );
  });

  it("formats 404 not found", () => {
    expect(getErrorText("error: 404")).toContain("Not found (404)");
  });

  it("formats generic 5xx error", () => {
    expect(getErrorText("error: 502")).toContain("Server error (502)");
  });

  it("formats generic 4xx error", () => {
    expect(getErrorText("error: 422")).toContain("Request error (422)");
  });

  it("formats timeout error", () => {
    expect(getErrorText("Request timed out")).toContain("timed out");
  });

  it("formats network error", () => {
    expect(getErrorText("ECONNREFUSED")).toContain("Network error");
  });

  it("formats overloaded error", () => {
    expect(getErrorText("API is overloaded")).toContain("overloaded");
  });

  it("falls back for unknown error with trimming", () => {
    const long = "x".repeat(200);
    const result = getErrorText(long);
    expect(result).toContain("Error:");
    expect(result.length).toBeLessThan(200);
  });

  it("falls back for short unknown error", () => {
    expect(getErrorText("Something went wrong")).toContain(
      "Error: Something went wrong",
    );
  });
});
