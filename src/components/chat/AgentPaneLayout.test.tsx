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

import { AgentPaneLayout } from "./AgentPaneLayout";
import { useUIStore, type AgentPane } from "../../stores/uiStore";

const twoPanes: AgentPane[] = [
  { id: "p1", contextId: "ws-1", contextType: "workspace", label: "WS 1" },
  { id: "p2", contextId: "ws-2", contextType: "workspace", label: "WS 2" },
];

beforeEach(() => {
  useUIStore.setState({
    agentPanes: twoPanes,
    focusedPaneIndex: 0,
  });
  vi.clearAllMocks();
});

describe("AgentPaneLayout", () => {
  it("renders N panels with N-1 resize handles", () => {
    render(<AgentPaneLayout panes={twoPanes} />);
    expect(screen.getByTestId("panel-group")).toBeInTheDocument();
    expect(screen.getAllByTestId("panel")).toHaveLength(2);
    expect(screen.getAllByTestId("resize-handle")).toHaveLength(1);
  });

  it("renders ChatPanels with correct contextIds", () => {
    render(<AgentPaneLayout panes={twoPanes} />);
    const panels = screen.getAllByTestId("chat-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0]).toHaveTextContent("ws-1");
    expect(panels[1]).toHaveTextContent("ws-2");
  });

  it("shows pane labels", () => {
    render(<AgentPaneLayout panes={twoPanes} />);
    expect(screen.getByText("WS 1")).toBeInTheDocument();
    expect(screen.getByText("WS 2")).toBeInTheDocument();
  });

  it("focused pane has accent outline", () => {
    useUIStore.setState({ focusedPaneIndex: 0 });
    render(<AgentPaneLayout panes={twoPanes} />);
    const wrappers = screen.getByTestId("panel-group").querySelectorAll(".flex.h-full.flex-col");
    expect(wrappers[0]).toHaveStyle({ outline: "1px solid var(--accent)" });
    expect(wrappers[1]).toHaveStyle({ outline: "none" });
  });

  it("second pane has accent outline when focused", () => {
    useUIStore.setState({ focusedPaneIndex: 1 });
    render(<AgentPaneLayout panes={twoPanes} />);
    const wrappers = screen.getByTestId("panel-group").querySelectorAll(".flex.h-full.flex-col");
    expect(wrappers[0]).toHaveStyle({ outline: "none" });
    expect(wrappers[1]).toHaveStyle({ outline: "1px solid var(--accent)" });
  });

  it("calls setFocusedPane on mouseDown", () => {
    const setFocusedPane = vi.fn();
    useUIStore.setState({ setFocusedPane });
    render(<AgentPaneLayout panes={twoPanes} />);
    const wrappers = screen.getByTestId("panel-group").querySelectorAll(".flex.h-full.flex-col");
    fireEvent.mouseDown(wrappers[1]);
    expect(setFocusedPane).toHaveBeenCalledWith(1);
  });

  it("renders three panels with two resize handles", () => {
    const threePanes: AgentPane[] = [
      ...twoPanes,
      { id: "p3", contextId: "ws-3", contextType: "workspace", label: "WS 3" },
    ];
    useUIStore.setState({ agentPanes: threePanes });
    render(<AgentPaneLayout panes={threePanes} />);
    expect(screen.getAllByTestId("panel")).toHaveLength(3);
    expect(screen.getAllByTestId("resize-handle")).toHaveLength(2);
    expect(screen.getAllByTestId("chat-panel")).toHaveLength(3);
  });

  it("close button calls removeAgentPane", () => {
    const removeAgentPane = vi.fn();
    useUIStore.setState({ removeAgentPane });
    render(<AgentPaneLayout panes={twoPanes} />);
    const closeButtons = screen.getAllByTitle("Close pane");
    expect(closeButtons).toHaveLength(2);
    fireEvent.click(closeButtons[1]);
    expect(removeAgentPane).toHaveBeenCalledWith("p2");
  });
});
