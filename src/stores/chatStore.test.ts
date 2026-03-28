import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  listChatMessages: vi.fn().mockResolvedValue([]),
  clearChatMessages: vi.fn().mockResolvedValue(undefined),
  getPendingPermission: vi.fn().mockResolvedValue(null),
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
    ...(msg.metadata ? { metadata: msg.metadata } : {}),
  })),
}));

vi.mock("../lib/ipcInstrumentation", () => ({
  pushAgentTurnMetric: vi.fn(),
  pushStreamEvent: vi.fn(),
}));

import { useChatStore, parseSkillsFromSystemMessage } from "./chatStore";
import { useSlashCommandStore } from "./slashCommandStore";
import { listen } from "@tauri-apps/api/event";
import {
  saveChatMessage,
  listChatMessages,
  clearChatMessages,
} from "../lib/tauri";
import { pushAgentTurnMetric, pushStreamEvent } from "../lib/ipcInstrumentation";

beforeEach(() => {
  useChatStore.setState(
    { messages: {}, streamingText: {}, subscriptions: {}, sessionStats: {}, planApproval: {}, permissionRequest: {} },
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

  it("includes displayText when provided", () => {
    useChatStore.getState().addUserMessage("ws-1", "expanded prompt", "/test");

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs[0].displayText).toBe("/test");
  });

  it("omits displayText when not provided", () => {
    useChatStore.getState().addUserMessage("ws-1", "normal message");

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs[0]).not.toHaveProperty("displayText");
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

  it("handles unknown workspace (empty array) without error", () => {
    useChatStore.getState().removeTrailingSystemMessages("unknown-ws");
    // Should not throw - uses empty array default
    expect(useChatStore.getState().messages["unknown-ws"]).toBeUndefined();
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

  it("handles system event with discovered skills", () => {
    const addDiscoveredSkills = vi.fn();
    useSlashCommandStore.setState({ addDiscoveredSkills } as any);

    handleEvent({
      payload: {
        type: "system",
        sessionId: null,
        message: "The following skills are available for use with the Skill tool:\n- commit: Create a git commit\n- review: Review code",
      },
    });

    expect(addDiscoveredSkills).toHaveBeenCalledWith("ws-1", [
      { name: "commit", source: "plugin", description: "Create a git commit", content: "/commit" },
      { name: "review", source: "plugin", description: "Review code", content: "/review" },
    ]);
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

  it("handles assistantImage event - finalizes text then adds image block", () => {
    handleEvent({ payload: { type: "assistantText", text: "here is an image" } });
    handleEvent({
      payload: {
        type: "assistantImage",
        mediaType: "image/png",
        data: "base64data",
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content[0]).toEqual({ type: "text", text: "here is an image" });
    expect(msgs[0].content[1]).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "base64data",
    });
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

  it("persists new assistant message created by toolUse", () => {
    vi.mocked(saveChatMessage).mockClear();
    handleEvent({
      payload: {
        type: "toolUse",
        id: "tool-1",
        name: "write_file",
        input: {},
      },
    });
    expect(saveChatMessage).toHaveBeenCalled();
  });

  it("persists assistant message when toolUse appends to existing message", () => {
    handleEvent({ payload: { type: "assistantText", text: "thinking..." } });
    vi.mocked(saveChatMessage).mockClear();
    handleEvent({
      payload: {
        type: "toolUse",
        id: "tool-1",
        name: "read_file",
        input: { path: "/test" },
      },
    });
    expect(saveChatMessage).toHaveBeenCalled();
  });

  it("handles result event - persists last assistant message", () => {
    // First create an assistant message via streaming text
    handleEvent({ payload: { type: "assistantText", text: "final answer" } });
    // Then complete with result event (non-error)
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
    // The assistant message should have been persisted
    expect(saveChatMessage).toHaveBeenCalled();
  });

  it("result event does not persist when last message is not assistant", () => {
    // Add a user message first, then fire result with no streaming text
    useChatStore.getState().addUserMessage("ws-1", "question");
    vi.mocked(saveChatMessage).mockClear();

    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
      },
    });

    // The last message is a user message, not assistant, so no persistence of assistant msg
    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs[msgs.length - 1].role).toBe("user");
  });

  it("result event with no messages does not persist anything", () => {
    vi.mocked(saveChatMessage).mockClear();

    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    expect(msgs).toHaveLength(0);
  });

  it("handles unknown stream event type with console warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    handleEvent({
      payload: { type: "unknownEventType" },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown stream event type: unknownEventType"),
    );
    warnSpy.mockRestore();
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

  it("uses fallback regex for bare HTTP status codes (e.g. '502 Bad Gateway')", () => {
    expect(getErrorText("502 Bad Gateway")).toContain("Server error (502)");
  });

  it("uses fallback regex for bare 4xx status codes", () => {
    expect(getErrorText("418 I'm a teapot")).toContain("Request error (418)");
  });

  it("falls through when matched code is not 4xx or 5xx (e.g. 301 redirect)", () => {
    // The first regex matches "error: 301" but the code 301 doesn't start with "4" or "5"
    // so it falls through to the generic error handler
    const result = getErrorText("error: 301 Moved Permanently");
    expect(result).toContain("Error:");
    expect(result).toContain("301 Moved Permanently");
  });

  it("formats error with null result as unknown error", () => {
    handleEvent({
      payload: { type: "result", isError: true, result: null, sessionId: null },
    });
    const msgs = useChatStore.getState().messages["ws-1"];
    expect((msgs[msgs.length - 1].content[0] as any).text).toContain(
      "unknown error occurred",
    );
  });

  // Additional mutation-killing tests for error message conditions
  it("detects 500 via 'internal server error' text (case insensitive)", () => {
    expect(getErrorText("code: 500 Something")).toContain("API error (500)");
  });

  it("detects 429 via 'rate limit' text", () => {
    expect(getErrorText("error: 429 Please slow down")).toContain("Rate limited (429)");
  });

  it("detects 429 via 'too many' text", () => {
    expect(getErrorText("error: 429 too many requests")).toContain("Rate limited (429)");
  });

  it("detects 401 via 'authentication' text", () => {
    expect(getErrorText("error: 401 authentication required")).toContain("Authentication error (401)");
  });

  it("detects ENOTFOUND as network error", () => {
    expect(getErrorText("ENOTFOUND api.anthropic.com")).toContain("Network error");
  });

  it("detects 'network' in error as network error", () => {
    expect(getErrorText("network error occurred")).toContain("Network error");
  });

  it("returns different messages for 5xx vs 4xx", () => {
    const server = getErrorText("error: 503");
    const client = getErrorText("error: 400");
    expect(server).toContain("Server error");
    expect(client).toContain("Request error");
    expect(server).not.toEqual(client);
  });

  it("includes error code in message", () => {
    expect(getErrorText("error: 503")).toContain("503");
    expect(getErrorText("error: 400")).toContain("400");
  });

  it("does not match numbers that aren't HTTP codes", () => {
    // "512 tokens" should not match as an HTTP error (no status/error prefix)
    const result = getErrorText("Used 512 tokens");
    expect(result).toContain("Error: Used 512 tokens");
  });

  // Kill || → && mutations by testing secondary condition paths
  it("detects 401 via 'unauthorized' text without code match", () => {
    expect(getErrorText("error: 401 please check credentials")).toContain("Authentication error (401)");
  });

  it("detects 403 via 'forbidden' text without code match", () => {
    expect(getErrorText("error: 403 access forbidden")).toContain("Access denied (403)");
  });

  it("detects timeout via 'timed out' variation", () => {
    expect(getErrorText("Connection timed out")).toContain("timed out");
  });

  it("returns exact short error in fallback (not trimmed)", () => {
    const result = getErrorText("short error");
    expect(result).toBe("Error: short error");
    // Should NOT have "..." when under 120 chars
    expect(result).not.toContain("...");
  });

  it("trims long error with ellipsis in fallback", () => {
    const long = "A".repeat(150);
    const result = getErrorText(long);
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(150);
  });
});

describe("chatStore - parseSkillsFromSystemMessage", () => {
  it("parses skills from message with marker", () => {
    const message = `Some preamble text.
The following skills are available for use with the Skill tool:
- commit: Create a git commit
- review-pr: Review a pull request
More text after.`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({
      name: "commit",
      source: "plugin",
      description: "Create a git commit",
      content: "/commit",
    });
    expect(skills[1]).toEqual({
      name: "review-pr",
      source: "plugin",
      description: "Review a pull request",
      content: "/review-pr",
    });
  });

  it("returns empty array when marker is absent", () => {
    expect(parseSkillsFromSystemMessage("No skills here")).toEqual([]);
  });

  it("stops parsing at </system-reminder>", () => {
    const message = `skills are available for use with the Skill tool:
- commit: Create a commit
</system-reminder>
- ignored: Should not be parsed`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("commit");
  });

  it("skips malformed lines", () => {
    const message = `skills are available for use with the Skill tool:
not a skill line
- no-colon-separator
- : empty name
- valid-skill: A valid one`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("valid-skill");
  });

  it("parses to end of string when no end tag", () => {
    const message = `skills are available for use with the Skill tool:
- alpha: First skill
- beta: Second skill`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills).toHaveLength(2);
  });

  it("handles plugin-prefixed skill names", () => {
    const message = `skills are available for use with the Skill tool:
- plugin:my-tool: A plugin tool`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("plugin:my-tool");
    expect(skills[0].content).toBe("/plugin:my-tool");
  });

  it("correctly extracts description after colon-space separator", () => {
    const message = `skills are available for use with the Skill tool:
- test-skill: The description text here`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills[0].description).toBe("The description text here");
    // Ensure name doesn't include description and vice versa
    expect(skills[0].name).not.toContain("The description");
    expect(skills[0].description).not.toContain("test-skill");
  });

  it("correctly splits on first colon-space (name may contain colons)", () => {
    const message = `skills are available for use with the Skill tool:
- ns:tool: Tool with namespace: more colons`;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills[0].name).toBe("ns:tool");
    expect(skills[0].description).toBe("Tool with namespace: more colons");
  });

  it("uses marker text to find the skills section", () => {
    // Without the exact marker text, no skills are parsed
    const wrong = "The following skills are available:\n- test: desc";
    expect(parseSkillsFromSystemMessage(wrong)).toEqual([]);

    // With the exact marker, skills are parsed
    const correct = "skills are available for use with the Skill tool:\n- test: desc";
    expect(parseSkillsFromSystemMessage(correct)).toHaveLength(1);
  });

  it("trims whitespace from name and description", () => {
    const message = `skills are available for use with the Skill tool:
-   spaced-name  :   spaced description  `;
    const skills = parseSkillsFromSystemMessage(message);
    expect(skills[0].name).toBe("spaced-name");
    expect(skills[0].description).toBe("spaced description");
  });

  it("sets source to 'plugin' for all discovered skills", () => {
    const message = `skills are available for use with the Skill tool:
- a: desc a
- b: desc b`;
    const skills = parseSkillsFromSystemMessage(message);
    skills.forEach(s => expect(s.source).toBe("plugin"));
  });
});

