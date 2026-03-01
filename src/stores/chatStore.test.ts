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

  it("clears planApproval on result event", () => {
    useChatStore.setState({ planApproval: { "ws-1": true } });

    handleEvent({
      payload: { type: "result", isError: false, result: null, sessionId: null },
    });

    expect(useChatStore.getState().planApproval["ws-1"]).toBe(false);
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
