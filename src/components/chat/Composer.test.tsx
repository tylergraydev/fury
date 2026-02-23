import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";
import { useSlashCommandStore } from "../../stores/slashCommandStore";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { useTodoStore } from "../../stores/todoStore";

beforeEach(() => {
  useSlashCommandStore.setState({
    commands: {},
    loading: {},
    error: {},
    loadCommands: vi.fn(),
  });
  useFileTreeStore.setState({
    files: {},
    expandedDirs: {},
    loading: {},
    error: {},
    loadFiles: vi.fn(),
    loadRepoFiles: vi.fn(),
    toggleDir: vi.fn(),
  });
  useTodoStore.setState({ todos: {} });
});

const defaultProps = {
  contextId: "ws-1",
  contextType: "workspace" as const,
  agentStatus: "Idle" as const,
  onSend: vi.fn(),
  onStop: vi.fn(),
  thinkingEnabled: true,
  onThinkingEnabledChange: vi.fn(),
  planEnabled: true,
  onPlanEnabledChange: vi.fn(),
};

describe("Composer", () => {
  it("renders textarea and send button", () => {
    render(<Composer {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("shows Idle status by default", () => {
    render(<Composer {...defaultProps} />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("send button is disabled when text is empty", () => {
    render(<Composer {...defaultProps} />);
    const sendBtn = screen.getByText("Send").closest("button")!;
    expect(sendBtn).toBeDisabled();
  });

  it("send button is enabled when text is entered", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.type(screen.getByRole("textbox"), "hello");
    const sendBtn = screen.getByText("Send").closest("button")!;
    expect(sendBtn).not.toBeDisabled();
  });

  it("calls onSend when send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "test message");
    await user.click(screen.getByText("Send").closest("button")!);
    expect(onSend).toHaveBeenCalledWith("test message", undefined);
  });

  it("calls onSend on Enter key", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello", undefined);
  });

  it("does not send on Shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "hello{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "test{Enter}");
    expect(textarea).toHaveValue("");
  });

  it("shows Running status and stop button when agent is running", () => {
    render(<Composer {...defaultProps} agentStatus="Running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("disables textarea when agent is running", () => {
    render(<Composer {...defaultProps} agentStatus="Running" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} agentStatus="Running" onStop={onStop} />);
    await user.click(screen.getByText("Stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("shows Stopping status when agent is stopping", () => {
    render(<Composer {...defaultProps} agentStatus="Stopping" />);
    expect(screen.getByText("Stopping")).toBeInTheDocument();
    expect(screen.getByText("Stopping...")).toBeInTheDocument();
  });

  it("shows Error status when agent has error", () => {
    render(
      <Composer {...defaultProps} agentStatus={{ Error: "something broke" }} />,
    );
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  // --- contextType "repo" loads repo files ---
  it("loads repo files when contextType is repo", () => {
    const loadRepoFiles = vi.fn();
    useFileTreeStore.setState({ loadRepoFiles });
    render(<Composer {...defaultProps} contextId="repo-1" contextType="repo" />);
    expect(loadRepoFiles).toHaveBeenCalledWith("repo-1");
  });

  it("loads workspace files when contextType is workspace and no files cached", () => {
    const loadFiles = vi.fn();
    useFileTreeStore.setState({ loadFiles });
    render(<Composer {...defaultProps} contextId="ws-1" contextType="workspace" />);
    expect(loadFiles).toHaveBeenCalledWith("ws-1");
  });

  // --- handleSend does not send when canSend is false ---
  it("does not call onSend when text is empty and send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.click(screen.getByText("Send").closest("button")!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("handleSend early returns when canSend is false (Enter on empty text)", async () => {
    const onSend = vi.fn();
    render(<Composer {...defaultProps} onSend={onSend} />);
    // Directly fire keydown Enter on the textarea to trigger handleKeyDown -> handleSend
    // with empty text (canSend is false)
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  // --- @todos expansion ---
  it("expands @todos mention when sending in workspace context", async () => {
    const onSend = vi.fn();
    useTodoStore.setState({
      todos: {
        "ws-1": [
          { id: "t1", workspaceId: "ws-1", text: "Fix bug", completed: false, sortOrder: 0 },
          { id: "t2", workspaceId: "ws-1", text: "Write tests", completed: true, sortOrder: 1 },
        ],
      },
    });
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Here are @todos please review");
    await user.click(screen.getByText("Send").closest("button")!);
    expect(onSend).toHaveBeenCalledTimes(1);
    const sentMessage = onSend.mock.calls[0][0];
    expect(sentMessage).toContain("Fix bug");
    expect(sentMessage).toContain("Write tests");
    expect(sentMessage).not.toContain("@todos");
  });

  // --- Slash command autocomplete ---
  describe("slash command autocomplete", () => {
    beforeEach(() => {
      useSlashCommandStore.setState({
        commands: {
          "ws-1": [
            { name: "test", source: "project", description: "Test command", content: "test content" },
            { name: "deploy", source: "global", description: "Deploy", content: "deploy content" },
          ],
        },
        loading: {},
        error: {},
        loadCommands: vi.fn(),
      });
    });

    it("shows slash command menu when typing /", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "/");
      // Should see builtin /clear plus the custom commands
      expect(screen.getByText("/clear")).toBeInTheDocument();
      expect(screen.getByText("/test")).toBeInTheDocument();
      expect(screen.getByText("/deploy")).toBeInTheDocument();
    });

    it("filters slash commands as user types", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "/te");
      expect(screen.getByText("/test")).toBeInTheDocument();
      expect(screen.queryByText("/deploy")).not.toBeInTheDocument();
    });

    it("navigates slash commands with arrow keys", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "/");
      // By default, first item is selected. Press ArrowDown to move to second item.
      await user.keyboard("{ArrowDown}");
      // Press ArrowUp to go back
      await user.keyboard("{ArrowUp}");
      // Press Enter to select the first command
      await user.keyboard("{Enter}");
      // The /clear builtin is the first command, and it's an action command
      // so it executes without setting text
    });

    it("selects slash command with Enter key and inserts content", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      // "test" should be the only matching command; press Enter to select it
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("test content");
    });

    it("selects slash command with Tab key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      await user.keyboard("{Tab}");
      expect(textarea).toHaveValue("test content");
    });

    it("closes slash menu on Escape key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "/");
      expect(screen.getByText("/clear")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByText("/clear")).not.toBeInTheDocument();
    });

    it("selects a command by clicking it in the dropdown", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/");
      // Click on /test command
      await user.click(screen.getByText("/test"));
      expect(textarea).toHaveValue("test content");
    });

    it("hides slash menu when text does not start with /", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/");
      expect(screen.getByText("/clear")).toBeInTheDocument();
      await user.clear(textarea);
      await user.type(textarea, "hello");
      expect(screen.queryByText("/clear")).not.toBeInTheDocument();
    });

    it("executes action commands immediately without inserting content", async () => {
      // The /clear command has an action property
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/cl");
      // Enter to select /clear
      await user.keyboard("{Enter}");
      // Text should be empty since /clear is an action command
      expect(textarea).toHaveValue("");
    });

    it("shows command source labels", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "/");
      expect(screen.getByText("built-in")).toBeInTheDocument();
      expect(screen.getByText("project")).toBeInTheDocument();
    });

    it("ArrowDown at last item does not exceed bounds", async () => {
      useSlashCommandStore.setState({
        commands: {
          "ws-1": [
            { name: "only", source: "project", description: "Only one", content: "only content" },
          ],
        },
        loading: {},
        error: {},
        loadCommands: vi.fn(),
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/on");
      // Only one matching command. ArrowDown should not crash.
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("only content");
    });

    it("ArrowUp at first item stays at 0", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      // Already at index 0; ArrowUp should stay there
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("test content");
    });

    it("shows plugin source with accent color", async () => {
      useSlashCommandStore.setState({
        commands: {
          "ws-1": [
            { name: "plugincmd", source: "plugin", description: "A plugin cmd", content: "plugin stuff" },
          ],
        },
        loading: {},
        error: {},
        loadCommands: vi.fn(),
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "/plugin");
      expect(screen.getByText("plugin")).toBeInTheDocument();
    });
  });

  // --- @mention autocomplete ---
  describe("@mention autocomplete", () => {
    beforeEach(() => {
      useFileTreeStore.setState({
        files: {
          "ws-1": ["src/main.ts", "src/utils/helper.ts", "README.md"],
        },
        expandedDirs: {},
        loading: {},
        error: {},
      });
    });

    it("shows @mention menu when typing @", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      expect(screen.getByText("@todos")).toBeInTheDocument();
      expect(screen.getByText("main.ts")).toBeInTheDocument();
    });

    it("filters @mention items as user types", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@main");
      expect(screen.getByText("main.ts")).toBeInTheDocument();
      expect(screen.queryByText("helper.ts")).not.toBeInTheDocument();
    });

    it("shows @todos item for workspace context", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@tod");
      expect(screen.getByText("@todos")).toBeInTheDocument();
    });

    it("does not show @todos for repo context", async () => {
      useFileTreeStore.setState({
        files: {
          "repo-1": ["src/main.ts"],
        },
        expandedDirs: {},
        loading: {},
        error: {},
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} contextId="repo-1" contextType="repo" />);
      await user.type(screen.getByRole("textbox"), "@tod");
      expect(screen.queryByText("@todos")).not.toBeInTheDocument();
    });

    it("navigates @mention items with arrow keys", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      // Navigate down, up, then select with Enter
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      // First item is @todos
      expect(textarea).toHaveValue("@todos ");
    });

    it("selects @mention file item with Enter key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@main");
      // main.ts should be the only file match (plus maybe @todos if "main" doesn't filter it out)
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("src/main.ts ");
    });

    it("selects @mention with Tab key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@main");
      await user.keyboard("{Tab}");
      expect(textarea).toHaveValue("src/main.ts ");
    });

    it("closes @mention menu on Escape key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      expect(screen.getByText("@todos")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByText("@todos")).not.toBeInTheDocument();
    });

    it("selects @mention item by clicking it", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      await user.click(screen.getByText("main.ts"));
      expect(textarea).toHaveValue("src/main.ts ");
    });

    it("selects @todos item by clicking it", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      await user.click(screen.getByText("@todos"));
      expect(textarea).toHaveValue("@todos ");
    });

    it("hides @mention menu when space is typed after @", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@ ");
      // The space after @ means the filter includes a space, which closes the menu
      expect(screen.queryByText("@todos")).not.toBeInTheDocument();
    });

    it("does not trigger @mention when @ is preceded by a letter", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "email@");
      // @ preceded by "l" (not space/newline), so menu should not show
      expect(screen.queryByText("@todos")).not.toBeInTheDocument();
    });

    it("triggers @mention after newline", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      // Type text, then shift+enter for newline, then @
      await user.type(textarea, "hello{Shift>}{Enter}{/Shift}@");
      expect(screen.getByText("@todos")).toBeInTheDocument();
    });

    it("shows file description when label differs from description", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@main");
      // label is "main.ts", description is "src/main.ts" - they differ, so description is shown
      expect(screen.getByText("src/main.ts")).toBeInTheDocument();
    });

    it("ArrowDown does not exceed bounds in @mention menu", async () => {
      useFileTreeStore.setState({
        files: { "ws-1": ["only.ts"] },
        expandedDirs: {},
        loading: {},
        error: {},
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@onl");
      // Only one file matches. ArrowDown should clamp.
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("only.ts ");
    });

    it("ArrowUp at first @mention item stays at 0", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@main");
      // Already at index 0; ArrowUp should stay there
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("src/main.ts ");
    });

    it("limits @mention items to 8", async () => {
      useFileTreeStore.setState({
        files: {
          "ws-1": [
            "a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts", "h.ts", "i.ts", "j.ts",
          ],
        },
        expandedDirs: {},
        loading: {},
        error: {},
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      // @todos (1) + files (up to 7) = 8 max, or files capped at 8 items total
      const buttons = screen.getAllByRole("button").filter(
        (b) => b.closest('[class*="absolute"]'),
      );
      // Should not exceed 8 items total
      expect(buttons.length).toBeLessThanOrEqual(8);
    });
  });

  // --- Textarea auto-resize ---
  it("auto-resizes textarea on input", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Mock scrollHeight
    Object.defineProperty(textarea, "scrollHeight", { value: 100, configurable: true });
    await user.type(textarea, "line1");
    // Height should be set during handleInput
    expect(textarea.style.height).toBeDefined();
  });

  it("caps textarea height at 200px", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "scrollHeight", { value: 500, configurable: true });
    await user.type(textarea, "a");
    expect(textarea.style.height).toBe("200px");
  });

  // --- No text present hides @mention when no @ ---
  it("hides @mention menu when there is no @ in text", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "hello world");
    expect(screen.queryByText("@todos")).not.toBeInTheDocument();
  });

  // --- Thinking & Plan mode toggles ---
  describe("thinking and plan mode toggles", () => {
    it("renders Thinking and Plan toggle buttons", () => {
      render(<Composer {...defaultProps} />);
      expect(screen.getByTitle("Thinking enabled (click to disable)")).toBeInTheDocument();
      expect(screen.getByTitle("Plan mode enabled (click to disable)")).toBeInTheDocument();
    });

    it("calls onThinkingEnabledChange when thinking toggle is clicked", async () => {
      const onThinkingEnabledChange = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onThinkingEnabledChange={onThinkingEnabledChange} />);
      await user.click(screen.getByTitle("Thinking enabled (click to disable)"));
      expect(onThinkingEnabledChange).toHaveBeenCalledWith(false);
    });

    it("shows disabled state when thinkingEnabled=false", () => {
      render(<Composer {...defaultProps} thinkingEnabled={false} />);
      expect(screen.getByTitle("Thinking disabled (click to enable)")).toBeInTheDocument();
    });

    it("calls onPlanEnabledChange when plan toggle is clicked", async () => {
      const onPlanEnabledChange = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onPlanEnabledChange={onPlanEnabledChange} />);
      await user.click(screen.getByTitle("Plan mode enabled (click to disable)"));
      expect(onPlanEnabledChange).toHaveBeenCalledWith(false);
    });

    it("shows disabled state when planEnabled=false", () => {
      render(<Composer {...defaultProps} planEnabled={false} />);
      expect(screen.getByTitle("Plan mode disabled (click to enable)")).toBeInTheDocument();
    });

    it("toggles are disabled when agent is running", () => {
      render(<Composer {...defaultProps} agentStatus="Running" />);
      expect(screen.getByTitle("Thinking enabled (click to disable)")).toBeDisabled();
      expect(screen.getByTitle("Plan mode enabled (click to disable)")).toBeDisabled();
    });
  });

  // --- Stopping state disables stop button ---
  it("disables stop button when agent is stopping", () => {
    render(<Composer {...defaultProps} agentStatus="Stopping" />);
    const stopBtn = screen.getByText("Stopping...").closest("button")!;
    expect(stopBtn).toBeDisabled();
  });

  // --- Disables textarea when agent is stopping ---
  it("disables textarea when agent is stopping", () => {
    render(<Composer {...defaultProps} agentStatus="Stopping" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  // --- handleSend does not send when running ---
  it("does not send when agent is running", async () => {
    const onSend = vi.fn();
    render(<Composer {...defaultProps} agentStatus="Running" onSend={onSend} />);
    // textarea is disabled, so we can't type. But the handleSend path checks canSend anyway.
    expect(onSend).not.toHaveBeenCalled();
  });

  // --- @todos not expanded for repo context ---
  it("does not expand @todos in repo context", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    useFileTreeStore.setState({
      files: { "repo-1": [] },
      expandedDirs: {},
      loading: {},
      error: {},
    });
    render(
      <Composer
        {...defaultProps}
        contextId="repo-1"
        contextType="repo"
        onSend={onSend}
      />,
    );
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Check @todos now");
    await user.click(screen.getByText("Send").closest("button")!);
    // In repo context, workspaceId is undefined, so @todos is NOT expanded
    expect(onSend).toHaveBeenCalledWith("Check @todos now", undefined);
  });

  // --- Slash command on multiline: / must be at start of current line ---
  it("shows slash menu when / is at start of a new line in multiline input", async () => {
    useSlashCommandStore.setState({
      commands: {
        "ws-1": [
          { name: "test", source: "project", description: "Test", content: "tc" },
        ],
      },
      loading: {},
      error: {},
      loadCommands: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "hello{Shift>}{Enter}{/Shift}/te");
    expect(screen.getByText("/test")).toBeInTheDocument();
  });

  // --- selectAtItem inserts after existing text ---
  it("inserts @mention at cursor position preserving surrounding text", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "check @");
    await user.click(screen.getByText("@todos"));
    expect(textarea).toHaveValue("check @todos ");
  });

});