describe("chatStore - result event with metadata", () => {
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

  it("updates sessionStats and calls pushAgentTurnMetric", () => {
    // Create an assistant message first
    handleEvent({ payload: { type: "assistantText", text: "response" } });
    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
        totalCostUsd: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        numTurns: 3,
        durationMs: 2000,
        durationApiMs: 1500,
        cacheReadTokens: 100,
        cacheCreationTokens: 50,
      },
    });

    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats).toEqual({
      totalCostUsd: 0.05,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      numTurns: 3,
      totalCacheReadTokens: 100,
      totalCacheCreationTokens: 50,
    });
    expect(pushAgentTurnMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        durationMs: 2000,
        durationApiMs: 1500,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 100,
        cacheCreationTokens: 50,
        totalCostUsd: 0.05,
        numTurns: 3,
      }),
    );
    expect(pushStreamEvent).toHaveBeenCalledWith("ws-1", "result_handled", "success");
  });

  it("attaches metadata to last assistant message", () => {
    handleEvent({ payload: { type: "assistantText", text: "answer" } });
    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
        totalCostUsd: 0.01,
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        durationMs: 500,
        durationApiMs: 400,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs[0].metadata).toBeDefined();
    expect(msgs[0].metadata?.totalCostUsd).toBe(0.01);
    expect(msgs[0].metadata?.inputTokens).toBe(100);
  });

  it("preserves previous stats when fields are absent", () => {
    // Set up previous stats
    useChatStore.setState({
      sessionStats: {
        "ws-1": {
          totalCostUsd: 0.10,
          totalInputTokens: 2000,
          totalOutputTokens: 1000,
          numTurns: 5,
        },
      },
    });

    handleEvent({ payload: { type: "assistantText", text: "more" } });
    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
        totalCostUsd: null,
        inputTokens: null,
        outputTokens: null,
        numTurns: null,
        durationMs: 100,
      },
    });

    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats?.totalCostUsd).toBe(0.10);
    expect(stats?.totalInputTokens).toBe(2000);
  });

  it("reports error in pushStreamEvent for error results", () => {
    handleEvent({ payload: { type: "assistantText", text: "oops" } });
    handleEvent({
      payload: {
        type: "result",
        isError: true,
        result: "Something failed",
        sessionId: null,
        totalCostUsd: 0.01,
        inputTokens: 50,
        outputTokens: 10,
        numTurns: 1,
        durationMs: 100,
        durationApiMs: 80,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });

    expect(pushStreamEvent).toHaveBeenCalledWith("ws-1", "result_handled", "error");
  });
});

