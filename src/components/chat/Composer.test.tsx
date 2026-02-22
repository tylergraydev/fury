import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";
import { useSlashCommandStore } from "../../stores/slashCommandStore";
import { useFileTreeStore } from "../../stores/fileTreeStore";

beforeEach(() => {
  useSlashCommandStore.setState({ commands: {}, loading: {}, error: {} });
  useFileTreeStore.setState({ files: {}, expandedDirs: {}, loading: {}, error: {} });
});

const defaultProps = {
  contextId: "ws-1",
  contextType: "workspace" as const,
  agentStatus: "Idle" as const,
  onSend: vi.fn(),
  onStop: vi.fn(),
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
    expect(onSend).toHaveBeenCalledWith("test message");
  });

  it("calls onSend on Enter key", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...defaultProps} onSend={onSend} />);
    await user.type(screen.getByRole("textbox"), "hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
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
});
