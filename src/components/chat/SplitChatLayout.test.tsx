import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel">{children}</div>
  ),
  PanelResizeHandle: ({ className }: { className?: string }) => (
    <div data-testid="resize-handle" className={className} />
  ),
}));

vi.mock("./ChatPanel", () => ({
  ChatPanel: ({ contextId }: { contextId: string }) => (
    <div data-testid="chat-panel">{contextId}</div>
  ),
}));

vi.mock("../../lib/themes", () => ({
  applyTheme: vi.fn(),
}));

import { SplitChatLayout } from "./SplitChatLayout";
import { useUIStore } from "../../stores/uiStore";

const defaultProps = {
  leftContextId: "ws-1",
  leftContextType: "workspace" as const,
  rightContextId: "ws-2",
  rightContextType: "workspace" as const,
};

beforeEach(() => {
  useUIStore.setState({
    splitChatActive: true,
    splitChatContextId: "ws-2",
    splitChatContextType: "workspace",
    splitChatFocusedPane: "left",
  });
  vi.clearAllMocks();
});

describe("SplitChatLayout", () => {
  it("renders two panels with a resize handle", () => {
    render(<SplitChatLayout {...defaultProps} />);
    expect(screen.getByTestId("panel-group")).toBeInTheDocument();
    expect(screen.getAllByTestId("panel")).toHaveLength(2);
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("renders two ChatPanels with different contextIds", () => {
    render(<SplitChatLayout {...defaultProps} />);
    const panels = screen.getAllByTestId("chat-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0]).toHaveTextContent("ws-1");
    expect(panels[1]).toHaveTextContent("ws-2");
  });

  it("focused pane has accent outline", () => {
    render(<SplitChatLayout {...defaultProps} />);
    const paneWrappers = screen.getByTestId("panel-group").querySelectorAll("[class='h-full']");
    expect(paneWrappers[0]).toHaveStyle({ outline: "1px solid var(--accent)" });
    expect(paneWrappers[1]).toHaveStyle({ outline: "none" });
  });

  it("right pane has accent outline when focused", () => {
    useUIStore.setState({ splitChatFocusedPane: "right" });
    render(<SplitChatLayout {...defaultProps} />);
    const paneWrappers = screen.getByTestId("panel-group").querySelectorAll("[class='h-full']");
    expect(paneWrappers[0]).toHaveStyle({ outline: "none" });
    expect(paneWrappers[1]).toHaveStyle({ outline: "1px solid var(--accent)" });
  });

  it("calls setSplitChatFocusedPane on mouseDown", () => {
    const setSplitChatFocusedPane = vi.fn();
    useUIStore.setState({ setSplitChatFocusedPane });
    render(<SplitChatLayout {...defaultProps} />);
    const paneWrappers = screen.getByTestId("panel-group").querySelectorAll("[class='h-full']");
    fireEvent.mouseDown(paneWrappers[1]);
    expect(setSplitChatFocusedPane).toHaveBeenCalledWith("right");
  });

  it("calls setSplitChatFocusedPane with left on left pane mouseDown", () => {
    const setSplitChatFocusedPane = vi.fn();
    useUIStore.setState({ setSplitChatFocusedPane });
    render(<SplitChatLayout {...defaultProps} />);
    const paneWrappers = screen.getByTestId("panel-group").querySelectorAll("[class='h-full']");
    fireEvent.mouseDown(paneWrappers[0]);
    expect(setSplitChatFocusedPane).toHaveBeenCalledWith("left");
  });
});