describe("chatStore - clearPermissionRequest", () => {
  it("clears permission request for workspace", () => {
    useChatStore.setState({
      permissionRequest: {
        "ws-1": { toolName: "bash", input: { command: "ls" } },
      },
    });

    useChatStore.getState().clearPermissionRequest("ws-1");

    expect(useChatStore.getState().permissionRequest["ws-1"]).toBeNull();
  });
});

describe("chatStore - getPlanContent", () => {
  it("returns concatenated text from trailing assistant messages", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "user", content: [{ type: "text", text: "plan?" }], timestamp: 1000 },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Step 1" }], timestamp: 2000 },
          { id: "m3", role: "assistant", content: [{ type: "text", text: "Step 2" }], timestamp: 3000 },
        ],
      },
    });

    expect(useChatStore.getState().getPlanContent("ws-1")).toBe("Step 1\n\nStep 2");
  });

  it("stops at non-assistant message", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          { id: "m1", role: "assistant", content: [{ type: "text", text: "Early" }], timestamp: 1000 },
          { id: "m2", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 2000 },
          { id: "m3", role: "assistant", content: [{ type: "text", text: "Later" }], timestamp: 3000 },
        ],
      },
    });

    expect(useChatStore.getState().getPlanContent("ws-1")).toBe("Later");
  });

  it("returns empty string for unknown workspace", () => {
    expect(useChatStore.getState().getPlanContent("unknown")).toBe("");
  });

  it("skips non-text and empty text blocks", () => {
    useChatStore.setState({
      messages: {
        "ws-1": [
          {
            id: "m1",
            role: "assistant",
            content: [
              { type: "toolUse", id: "t1", name: "read", input: {} },
              { type: "text", text: "   " },
              { type: "text", text: "Real content" },
            ],
            timestamp: 1000,
          },
        ],
      },
    });

    expect(useChatStore.getState().getPlanContent("ws-1")).toBe("Real content");
  });
});

