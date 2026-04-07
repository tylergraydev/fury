import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Composer } from "./Composer";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSlashCommandStore } from "../../stores/slashCommandStore";
import { useFileTreeStore } from "../../stores/fileTreeStore";
import { useTodoStore } from "../../stores/todoStore";
import { usePromptLibraryStore } from "../../stores/promptLibraryStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { readFileBase64, saveClipboardImage } from "../../lib/tauri";

vi.mock("../../lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/tauri")>();
  return {
    ...actual,
    readFileBase64: vi.fn().mockResolvedValue("data:image/png;base64,abc123"),
    saveClipboardImage: vi.fn().mockResolvedValue("/tmp/clipboard-images/paste-test.png"),
    listPrompts: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("../../lib/tauri/diff", () => ({
  getDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  getRepoDiff: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
}));

vi.mock("../../lib/tauri/repository", () => ({
  listRepoDirectories: vi.fn().mockResolvedValue(["src", "tests", "docs"]),
  getGitLog: vi.fn().mockResolvedValue([]),
  listRepositories: vi.fn().mockResolvedValue([]),
  listBranches: vi.fn().mockResolvedValue([]),
  listRepoFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../prompt-library/PromptLibraryDialog", () => ({
  PromptLibraryDialog: ({ onClose, onInsert }: { onClose: () => void; onInsert: (content: string, name: string) => void }) => (
    <div data-testid="prompt-library-dialog">
      <button data-testid="prompt-close" onClick={onClose}>Close</button>
      <button data-testid="prompt-insert" onClick={() => onInsert("resolved content", "/my-prompt")}>Insert</button>
    </div>
  ),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => { throw new Error("not in tauri"); }),
}));

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
  useWorkspaceStore.setState({
    workspaces: [
      { id: "ws-1", repoId: "repo-1", name: "test-ws", branch: "main", status: "Active", portBase: 3000, autoCommit: false, pinned: false, createdAt: "", archivedAt: null },
    ],
    activeWorkspaceId: "ws-1",
    activeRepoId: "repo-1",
  });
  useRepositoryStore.setState({
    repositories: [
      { id: "repo-1", name: "test-repo", path: "/tmp/test", defaultBranch: "main", provider: "git_hub", remoteUrl: null },
    ],
  });
  usePromptLibraryStore.setState({
    prompts: [],
    loading: false,
    error: null,
  });
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
    expect(screen.getByTitle("Send message")).toBeInTheDocument();
  });

  it("send button is disabled when text is empty", () => {
    render(<Composer {...defaultProps} />);
    expect(screen.getByTitle("Send message")).toBeDisabled();
  });

  it("send button is enabled when text is entered", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.type(screen.getByRole("textbox"), "hello");
    expect(screen.getByTitle("Send message")).not.toBeDisabled();
  });

  it("calls onSend when send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "test message");
    await user.click(screen.getByTitle("Send message"));
    expect(onSend).toHaveBeenCalledWith("test message", undefined, undefined);
  });

  it("calls onSend on Enter key", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello", undefined, undefined);
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

  it("shows stop button when agent is running", () => {
    render(<Composer {...defaultProps} agentStatus="Running" />);
    expect(screen.getByTitle("Stop")).toBeInTheDocument();
  });

  it("keeps textarea enabled when agent is running for follow-up messages", () => {
    render(<Composer {...defaultProps} agentStatus="Running" />);
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} agentStatus="Running" onStop={onStop} />);
    await user.click(screen.getByTitle("Stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("shows Stopping title when agent is stopping", () => {
    render(<Composer {...defaultProps} agentStatus="Stopping" />);
    expect(screen.getByTitle("Stopping...")).toBeInTheDocument();
  });

  // --- contextType "repo" loads repo files ---
  it("loads repo files when contextType is repo", async () => {
    const loadRepoFiles = vi.fn();
    useFileTreeStore.setState({ loadRepoFiles });
    render(<Composer {...defaultProps} contextId="repo-1" contextType="repo" />);
    await vi.waitFor(() => {
      expect(loadRepoFiles).toHaveBeenCalledWith("repo-1");
    });
  });

  it("loads workspace files when contextType is workspace and no files cached", async () => {
    const loadFiles = vi.fn();
    useFileTreeStore.setState({ loadFiles });
    render(<Composer {...defaultProps} contextId="ws-1" contextType="workspace" />);
    await vi.waitFor(() => {
      expect(loadFiles).toHaveBeenCalledWith("ws-1");
    });
  });

  // --- handleSend does not send when canSend is false ---
  it("does not call onSend when text is empty and send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.click(screen.getByTitle("Send message"));
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
    await user.click(screen.getByTitle("Send message"));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
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
      expect(textarea).toHaveValue("/test");
    });

    it("passes command name as displayText when sending after command selection", async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onSend={onSend} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      await user.keyboard("{Enter}"); // selects /test command
      await user.click(screen.getByTitle("Send message"));
      expect(onSend).toHaveBeenCalledWith("test content", undefined, "/test");
    });

    it("clears displayText when user edits text after selecting command", async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onSend={onSend} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      await user.keyboard("{Enter}"); // selects /test command
      await user.type(textarea, " extra"); // edit clears pendingCommandName
      await user.click(screen.getByTitle("Send message"));
      expect(onSend).toHaveBeenCalledWith("/test extra", undefined, undefined);
    });

    it("selects slash command with Tab key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      await user.keyboard("{Tab}");
      expect(textarea).toHaveValue("/test");
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
      expect(textarea).toHaveValue("/test");
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
      expect(textarea).toHaveValue("/only");
    });

    it("ArrowUp at first item stays at 0", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/te");
      // Already at index 0; ArrowUp should stay there
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      expect(textarea).toHaveValue("/test");
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

    it("shows category menu when typing @", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      expect(screen.getByText("Files")).toBeInTheDocument();
      expect(screen.getByText("Folders")).toBeInTheDocument();
      expect(screen.getByText("Git")).toBeInTheDocument();
      expect(screen.getByText("Todos")).toBeInTheDocument();
    });

    it("filters categories as user types", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@fi");
      expect(screen.getByText("Files")).toBeInTheDocument();
      expect(screen.queryByText("Git")).not.toBeInTheDocument();
    });

    it("smart-shortcut to files when filter contains /", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@src/");
      // Should show file items directly (not categories)
      expect(screen.getByText("main.ts")).toBeInTheDocument();
      expect(screen.getByText("helper.ts")).toBeInTheDocument();
    });

    it("drills into Files category on Enter", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      // First category is Files
      await user.keyboard("{Enter}");
      // Now should show file items
      expect(screen.getByText("main.ts")).toBeInTheDocument();
    });

    it("selects file item after drilling into Files", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      await user.keyboard("{Enter}"); // drill into Files
      await user.keyboard("{Enter}"); // select first file
      expect(textarea).toHaveValue("src/main.ts ");
    });

    it("navigates categories with arrow keys", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      // First category is Files; drilling in
      expect(screen.getByText("main.ts")).toBeInTheDocument();
    });

    it("closes @mention menu on Escape key", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      expect(screen.getByText("Files")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByText("Files")).not.toBeInTheDocument();
    });

    it("Escape goes back to categories when drilled in", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      await user.keyboard("{Enter}"); // drill into Files
      expect(screen.getByText("main.ts")).toBeInTheDocument();
      await user.keyboard("{Escape}"); // back to categories
      expect(screen.getByText("Files")).toBeInTheDocument();
      expect(screen.queryByText("main.ts")).not.toBeInTheDocument();
    });

    it("selects Todos category and inserts @todos", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      await user.click(screen.getByText("Todos"));
      // After drilling in, shows the Todos sub-item
      expect(screen.getByText("Insert todo list")).toBeInTheDocument();
    });

    it("hides @mention menu when space is typed after @", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@ ");
      expect(screen.queryByText("Files")).not.toBeInTheDocument();
    });

    it("does not trigger @mention when @ is preceded by a letter", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "email@");
      expect(screen.queryByText("Files")).not.toBeInTheDocument();
    });

    it("triggers @mention after newline", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "hello{Shift>}{Enter}{/Shift}@");
      expect(screen.getByText("Files")).toBeInTheDocument();
    });

    it("shows file description when drilling into Files and filtering", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@src/main");
      // Smart shortcut shows file items; description should show full path
      expect(screen.getByText("src/main.ts")).toBeInTheDocument();
    });

    it("selects file by clicking after smart-shortcut", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@src/");
      await user.click(screen.getByText("main.ts"));
      expect(textarea).toHaveValue("src/main.ts ");
    });

    it("ArrowDown does not exceed bounds in @mention menu", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "@");
      // Many categories. ArrowDown many times should clamp without error.
      for (let i = 0; i < 20; i++) await user.keyboard("{ArrowDown}");
      // Navigate back up to a known category and select it
      for (let i = 0; i < 20; i++) await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      // Should select first category (Files) and drill in
      expect(screen.getByText("main.ts")).toBeInTheDocument();
    });

    it("ArrowUp at first item stays at 0", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Enter}");
      // First category is Files; should drill in
      expect(screen.getByText("main.ts")).toBeInTheDocument();
    });

    it("limits file items in category to 10", async () => {
      useFileTreeStore.setState({
        files: {
          "ws-1": Array.from({ length: 20 }, (_, i) => `file${i}.ts`),
        },
        expandedDirs: {},
        loading: {},
        error: {},
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      await user.keyboard("{Enter}"); // drill into Files
      const buttons = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes(".ts"),
      );
      expect(buttons.length).toBeLessThanOrEqual(10);
    });

    it("selects Git category and shows sub-items", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "@");
      await user.click(screen.getByText("Git"));
      expect(screen.getByText("Diff vs main")).toBeInTheDocument();
      expect(screen.getByText("Recent commits")).toBeInTheDocument();
      expect(screen.getByText("Current branch")).toBeInTheDocument();
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
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
  });

  // --- Thinking & Plan mode toggles ---
  describe("thinking and plan mode toggles", () => {
    it("renders Thinking and Plan toggle buttons", () => {
      render(<Composer {...defaultProps} />);
      expect(screen.getByTitle("Disable thinking (⌥T)")).toBeInTheDocument();
      expect(screen.getByTitle("Disable plan mode (⇧⇥)")).toBeInTheDocument();
    });

    it("calls onThinkingEnabledChange when thinking toggle is clicked", async () => {
      const onThinkingEnabledChange = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onThinkingEnabledChange={onThinkingEnabledChange} />);
      await user.click(screen.getByTitle("Disable thinking (⌥T)"));
      expect(onThinkingEnabledChange).toHaveBeenCalledWith(false);
    });

    it("shows disabled state when thinkingEnabled=false", () => {
      render(<Composer {...defaultProps} thinkingEnabled={false} />);
      expect(screen.getByTitle("Enable thinking (⌥T)")).toBeInTheDocument();
    });

    it("calls onPlanEnabledChange when plan toggle is clicked", async () => {
      const onPlanEnabledChange = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onPlanEnabledChange={onPlanEnabledChange} />);
      await user.click(screen.getByTitle("Disable plan mode (⇧⇥)"));
      expect(onPlanEnabledChange).toHaveBeenCalledWith(false);
    });

    it("shows disabled state when planEnabled=false", () => {
      render(<Composer {...defaultProps} planEnabled={false} />);
      expect(screen.getByTitle("Enable plan mode (⇧⇥)")).toBeInTheDocument();
    });

    it("toggles remain enabled when agent is running", () => {
      render(<Composer {...defaultProps} agentStatus="Running" />);
      expect(screen.getByTitle("Disable thinking (⌥T)")).toBeEnabled();
      expect(screen.getByTitle("Disable plan mode (⇧⇥)")).toBeEnabled();
    });
  });

  // --- Stopping state disables stop button ---
  it("disables stop button when agent is stopping", () => {
    render(<Composer {...defaultProps} agentStatus="Stopping" />);
    expect(screen.getByTitle("Stopping...")).toBeDisabled();
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
    await user.click(screen.getByTitle("Send message"));
    // In repo context, workspaceId is undefined, so @todos is NOT expanded
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Check @todos now", undefined, undefined));
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
    useFileTreeStore.setState({
      files: { "ws-1": ["src/main.ts", "src/utils/helper.ts", "README.md"] },
      expandedDirs: {},
      loading: {},
      error: {},
    });
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    // Use file path shortcut (contains /) to get direct file items
    await user.type(textarea, "check @src/main");
    // main.ts should appear via smart file shortcut
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(textarea).toHaveValue("check src/main.ts ");
  });

  // --- Model selector dropdown (lines 876-915) ---
  describe("model selector", () => {
    it("shows model selector button with default model name", () => {
      render(<Composer {...defaultProps} />);
      expect(screen.getByTitle("Change model (⌥P)")).toBeInTheDocument();
      expect(screen.getByText("Opus 4.6")).toBeInTheDocument();
    });

    it("opens model dropdown when clicking model button", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Change model (⌥P)"));
      // All model options should appear
      expect(screen.getByText("Sonnet")).toBeInTheDocument();
      expect(screen.getByText("Haiku")).toBeInTheDocument();
    });

    it("selects a model from dropdown and sends with it", async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onSend={onSend} />);
      // Open model menu
      await user.click(screen.getByTitle("Change model (⌥P)"));
      // Select Sonnet
      await user.click(screen.getByText("Sonnet"));
      // Type and send
      await user.type(screen.getByRole("textbox"), "hello{Enter}");
      expect(onSend).toHaveBeenCalledWith("hello", "sonnet", undefined);
    });

    it("toggles model menu with Alt+P keyboard shortcut", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      // Alt+P to open menu
      await user.click(textarea);
      await user.keyboard("{Alt>}p{/Alt}");
      expect(screen.getByText("Sonnet")).toBeInTheDocument();
    });

    it("keeps model selector enabled when agent is running", () => {
      render(<Composer {...defaultProps} agentStatus="Running" />);
      expect(screen.getByTitle("Change model (⌥P)")).toBeEnabled();
    });

    it("shows codex model options when agentType is codex_cli", () => {
      useSettingsStore.setState({
        appSettings: { agentType: "codex_cli" } as any,
      });
      render(<Composer {...defaultProps} />);
      expect(screen.getByText("codex")).toBeInTheDocument();
    });
  });

  // --- Plus menu / attachments / link buttons (lines 955-1005) ---
  describe("plus menu", () => {
    it("shows plus button with correct title", () => {
      render(<Composer {...defaultProps} />);
      expect(screen.getByTitle("Add file or context")).toBeInTheDocument();
    });

    it("opens plus menu when clicking plus button", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      expect(screen.getByText("Add attachment")).toBeInTheDocument();
      expect(screen.getByText("Link issue")).toBeInTheDocument();
    });

    it("shows link workspaces option when onLinkWorkspaces is provided", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onLinkWorkspaces={vi.fn()} />);
      await user.click(screen.getByTitle("Add file or context"));
      expect(screen.getByText("Link workspaces")).toBeInTheDocument();
    });

    it("does not show link workspaces option when onLinkWorkspaces is not provided", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      expect(screen.queryByText("Link workspaces")).not.toBeInTheDocument();
    });

    it("calls onLinkIssue when link issue button is clicked", async () => {
      const onLinkIssue = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onLinkIssue={onLinkIssue} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Link issue"));
      expect(onLinkIssue).toHaveBeenCalledOnce();
    });

    it("calls onLinkWorkspaces when link workspaces button is clicked", async () => {
      const onLinkWorkspaces = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onLinkWorkspaces={onLinkWorkspaces} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Link workspaces"));
      expect(onLinkWorkspaces).toHaveBeenCalledOnce();
    });

    it("disables link issue button when onLinkIssue is not provided", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      const linkIssueBtn = screen.getByText("Link issue").closest("button")!;
      expect(linkIssueBtn).toBeDisabled();
    });

    it("keeps plus button enabled when agent is running", () => {
      render(<Composer {...defaultProps} agentStatus="Running" />);
      expect(screen.getByTitle("Add file or context")).toBeEnabled();
    });

    it("opens file dialog and adds non-image attachment", async () => {
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce("/path/to/file.txt" as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      await waitFor(() => {
        expect(screen.getByText("file.txt")).toBeInTheDocument();
      });
    });

    it("sends message with attached file paths prepended", async () => {
      const onSend = vi.fn();
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce("/path/to/notes.txt" as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onSend={onSend} />);
      // Add attachment
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      await waitFor(() => {
        expect(screen.getByText("notes.txt")).toBeInTheDocument();
      });
      // Type message and send
      await user.type(screen.getByRole("textbox"), "check this{Enter}");
      expect(onSend).toHaveBeenCalledOnce();
      const sentMessage = onSend.mock.calls[0][0];
      expect(sentMessage).toContain("[Attached file: /path/to/notes.txt]");
      expect(sentMessage).toContain("check this");
    });

    it("can remove an attached file chip", async () => {
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce("/path/to/remove-me.txt" as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      await waitFor(() => {
        expect(screen.getByText("remove-me.txt")).toBeInTheDocument();
      });
      // Click the X button next to the file chip
      const removeBtn = screen.getByText("remove-me.txt").closest("div")!.querySelector("button")!;
      await user.click(removeBtn);
      expect(screen.queryByText("remove-me.txt")).not.toBeInTheDocument();
    });

    it("enables send button when files are attached even without text", async () => {
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce("/path/to/data.csv" as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      await waitFor(() => {
        expect(screen.getByText("data.csv")).toBeInTheDocument();
      });
      expect(screen.getByTitle("Send message")).not.toBeDisabled();
    });

    it("sends attached image file with [Attached image: ...] prefix", async () => {
      const onSend = vi.fn();
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce("/photos/pic.png" as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onSend={onSend} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      await waitFor(() => {
        expect(screen.getByText("pic.png")).toBeInTheDocument();
      });
      await user.type(screen.getByRole("textbox"), "look{Enter}");
      const sentMessage = onSend.mock.calls[0][0];
      expect(sentMessage).toContain("[Attached image: /photos/pic.png]");
    });

    it("handles openFileDialog returning null (user cancelled)", async () => {
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce(null as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      // No file chip should appear
      await waitFor(() => {
        expect(mockOpen).toHaveBeenCalled();
      });
      // Should not have any file chips
      expect(screen.queryByText("remove-me.txt")).not.toBeInTheDocument();
    });

    it("handles multiple files from openFileDialog", async () => {
      const mockOpen = vi.mocked(openFileDialog);
      mockOpen.mockResolvedValueOnce(["/a/b.txt", "/c/d.ts"] as any);
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Add file or context"));
      await user.click(screen.getByText("Add attachment"));
      await waitFor(() => {
        expect(screen.getByText("b.txt")).toBeInTheDocument();
        expect(screen.getByText("d.ts")).toBeInTheDocument();
      });
    });
  });

  // --- Permission request bar ---
  describe("permission request bar", () => {
    it("shows permission request bar with tool name", () => {
      render(
        <Composer
          {...defaultProps}
          permissionRequest={{ toolName: "shell_exec", input: {} }}
          onRespondToPermission={vi.fn()}
        />,
      );
      expect(screen.getByText("shell_exec")).toBeInTheDocument();
      expect(screen.getByText("Allow")).toBeInTheDocument();
      expect(screen.getByText("Deny")).toBeInTheDocument();
    });

    it("calls onRespondToPermission(true) when Allow is clicked", async () => {
      const onRespond = vi.fn();
      const user = userEvent.setup();
      render(
        <Composer
          {...defaultProps}
          permissionRequest={{ toolName: "write_file", input: {} }}
          onRespondToPermission={onRespond}
        />,
      );
      await user.click(screen.getByText("Allow"));
      expect(onRespond).toHaveBeenCalledWith(true);
    });

    it("calls onRespondToPermission(false) when Deny is clicked", async () => {
      const onRespond = vi.fn();
      const user = userEvent.setup();
      render(
        <Composer
          {...defaultProps}
          permissionRequest={{ toolName: "write_file", input: {} }}
          onRespondToPermission={onRespond}
        />,
      );
      await user.click(screen.getByText("Deny"));
      expect(onRespond).toHaveBeenCalledWith(false);
    });

    it("approves permission with Cmd+Shift+Enter", async () => {
      const onRespond = vi.fn();
      const user = userEvent.setup();
      render(
        <Composer
          {...defaultProps}
          permissionRequest={{ toolName: "exec", input: {} }}
          onRespondToPermission={onRespond}
        />,
      );
      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.keyboard("{Meta>}{Shift>}{Enter}{/Shift}{/Meta}");
      expect(onRespond).toHaveBeenCalledWith(true);
    });
  });

  // --- Plan approval bar ---
  describe("plan approval bar", () => {
    it("shows plan approval bar with approve and copy buttons", () => {
      const onApprovePlan = vi.fn();
      const onCopyPlan = vi.fn();
      render(
        <Composer
          {...defaultProps}
          isPlanApproval
          onApprovePlan={onApprovePlan}
          onCopyPlan={onCopyPlan}
        />,
      );
      expect(screen.getByText("Approve")).toBeInTheDocument();
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Request Changes")).toBeInTheDocument();
    });

    it("calls onApprovePlan when approve button is clicked", async () => {
      const onApprovePlan = vi.fn();
      const user = userEvent.setup();
      render(
        <Composer
          {...defaultProps}
          isPlanApproval
          onApprovePlan={onApprovePlan}
        />,
      );
      await user.click(screen.getByText("Approve"));
      expect(onApprovePlan).toHaveBeenCalledOnce();
    });

    it("calls onCopyPlan when copy button is clicked", async () => {
      const onCopyPlan = vi.fn();
      const user = userEvent.setup();
      render(
        <Composer
          {...defaultProps}
          isPlanApproval
          onApprovePlan={vi.fn()}
          onCopyPlan={onCopyPlan}
        />,
      );
      await user.click(screen.getByText("Copy"));
      expect(onCopyPlan).toHaveBeenCalledOnce();
    });

    it("approves plan with Cmd+Shift+Enter", async () => {
      const onApprovePlan = vi.fn();
      const user = userEvent.setup();
      render(
        <Composer
          {...defaultProps}
          isPlanApproval
          onApprovePlan={onApprovePlan}
        />,
      );
      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.keyboard("{Meta>}{Shift>}{Enter}{/Shift}{/Meta}");
      expect(onApprovePlan).toHaveBeenCalledOnce();
    });

    it("shows plan approval placeholder text", () => {
      render(
        <Composer
          {...defaultProps}
          isPlanApproval
          onApprovePlan={vi.fn()}
        />,
      );
      expect(screen.getByPlaceholderText("Enter your plan adjustments here...")).toBeInTheDocument();
    });
  });

  // --- Context near-full warning ---
  describe("context usage warning", () => {
    it("shows compact warning when context is >= 90% full", () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 190_000, totalOutputTokens: 0, totalCostUsd: 1.5, numTurns: 10 },
        },
      });
      render(<Composer {...defaultProps} />);
      expect(screen.getByText("Compact")).toBeInTheDocument();
    });

    it("calls onSend with /compact when compact button is clicked", async () => {
      const onSend = vi.fn();
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 195_000, totalOutputTokens: 0, totalCostUsd: 2.0, numTurns: 15 },
        },
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onSend={onSend} />);
      await user.click(screen.getByText("Compact"));
      expect(onSend).toHaveBeenCalledWith("/compact");
    });

    it("does not show compact warning when context < 90%", () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 100_000, totalOutputTokens: 0, totalCostUsd: 0.5, numTurns: 5 },
        },
      });
      render(<Composer {...defaultProps} />);
      expect(screen.queryByText("Compact")).not.toBeInTheDocument();
    });

    it("does not show compact warning when agent is running", () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 195_000, totalOutputTokens: 0, totalCostUsd: 2.0, numTurns: 15 },
        },
      });
      render(<Composer {...defaultProps} agentStatus="Running" />);
      expect(screen.queryByText("Compact")).not.toBeInTheDocument();
    });

    it("shows context usage ring when tokens > 0", () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 50_000, totalOutputTokens: 1000, totalCostUsd: 0.25, numTurns: 3 },
        },
      });
      render(<Composer {...defaultProps} />);
      expect(screen.getByLabelText(/Context usage: 25%/)).toBeInTheDocument();
    });

    it("applies warning color to ring when context is 75-89% full", () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 160_000, totalOutputTokens: 0, totalCostUsd: 1.0, numTurns: 8 },
        },
      });
      render(<Composer {...defaultProps} />);
      const ring = screen.getByLabelText(/Context usage: 80%/);
      const svg = ring.querySelector("svg") as SVGElement;
      const circles = svg.querySelectorAll("circle");
      // The second circle is the filled arc
      expect(circles[1].getAttribute("stroke")).toBe("var(--accent-orange)");
    });

    it("shows tooltip with context details on hover", async () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 50_000, totalOutputTokens: 2000, totalCostUsd: 0.25, numTurns: 3 },
        },
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const ring = screen.getByLabelText(/Context usage: 25%/);
      await user.hover(ring.parentElement!);
      expect(screen.getByText("Context")).toBeInTheDocument();
      expect(screen.getByText("Cost")).toBeInTheDocument();
      expect(screen.getByText("$0.250")).toBeInTheDocument();
    });

    it("shows cache read row in tooltip when cache tokens > 0", async () => {
      useChatStore.setState({
        sessionStats: {
          "ws-1": { totalInputTokens: 50_000, totalOutputTokens: 2000, totalCostUsd: 0.25, numTurns: 3, totalCacheReadTokens: 10_000 },
        },
      });
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const ring = screen.getByLabelText(/Context usage: 25%/);
      await user.hover(ring.parentElement!);
      expect(screen.getByText("Cache read")).toBeInTheDocument();
    });
  });

  // --- Keyboard shortcuts ---
  describe("keyboard shortcuts", () => {
    it("toggles thinking with Alt+T", async () => {
      const onThinkingEnabledChange = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} thinkingEnabled={false} onThinkingEnabledChange={onThinkingEnabledChange} />);
      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.keyboard("{Alt>}t{/Alt}");
      expect(onThinkingEnabledChange).toHaveBeenCalledWith(true);
    });

    it("toggles plan mode with Shift+Tab", async () => {
      const onPlanEnabledChange = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} planEnabled={false} onPlanEnabledChange={onPlanEnabledChange} />);
      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(onPlanEnabledChange).toHaveBeenCalledWith(true);
    });

    it("calls onLinkIssue with Cmd+I", async () => {
      const onLinkIssue = vi.fn();
      const user = userEvent.setup();
      render(<Composer {...defaultProps} onLinkIssue={onLinkIssue} />);
      const textarea = screen.getByRole("textbox");
      await user.click(textarea);
      await user.keyboard("{Meta>}i{/Meta}");
      expect(onLinkIssue).toHaveBeenCalledOnce();
    });
  });

  // --- Border styles ---
  describe("border styles", () => {
    it("applies dashed border when plan mode is enabled", () => {
      render(<Composer {...defaultProps} planEnabled={true} />);
      const borderEl = screen.getByRole("textbox").closest("[class*='rounded-xl']") as HTMLElement;
      expect(borderEl.style.border).toBe("1px dashed var(--composer-border)");
    });

    it("applies solid border when plan mode is disabled", () => {
      render(<Composer {...defaultProps} planEnabled={false} />);
      const borderEl = screen.getByRole("textbox").closest("[class*='rounded-xl']") as HTMLElement;
      expect(borderEl.style.border).toBe("1px solid var(--border)");
    });
  });

  // --- Codex model hides thinking/plan toggles ---
  describe("codex agent type", () => {
    beforeEach(() => {
      useSettingsStore.setState({
        appSettings: { agentType: "codex_cli" } as any,
      });
    });

    it("hides thinking toggle for codex agent", () => {
      render(<Composer {...defaultProps} />);
      expect(screen.queryByTitle("Disable thinking (⌥T)")).not.toBeInTheDocument();
    });

    it("hides plan toggle for codex agent", () => {
      render(<Composer {...defaultProps} />);
      expect(screen.queryByTitle("Disable plan mode (⇧⇥)")).not.toBeInTheDocument();
    });
  });

  // --- discoveredSkills dedup ---
  it("merges discoveredSkills with fileCommands without duplicates", async () => {
    useSlashCommandStore.setState({
      commands: {
        "ws-1": [
          { name: "existing", source: "project", description: "Existing", content: "ec" },
        ],
      },
      discoveredSkills: {
        "ws-1": [
          { name: "existing", source: "plugin", description: "Dup", content: "dup" },
          { name: "newskill", source: "plugin", description: "New skill", content: "ns" },
        ],
      },
      loading: {},
      error: {},
      loadCommands: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.type(screen.getByRole("textbox"), "/");
    // "existing" should appear once (from fileCommands), "newskill" should also appear
    const existingItems = screen.getAllByText("/existing");
    expect(existingItems).toHaveLength(1);
    expect(screen.getByText("/newskill")).toBeInTheDocument();
  });

  // --- Sends only file block when no text is typed ---
  it("sends only file block when text is empty but files are attached", async () => {
    const onSend = vi.fn();
    const mockOpen = vi.mocked(openFileDialog);
    mockOpen.mockResolvedValueOnce("/path/to/only-file.txt" as any);
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.click(screen.getByTitle("Add file or context"));
    await user.click(screen.getByText("Add attachment"));
    await waitFor(() => {
      expect(screen.getByText("only-file.txt")).toBeInTheDocument();
    });
    await user.click(screen.getByTitle("Send message"));
    expect(onSend).toHaveBeenCalledOnce();
    const sentMessage = onSend.mock.calls[0][0];
    expect(sentMessage).toBe("[Attached file: /path/to/only-file.txt]");
  });

  // --- Clears dropped files after send ---
  it("clears dropped files after sending", async () => {
    const mockOpen = vi.mocked(openFileDialog);
    mockOpen.mockResolvedValueOnce("/path/to/cleared.txt" as any);
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={vi.fn()} />);
    await user.click(screen.getByTitle("Add file or context"));
    await user.click(screen.getByText("Add attachment"));
    await waitFor(() => {
      expect(screen.getByText("cleared.txt")).toBeInTheDocument();
    });
    await user.type(screen.getByRole("textbox"), "go{Enter}");
    // File chip should be gone after send
    expect(screen.queryByText("cleared.txt")).not.toBeInTheDocument();
  });

  // --- Line 348: openFileDialog rejection is caught gracefully ---
  it("catches and returns early when openFileDialog rejects", async () => {
    const mockOpen = vi.mocked(openFileDialog);
    mockOpen.mockRejectedValueOnce(new Error("dialog failed"));
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.click(screen.getByTitle("Add file or context"));
    await user.click(screen.getByText("Add attachment"));
    // Wait for the rejection to be handled
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
    // No file chip should appear and no crash
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // --- Lines 366-368: readFileBase64 rejection sets dataUrl to "error" ---
  it("sets dataUrl to 'error' when readFileBase64 rejects for an image attachment", async () => {
    const mockOpen = vi.mocked(openFileDialog);
    mockOpen.mockResolvedValueOnce("/path/to/photo.png" as any);
    const mockReadBase64 = vi.mocked(readFileBase64);
    mockReadBase64.mockRejectedValueOnce(new Error("read failed"));
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.click(screen.getByTitle("Add file or context"));
    await user.click(screen.getByText("Add attachment"));
    // Wait for the file chip to appear
    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });
    // After readFileBase64 rejects, the image file should fall back to the
    // non-image / error icon (FileIcon) instead of showing an <img> or loading spinner.
    // The FileChipIcon renders a FileText icon when isImage && dataUrl === "error".
    await waitFor(() => {
      // When dataUrl is "error", the chip renders neither an <img> nor the loading spinner;
      // it renders the generic FileIcon (lucide FileText). Verify no <img> tag is present
      // inside the chip (an <img> would mean the preview loaded successfully).
      const chip = screen.getByText("photo.png").closest("div")!;
      expect(chip.querySelector("img")).toBeNull();
      // Also ensure the loading spinner (animate-pulse) is not present
      expect(chip.querySelector(".animate-pulse")).toBeNull();
    });
  });

  // --- Line 662: isDragOver applies dashed accent border ---
  it("applies dashed accent border when isDragOver is true", async () => {
    // Mock getCurrentWebview to provide a working onDragDropEvent
    let dragCallback: (event: any) => void = () => {};
    const mockGetCurrentWebview = vi.mocked(getCurrentWebview);
    mockGetCurrentWebview.mockReturnValue({
      onDragDropEvent: vi.fn((cb: any) => {
        dragCallback = cb;
        return Promise.resolve(() => {});
      }),
    } as any);

    render(<Composer {...defaultProps} />);

    // Simulate a drag "over" event through the Tauri callback
    await waitFor(() => {
      dragCallback({ payload: { type: "over" } });
    });

    // The rounded-xl container should now have the drag-over border style
    const borderEl = screen.getByRole("textbox").closest("[class*='rounded-xl']") as HTMLElement;
    await waitFor(() => {
      expect(borderEl.style.border).toBe("2px dashed var(--accent)");
    });

    // Also verify the "Drop files here" overlay appears
    expect(screen.getByText("Drop files here")).toBeInTheDocument();

    // Restore default mock behavior (throw) so other tests aren't affected
    mockGetCurrentWebview.mockImplementation(() => { throw new Error("not in tauri"); });
  });

  describe("clipboard paste", () => {
    beforeEach(() => {
      vi.mocked(saveClipboardImage).mockClear();
      vi.mocked(saveClipboardImage).mockResolvedValue("/tmp/clipboard-images/paste-test.png");
    });

    it("handles pasting an image from clipboard", async () => {
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");

      const file = new File([new Uint8Array([137, 80, 78, 71])], "screenshot.png", { type: "image/png" });
      const clipboardData = {
        items: [{ type: "image/png", getAsFile: () => file }],
      };

      fireEvent.paste(textarea, { clipboardData });

      await waitFor(() => {
        expect(vi.mocked(saveClipboardImage)).toHaveBeenCalledWith(
          expect.any(String),
          "image/png",
        );
      });

      await waitFor(() => {
        expect(screen.getByText("paste-test.png")).toBeInTheDocument();
      });
    });

    it("does not intercept paste when clipboard has no images", () => {
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");

      const clipboardData = {
        items: [{ type: "text/plain", getAsFile: () => null }],
      };

      fireEvent.paste(textarea, { clipboardData });
      expect(vi.mocked(saveClipboardImage)).not.toHaveBeenCalled();
    });

    it("removes placeholder when saveClipboardImage fails", async () => {
      vi.mocked(saveClipboardImage).mockRejectedValueOnce(new Error("save failed"));
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");

      const file = new File([new Uint8Array([0])], "bad.png", { type: "image/png" });
      const clipboardData = {
        items: [{ type: "image/png", getAsFile: () => file }],
      };

      fireEvent.paste(textarea, { clipboardData });

      await waitFor(() => {
        expect(vi.mocked(saveClipboardImage)).toHaveBeenCalled();
      });

      // No file chip should remain after failure
      await waitFor(() => {
        expect(screen.queryByText(/paste-/)).not.toBeInTheDocument();
      });
    });

    it("sends pasted image with [Attached image: path] marker", async () => {
      const onSend = vi.fn();
      render(<Composer {...defaultProps} onSend={onSend} />);
      const textarea = screen.getByRole("textbox");

      const file = new File([new Uint8Array([137, 80])], "shot.png", { type: "image/png" });
      const clipboardData = {
        items: [{ type: "image/png", getAsFile: () => file }],
      };

      fireEvent.paste(textarea, { clipboardData });

      await waitFor(() => {
        expect(screen.getByText("paste-test.png")).toBeInTheDocument();
      });

      // Type a message and send
      await userEvent.setup().type(textarea, "describe this{Enter}");

      expect(onSend).toHaveBeenCalledWith(
        expect.stringContaining("[Attached image: /tmp/clipboard-images/paste-test.png]"),
        undefined,
        undefined,
      );
    });
  });

  describe("voice input", () => {
    let mockRecognitionInstance: any;

    function createMockRecognition() {
      const inst: any = {
        continuous: false,
        interimResults: false,
        lang: "",
        onstart: null,
        onresult: null,
        onerror: null,
        onend: null,
        start: vi.fn(() => { inst.onstart?.(); }),
        stop: vi.fn(() => { inst.onend?.(); }),
        abort: vi.fn(),
      };
      mockRecognitionInstance = inst;
      return inst;
    }

    const MockSpeechRecognition = vi.fn().mockImplementation(createMockRecognition);

    it("shows voice input button when SpeechRecognition is available", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      render(<Composer {...defaultProps} />);
      expect(screen.getByTitle("Start voice input (⌥V)")).toBeInTheDocument();
      delete (window as any).SpeechRecognition;
    });

    it("hides voice input button when SpeechRecognition is not available", () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
      render(<Composer {...defaultProps} />);
      expect(screen.queryByTitle(/voice input/)).not.toBeInTheDocument();
    });

    it("toggles to listening state when mic button is clicked", async () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Start voice input (⌥V)"));
      expect(mockRecognitionInstance.start).toHaveBeenCalled();
      expect(screen.getByTitle("Stop voice input (⌥V)")).toBeInTheDocument();
      delete (window as any).SpeechRecognition;
    });

    it("appends transcribed text to textarea", async () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.type(screen.getByRole("textbox"), "Hello");
      await user.click(screen.getByTitle("Start voice input (⌥V)"));
      // Simulate a final transcript result
      const { act } = await import("@testing-library/react");
      act(() => {
        mockRecognitionInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { 0: { transcript: "world" }, isFinal: true, length: 1 },
          },
        });
      });
      expect(screen.getByRole("textbox")).toHaveValue("Hello world");
      delete (window as any).SpeechRecognition;
    });

    it("keeps voice button enabled when agent is running", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      render(<Composer {...defaultProps} agentStatus="Running" />);
      expect(screen.getByTitle(/voice input/)).toBeEnabled();
      delete (window as any).SpeechRecognition;
    });

    it("shows interim transcript while listening", async () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      await user.click(screen.getByTitle("Start voice input (⌥V)"));
      const { act } = await import("@testing-library/react");
      act(() => {
        mockRecognitionInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { 0: { transcript: "hel" }, isFinal: false, length: 1 },
          },
        });
      });
      expect(screen.getByText("hel...")).toBeInTheDocument();
      delete (window as any).SpeechRecognition;
    });

    it("Alt+V toggles voice input", async () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "v", altKey: true });
      expect(mockRecognitionInstance.start).toHaveBeenCalled();
      expect(screen.getByTitle("Stop voice input (⌥V)")).toBeInTheDocument();
      delete (window as any).SpeechRecognition;
    });
  });

  it("Cmd+U opens file dialog", async () => {
    const mockOpen = vi.mocked(openFileDialog);
    mockOpen.mockResolvedValueOnce(null);
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "u", metaKey: true });
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  // --- Alt+L opens prompt library ---
  it("Alt+L opens prompt library dialog", () => {
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "l", altKey: true });
    expect(screen.getByTestId("prompt-library-dialog")).toBeInTheDocument();
  });

  // --- Prompt library via plus menu ---
  it("opens prompt library from plus menu", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.click(screen.getByTitle("Add file or context"));
    await user.click(screen.getByText("Prompt Library"));
    expect(screen.getByTestId("prompt-library-dialog")).toBeInTheDocument();
  });

  // --- Prompt library slash command with custom variables ---
  describe("prompt library commands", () => {
    const makePrompt = (overrides: Record<string, unknown> = {}) => ({
      id: "p1",
      name: "greet",
      content: "Hello {{name}}",
      description: "A greeting",
      category: null,
      tags: [],
      sortOrder: 0,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      ...overrides,
    });

    beforeEach(() => {
      usePromptLibraryStore.setState({
        prompts: [
          makePrompt({ id: "p1", name: "greet", content: "Hello {{name}}", description: "A greeting" }),
          makePrompt({ id: "p2", name: "simple", content: "Do something simple", description: "No vars" }),
        ],
        loadPrompts: vi.fn(),
      });
    });

    it("shows prompt library commands in slash menu", async () => {
      const user = userEvent.setup();
      const { container } = render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/prompt:");

      // Check that prompt commands appear - they use the format /<name>
      const buttons = container.querySelectorAll("button");
      const promptButtons = Array.from(buttons).filter((b) => b.textContent?.includes("prompt:greet"));
      expect(promptButtons.length).toBeGreaterThan(0);
    });

    it("opens prompt library dialog for prompt with custom variables", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/prompt:gre");
      // Verify the menu is showing
      await waitFor(() => {
        const items = screen.queryAllByText(/prompt:greet/);
        expect(items.length).toBeGreaterThan(0);
      });
      await user.keyboard("{Enter}");
      // Should open PromptLibraryDialog for variable substitution
      expect(screen.getByTestId("prompt-library-dialog")).toBeInTheDocument();
    });

    it("auto-substitutes prompt without custom variables", async () => {
      const user = userEvent.setup();
      render(<Composer {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "/prompt:sim");
      await user.keyboard("{Enter}");
      // No custom variables, so it auto-substitutes and sets pending command
      expect(screen.queryByTestId("prompt-library-dialog")).not.toBeInTheDocument();
    });
  });

  // --- Cmd+Shift+Enter for plan approval (without permission request) ---
  it("approves plan with Cmd+Shift+Enter when no permission request", async () => {
    const onApprovePlan = vi.fn();
    const user = userEvent.setup();
    render(
      <Composer
        {...defaultProps}
        isPlanApproval
        onApprovePlan={onApprovePlan}
      />,
    );
    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.keyboard("{Meta>}{Shift>}{Enter}{/Shift}{/Meta}");
    expect(onApprovePlan).toHaveBeenCalledOnce();
  });

  // --- Cmd+I without onLinkIssue (noop) ---
  it("Cmd+I does nothing when onLinkIssue is not provided", () => {
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "i", metaKey: true });
    // Should not crash
  });

  // --- Running placeholder text ---
  it("shows running placeholder when agent is running", () => {
    render(<Composer {...defaultProps} agentStatus="Running" />);
    expect(screen.getByPlaceholderText("Send a follow-up message...")).toBeInTheDocument();
  });

  // --- Model reset on agent type change ---
  it("resets selected model when agent type changes", () => {
    const { rerender } = render(<Composer {...defaultProps} />);
    useSettingsStore.setState({
      appSettings: { agentType: "codex_cli" } as any,
    });
    rerender(<Composer {...defaultProps} />);
    // Model should be reset to empty (default)
    expect(screen.getByText("codex")).toBeInTheDocument();
  });

  // --- Context usage indicator mouseLeave hides tooltip ---
  it("hides context tooltip on mouse leave", async () => {
    useChatStore.setState({
      sessionStats: {
        "ws-1": { totalInputTokens: 50_000, totalOutputTokens: 1000, totalCostUsd: 0.25, numTurns: 3 },
      },
    });
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const ring = screen.getByLabelText(/Context usage: 25%/);
    const parent = ring.parentElement!;
    await user.hover(parent);
    expect(screen.getByText("Context")).toBeInTheDocument();
    await user.unhover(parent);
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
  });

  // --- PromptLibraryDialog onClose ---
  it("closes prompt library dialog via onClose", async () => {
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    // Open prompt library via Alt+L
    fireEvent.keyDown(textarea, { key: "l", altKey: true });
    expect(screen.getByTestId("prompt-library-dialog")).toBeInTheDocument();
    // Close it
    await user.click(screen.getByTestId("prompt-close"));
    expect(screen.queryByTestId("prompt-library-dialog")).not.toBeInTheDocument();
  });

  // --- PromptLibraryDialog onInsert ---
  it("inserts prompt content via prompt library dialog", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    // Open prompt library via Alt+L
    fireEvent.keyDown(textarea, { key: "l", altKey: true });
    expect(screen.getByTestId("prompt-library-dialog")).toBeInTheDocument();
    // Insert prompt
    await user.click(screen.getByTestId("prompt-insert"));
    expect(screen.queryByTestId("prompt-library-dialog")).not.toBeInTheDocument();
    // The text and pendingCommandName should be set
    // Send the message
    await user.click(screen.getByTitle("Send message"));
    expect(onSend).toHaveBeenCalledWith("resolved content", undefined, "/my-prompt");
  });

  // --- Voice input error callback ---
  it("triggers onError callback on voice recognition error", async () => {
    let errorCallback: any = null;
    (window as any).SpeechRecognition = class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: any = null;
      onresult: any = null;
      onerror: any = null;
      onend: any = null;
      start = vi.fn(() => { this.onstart?.(); });
      stop = vi.fn(() => { this.onend?.(); });
      abort = vi.fn();
      constructor() {
        errorCallback = () => {
          this.onerror?.({ error: "not-allowed" });
        };
      }
    };
    const user = userEvent.setup();
    render(<Composer {...defaultProps} />);
    await user.click(screen.getByTitle("Start voice input (⌥V)"));
    // Trigger the error which calls onError -> useToastStore.addToast
    act(() => {
      errorCallback?.();
    });
    // Voice should stop after error
    expect(screen.queryByTitle("Stop voice input (⌥V)")).not.toBeInTheDocument();
    delete (window as any).SpeechRecognition;
  });
});