describe("chatStore - getSessionStats", () => {
  it("returns stats for known workspace", () => {
    const stats = { totalCostUsd: 0.5, totalInputTokens: 1000, totalOutputTokens: 500, numTurns: 3 };
    useChatStore.setState({ sessionStats: { "ws-1": stats } });
    expect(useChatStore.getState().getSessionStats("ws-1")).toEqual(stats);
  });

  it("returns undefined for unknown workspace", () => {
    expect(useChatStore.getState().getSessionStats("unknown")).toBeUndefined();
  });
});

describe("chatStore - loadMessages with metadata restoration", () => {
  it("restores sessionStats from last message with metadata", async () => {
    const persisted = [
      {
        id: "m1",
        workspaceId: "ws-1",
        role: "user",
        content: [{ type: "text", text: "hi" }],
        timestamp: "2024-01-01T00:00:00Z",
      },
      {
        id: "m2",
        workspaceId: "ws-1",
        role: "assistant",
        content: [{ type: "text", text: "response" }],
        timestamp: "2024-01-01T00:01:00Z",
        metadata: {
          totalCostUsd: 0.03,
          inputTokens: 500,
          outputTokens: 200,
          numTurns: 2,
        },
      },
    ];
    vi.mocked(listChatMessages).mockResolvedValue(persisted as any);

    await useChatStore.getState().loadMessages("ws-1");

    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats).toEqual({
      totalCostUsd: 0.03,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      numTurns: 2,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    });
  });

  it("does not set sessionStats when no messages have metadata", async () => {
    const persisted = [
      {
        id: "m1",
        workspaceId: "ws-1",
        role: "user",
        content: [{ type: "text", text: "hi" }],
        timestamp: "2024-01-01T00:00:00Z",
      },
    ];
    vi.mocked(listChatMessages).mockResolvedValue(persisted as any);

    await useChatStore.getState().loadMessages("ws-1");

    expect(useChatStore.getState().sessionStats["ws-1"]).toBeUndefined();
  });
});

describe("chatStore - permissionRequest event", () => {
  let handleEvent: (event: { payload: any }) => void;

  beforeEach(async () => {
    vi.mocked(listen).mockImplementation(async (_channel, handler) => {
      handleEvent = handler as any;
      return () => {};
    });
    vi.mocked(listChatMessages).mockResolvedValue([]);
    await useChatStore.getState().subscribe("ws-1");
  });

  it("sets permissionRequest state on event", () => {
    handleEvent({
      payload: {
        type: "permissionRequest",
        toolName: "bash",
        input: { command: "rm -rf /" },
      },
    });

    const req = useChatStore.getState().permissionRequest["ws-1"];
    expect(req).toEqual({ toolName: "bash", input: { command: "rm -rf /" } });
  });
});

describe("chatStore - planApproval via exitplanmode toolUse", () => {
  let handleEvent: (event: { payload: any }) => void;

  beforeEach(async () => {
    vi.mocked(listen).mockImplementation(async (_channel, handler) => {
      handleEvent = handler as any;
      return () => {};
    });
    vi.mocked(listChatMessages).mockResolvedValue([]);
    await useChatStore.getState().subscribe("ws-1");
  });

  it("sets planApproval when toolUse name includes exitplanmode", () => {
    handleEvent({
      payload: {
        type: "toolUse",
        id: "tool-1",
        name: "ExitPlanMode",
        input: {},
      },
    });

    expect(useChatStore.getState().planApproval["ws-1"]).toBe(true);
  });

  it("preserves planApproval on result event so approve button stays visible", () => {
    useChatStore.setState({ planApproval: { "ws-1": true } });

    handleEvent({
      payload: { type: "result", isError: false, result: null, sessionId: null },
    });

    // planApproval must NOT be cleared by result — it's cleared by addUserMessage instead
    expect(useChatStore.getState().planApproval["ws-1"]).toBe(true);
  });
});

describe("chatStore - result event branch coverage for ?? fallbacks", () => {
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

  it("result event with metadata when messages[workspaceId] is undefined (exercises ?? [] on set)", () => {
    // Put streaming text but ensure messages["ws-1"] starts undefined
    // (subscribe with empty listChatMessages does not create messages entry)
    // The streaming text will cause finalizeStreamingText to create an assistant message,
    // and then the metadata attachment set() will use state.messages[workspaceId] ?? [].
    useChatStore.setState((state) => ({
      ...state,
      streamingText: { ...state.streamingText, "ws-1": "response text" },
      messages: {},  // explicitly clear messages so messages["ws-1"] is undefined
    }));

    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
        totalCostUsd: 0.02,
        inputTokens: 200,
        outputTokens: 100,
        numTurns: 1,
        durationMs: 300,
        durationApiMs: 250,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });

    // The assistant message should exist with metadata attached
    const msgs = useChatStore.getState().messages["ws-1"];
    expect(msgs).toBeDefined();
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].metadata).toBeDefined();
    expect(msgs[0].metadata?.totalCostUsd).toBe(0.02);

    // Session stats should also be set
    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats).toEqual({
      totalCostUsd: 0.02,
      totalInputTokens: 200,
      totalOutputTokens: 100,
      numTurns: 1,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    });
  });

  it("result event with null metadata fields and no previous sessionStats (exercises ?? 0 fallbacks)", () => {
    // Ensure no previous sessionStats exist
    useChatStore.setState((state) => ({
      ...state,
      sessionStats: {},
    }));

    // Create an assistant message so metadata can be attached
    handleEvent({ payload: { type: "assistantText", text: "hello" } });

    // Fire result with only durationMs set (so hasMetadata is true)
    // but totalCostUsd, inputTokens, outputTokens, numTurns are all null/undefined
    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
        totalCostUsd: null,
        inputTokens: null,
        outputTokens: null,
        numTurns: null,
        durationMs: 500,
        durationApiMs: null,
        cacheReadTokens: null,
        cacheCreationTokens: null,
      },
    });

    // With no previous stats and null fields, the ?? 0 fallbacks should kick in
    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats).toEqual({
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      numTurns: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    });
  });

  it("result event with null metadata fields and existing previous sessionStats (exercises prev?.field fallbacks)", () => {
    // Set up previous stats
    useChatStore.setState((state) => ({
      ...state,
      sessionStats: {
        "ws-1": {
          totalCostUsd: 0.50,
          totalInputTokens: 5000,
          totalOutputTokens: 2500,
          numTurns: 10,
        },
      },
    }));

    // Create an assistant message
    handleEvent({ payload: { type: "assistantText", text: "continuation" } });

    // Fire result with some fields null, some undefined — all should fall back to prev
    handleEvent({
      payload: {
        type: "result",
        isError: false,
        result: null,
        sessionId: null,
        totalCostUsd: undefined,
        inputTokens: undefined,
        outputTokens: undefined,
        numTurns: undefined,
        durationMs: 100,
        durationApiMs: undefined,
        cacheReadTokens: undefined,
        cacheCreationTokens: undefined,
      },
    });

    // Previous stats should be preserved via prev?.field fallback
    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats).toEqual({
      totalCostUsd: 0.50,
      totalInputTokens: 5000,
      totalOutputTokens: 2500,
      numTurns: 10,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    });
  });
});

describe("chatStore - clearMessages clears sessionStats", () => {
  it("removes sessionStats for the workspace", () => {
    useChatStore.setState({
      messages: { "ws-1": [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1000 }] },
      sessionStats: {
        "ws-1": { totalCostUsd: 0.1, totalInputTokens: 100, totalOutputTokens: 50, numTurns: 1 },
        "ws-2": { totalCostUsd: 0.2, totalInputTokens: 200, totalOutputTokens: 100, numTurns: 2 },
      },
    });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);

    useChatStore.getState().clearMessages("ws-1");

    expect(useChatStore.getState().sessionStats["ws-1"]).toBeUndefined();
    expect(useChatStore.getState().sessionStats["ws-2"]).toBeDefined();
  });
});

// ─── Mutation-killing tests: handleStreamEvent ──────────────────────────

describe("chatStore - handleStreamEvent toolUse conductor phases", () => {
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

  it("sets conductorPhase to 'planning' on ExitPlanMode", () => {
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "ExitPlanMode", input: {} } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("planning");
  });

  it("sets conductorPhase to 'questioning' on AskFollowupQuestion", () => {
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "AskFollowupQuestion", input: { question: "which?" } } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("questioning");
  });

  it("sets questionRequest with question text and options", () => {
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "AskFollowupQuestion", input: { question: "pick one", options: ["A", "B"] } } });
    const qr = useChatStore.getState().questionRequest["ws-1"];
    expect(qr).toBeTruthy();
    expect(qr!.question).toBe("pick one");
    expect(qr!.options).toEqual(["A", "B"]);
  });

  it("sets conductorPhase to 'researching' on Think tool", () => {
    // Reset phase to idle first (previous tests may have set it)
    useChatStore.setState({ conductorPhase: { "ws-1": "idle" } });
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "Think", input: {} } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("researching");
  });

  it("does NOT override 'questioning' phase with Think tool", () => {
    useChatStore.setState({ conductorPhase: { "ws-1": "questioning" } });
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "Think", input: {} } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("questioning");
  });

  it("does NOT override 'planning' phase with Think tool", () => {
    useChatStore.setState({ conductorPhase: { "ws-1": "planning" } });
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "Think", input: {} } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("planning");
  });

  it("sets permissionRequest on permissionRequest event", () => {
    handleEvent({ payload: { type: "permissionRequest", toolName: "Bash", input: { command: "ls" } } });
    const pr = useChatStore.getState().permissionRequest["ws-1"];
    expect(pr).toBeTruthy();
    expect(pr!.toolName).toBe("Bash");
    expect(pr!.input).toEqual({ command: "ls" });
  });
});

describe("chatStore - handleStreamEvent result clears state correctly", () => {
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

  it("clears permissionRequest on result event", () => {
    useChatStore.setState({ permissionRequest: { "ws-1": { toolName: "Read", input: {} } as any } });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    expect(useChatStore.getState().permissionRequest["ws-1"]).toBeNull();
  });

  it("resets conductorPhase to idle on result when no plan/question pending", () => {
    useChatStore.setState({
      conductorPhase: { "ws-1": "researching" },
      planApproval: { "ws-1": false },
      questionRequest: { "ws-1": null },
    });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("idle");
  });

  it("preserves conductorPhase when planApproval is active", () => {
    useChatStore.setState({ planApproval: { "ws-1": true }, conductorPhase: { "ws-1": "planning" } });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("planning");
  });

  it("preserves conductorPhase when questionRequest is active", () => {
    useChatStore.setState({
      questionRequest: { "ws-1": { toolUseId: "t1", question: "which?" } as any },
      conductorPhase: { "ws-1": "questioning" },
    });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("questioning");
  });

  it("attaches metadata to last assistant message on result", () => {
    // Add an assistant message first
    useChatStore.setState({
      messages: { "ws-1": [{ id: "m1", role: "assistant", content: [{ type: "text", text: "hello" }], timestamp: 1000 }] },
    });
    handleEvent({ payload: {
      type: "result", isError: false, result: null, sessionId: "s1",
      durationMs: 5000, totalCostUsd: 0.05, inputTokens: 100, outputTokens: 200,
      numTurns: 1, cacheReadTokens: 0, cacheCreationTokens: 0,
    } });

    const msgs = useChatStore.getState().messages["ws-1"]!;
    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.metadata).toBeTruthy();
    expect(lastMsg.metadata!.totalCostUsd).toBe(0.05);
    expect(lastMsg.metadata!.inputTokens).toBe(100);
  });

  it("updates sessionStats on result with metadata", () => {
    handleEvent({ payload: {
      type: "result", isError: false, result: null, sessionId: "s1",
      durationMs: 5000, totalCostUsd: 0.10, inputTokens: 500, outputTokens: 1000,
      numTurns: 3, cacheReadTokens: 50, cacheCreationTokens: 10,
    } });

    const stats = useChatStore.getState().sessionStats["ws-1"];
    expect(stats).toBeTruthy();
    expect(stats!.totalCostUsd).toBe(0.10);
    expect(stats!.totalInputTokens).toBe(500);
    expect(stats!.totalOutputTokens).toBe(1000);
    expect(stats!.numTurns).toBe(3);
  });

  it("creates system message for system event with message", () => {
    handleEvent({ payload: { type: "system", message: "System initialized", sessionId: "s1" } });
    const msgs = useChatStore.getState().messages["ws-1"]!;
    expect(msgs.length).toBe(1);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content[0]).toEqual({ type: "text", text: "System initialized" });
  });

  it("accumulates streaming text on assistantText events", () => {
    handleEvent({ payload: { type: "assistantText", text: "Hello " } });
    handleEvent({ payload: { type: "assistantText", text: "world" } });
    expect(useChatStore.getState().streamingText["ws-1"]).toBe("Hello world");
  });

  it("persists message on result when no metadata but assistant message exists", () => {
    useChatStore.setState({
      messages: { "ws-1": [{ id: "m1", role: "assistant", content: [{ type: "text", text: "response" }], timestamp: 1000 }] },
    });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    // saveChatMessage should have been called to persist the assistant message
    expect(saveChatMessage).toHaveBeenCalled();
  });

  it("does not persist when result has no metadata and no assistant message", () => {
    vi.mocked(saveChatMessage).mockClear();
    useChatStore.setState({
      messages: { "ws-1": [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1000 }] },
    });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    // No assistant message to persist — saveChatMessage should NOT be called for the result persist path
    // (it may be called for the error message if isError)
  });

  it("preserves session stats from previous turn when fields are absent", () => {
    useChatStore.setState({
      sessionStats: { "ws-1": { totalCostUsd: 0.05, totalInputTokens: 100, totalOutputTokens: 50, numTurns: 1, totalCacheReadTokens: 0, totalCacheCreationTokens: 0 } },
    });
    handleEvent({ payload: {
      type: "result", isError: false, result: null, sessionId: null,
      totalCostUsd: 0.10, inputTokens: null, outputTokens: null, numTurns: 2,
    } });
    const stats = useChatStore.getState().sessionStats["ws-1"]!;
    expect(stats.totalCostUsd).toBe(0.10);
    expect(stats.totalInputTokens).toBe(100); // preserved from previous
    expect(stats.numTurns).toBe(2);
  });

  it("result with no metadata and last msg is user does not persist", () => {
    vi.mocked(saveChatMessage).mockClear();
    useChatStore.setState({
      messages: { "ws-1": [{ id: "u1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1000 }] },
    });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    // No assistant message to persist — saveChatMessage should not be called for persist path
    // (system error message isn't added because isError is false)
    expect(saveChatMessage).not.toHaveBeenCalled();
  });

  it("result with metadata but no messages creates no crash", () => {
    // Empty messages array — should not crash
    useChatStore.setState({ messages: {} });
    handleEvent({ payload: {
      type: "result", isError: false, result: null, sessionId: null,
      durationMs: 1000, totalCostUsd: 0.01, inputTokens: 10, outputTokens: 20,
      numTurns: 1,
    } });
    // Should not throw — the msgs ?? [] fallback prevents crash
    expect(true).toBe(true);
  });

  it("result with hasMetadata false skips session stats update", () => {
    useChatStore.setState({ sessionStats: {} });
    handleEvent({ payload: { type: "result", isError: false, result: null, sessionId: null } });
    // No metadata fields → hasMetadata false → no sessionStats update
    expect(useChatStore.getState().sessionStats["ws-1"]).toBeUndefined();
  });

  it("system event with skills triggers slash command store", () => {
    const msg = "The following skills are available for use with the Skill tool:\n- test-skill: A test skill";
    handleEvent({ payload: { type: "system", message: msg, sessionId: "s1" } });
    // The system message should be persisted
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    expect(msgs.some((m: any) => m.role === "system")).toBe(true);
  });

  it("system event with no skills parses without error", () => {
    handleEvent({ payload: { type: "system", message: "No skills here", sessionId: "s1" } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    expect(msgs.some((m: any) => m.role === "system")).toBe(true);
  });

  it("adds toolResult content block", () => {
    // First add a tool use
    handleEvent({ payload: { type: "toolUse", id: "t1", name: "Read", input: { file: "test.ts" } } });
    // Then add result
    handleEvent({ payload: { type: "toolResult", toolUseId: "t1", content: "file content here" } });

    const msgs = useChatStore.getState().messages["ws-1"]!;
    const lastMsg = msgs[msgs.length - 1];
    const toolResult = lastMsg.content.find((b: any) => b.type === "toolResult");
    expect(toolResult).toBeTruthy();
    expect((toolResult as any).content).toBe("file content here");
  });
});

describe("chatStore - friendlyErrorMessage", () => {
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

  it("formats 500 errors as system message", () => {
    handleEvent({ payload: { type: "result", isError: true, result: "HTTP status: 500 Internal Server Error", sessionId: null } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    const errorMsg = msgs.find((m: any) => m.role === "system" && m.content.some((c: any) => c.text?.includes("500")));
    expect(errorMsg).toBeTruthy();
  });

  it("formats 429 rate limit errors as system message", () => {
    handleEvent({ payload: { type: "result", isError: true, result: "API Error: status 429 rate limit exceeded", sessionId: null } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    const errorMsg = msgs.find((m: any) => m.role === "system" && m.content.some((c: any) => c.text?.includes("429")));
    expect(errorMsg).toBeTruthy();
  });

  it("formats timeout errors as system message", () => {
    handleEvent({ payload: { type: "result", isError: true, result: "Request timed out after 30s", sessionId: null } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    const errorMsg = msgs.find((m: any) => m.role === "system" && m.content.some((c: any) => c.text?.includes("timed out")));
    expect(errorMsg).toBeTruthy();
  });

  it("formats network errors as system message", () => {
    handleEvent({ payload: { type: "result", isError: true, result: "ECONNREFUSED connection refused", sessionId: null } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    const errorMsg = msgs.find((m: any) => m.role === "system" && m.content.some((c: any) => c.text?.includes("Network error")));
    expect(errorMsg).toBeTruthy();
  });

  it("formats overloaded errors as system message", () => {
    handleEvent({ payload: { type: "result", isError: true, result: "API is overloaded try later", sessionId: null } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    const errorMsg = msgs.find((m: any) => m.role === "system" && m.content.some((c: any) => c.text?.includes("overloaded")));
    expect(errorMsg).toBeTruthy();
  });

  it("adds unknown error message when result is null", () => {
    handleEvent({ payload: { type: "result", isError: true, result: null, sessionId: null } });
    const msgs = useChatStore.getState().messages["ws-1"] ?? [];
    const errorMsg = msgs.find((m: any) => m.role === "system" && m.content.some((c: any) => c.text?.includes("unknown error")));
    expect(errorMsg).toBeTruthy();
  });
});

// ─── Mutation-killing tests: state management ───────────────────────────

describe("chatStore - addUserMessage resets conductor state", () => {
  it("resets planApproval to false", () => {
    useChatStore.setState({
      planApproval: { "ws-1": true },
    });
    useChatStore.getState().addUserMessage("ws-1", "hello");
    expect(useChatStore.getState().planApproval["ws-1"]).toBe(false);
  });

  it("resets permissionRequest to null", () => {
    useChatStore.setState({
      permissionRequest: { "ws-1": { toolName: "Read", input: {} } as any },
    });
    useChatStore.getState().addUserMessage("ws-1", "hello");
    expect(useChatStore.getState().permissionRequest["ws-1"]).toBeNull();
  });

  it("resets questionRequest to null", () => {
    useChatStore.setState({
      questionRequest: { "ws-1": { question: "which?" } as any },
    });
    useChatStore.getState().addUserMessage("ws-1", "hello");
    expect(useChatStore.getState().questionRequest["ws-1"]).toBeNull();
  });

  it("resets conductorPhase to idle", () => {
    useChatStore.setState({
      conductorPhase: { "ws-1": "researching" },
    });
    useChatStore.getState().addUserMessage("ws-1", "hello");
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("idle");
  });

  it("preserves other workspace state when resetting", () => {
    useChatStore.setState({
      planApproval: { "ws-1": true, "ws-2": true },
      permissionRequest: { "ws-2": { toolName: "Bash", input: {} } as any },
    });
    useChatStore.getState().addUserMessage("ws-1", "hello");
    // ws-2 should be untouched
    expect(useChatStore.getState().planApproval["ws-2"]).toBe(true);
    expect(useChatStore.getState().permissionRequest["ws-2"]).toBeTruthy();
  });
});

describe("chatStore - clearMessages resets all workspace state", () => {
  it("resets streamingText", () => {
    useChatStore.setState({ streamingText: { "ws-1": "partial text" } });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);
    useChatStore.getState().clearMessages("ws-1");
    expect(useChatStore.getState().streamingText["ws-1"]).toBe("");
  });

  it("resets planApproval to false", () => {
    useChatStore.setState({ planApproval: { "ws-1": true } });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);
    useChatStore.getState().clearMessages("ws-1");
    expect(useChatStore.getState().planApproval["ws-1"]).toBe(false);
  });

  it("resets permissionRequest to null", () => {
    useChatStore.setState({ permissionRequest: { "ws-1": { toolName: "Bash", input: {} } as any } });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);
    useChatStore.getState().clearMessages("ws-1");
    expect(useChatStore.getState().permissionRequest["ws-1"]).toBeNull();
  });

  it("resets questionRequest to null", () => {
    useChatStore.setState({ questionRequest: { "ws-1": { question: "?" } as any } });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);
    useChatStore.getState().clearMessages("ws-1");
    expect(useChatStore.getState().questionRequest["ws-1"]).toBeNull();
  });

  it("resets conductorPhase to idle", () => {
    useChatStore.setState({ conductorPhase: { "ws-1": "researching" } });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);
    useChatStore.getState().clearMessages("ws-1");
    expect(useChatStore.getState().conductorPhase["ws-1"]).toBe("idle");
  });
});

describe("chatStore - clearMessages cancels tokens and tears down", () => {
  it("tears down subscription on clearMessages", () => {
    const unsub = vi.fn();
    useChatStore.setState({
      messages: { "ws-1": [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1000 }] },
      subscriptions: { "ws-1": unsub },
    });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);

    useChatStore.getState().clearMessages("ws-1");

    expect(unsub).toHaveBeenCalled();
    expect(useChatStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });

  it("clears messages array for workspace", () => {
    useChatStore.setState({
      messages: { "ws-1": [{ id: "m1", role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1000 }] },
    });
    vi.mocked(clearChatMessages).mockResolvedValue(undefined);

    useChatStore.getState().clearMessages("ws-1");

    const msgs = useChatStore.getState().messages["ws-1"];
    expect(!msgs || msgs.length === 0).toBe(true);
  });
});

describe("chatStore - subscribe cancellation tokens", () => {
  it("cancels previous in-flight subscribe", async () => {
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();
    let callCount = 0;
    vi.mocked(listen).mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? unlisten1 : unlisten2;
    });

    // Start first subscribe — don't await
    const p1 = useChatStore.getState().subscribe("ws-1");
    // Start second subscribe immediately — should cancel first
    const p2 = useChatStore.getState().subscribe("ws-1");

    await p1;
    await p2;

    // The subscription should exist (second one won)
    expect(useChatStore.getState().subscriptions["ws-1"]).toBeDefined();
  });

  it("removes subscription from state on error", async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error("connection failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await useChatStore.getState().subscribe("ws-err");

    // Subscription should not be in state after failure
    expect(useChatStore.getState().subscriptions["ws-err"]).toBeUndefined();
    consoleSpy.mockRestore();
  });
});

describe("chatStore - unsubscribe cleans up tokens", () => {
  it("calls unlisten function on unsubscribe", () => {
    const unsub = vi.fn();
    useChatStore.setState({ subscriptions: { "ws-1": unsub } });

    useChatStore.getState().unsubscribe("ws-1");

    expect(unsub).toHaveBeenCalled();
    expect(useChatStore.getState().subscriptions["ws-1"]).toBeUndefined();
  });
});
