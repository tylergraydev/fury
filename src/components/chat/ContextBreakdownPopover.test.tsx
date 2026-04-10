import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextBreakdownPopover, computeTurnDeltas } from "./ContextBreakdownPopover";
import { ContextUsageIndicator } from "./ContextUsageIndicator";
import type { SessionStats } from "../../stores/chatStore";
import type { ChatMessage } from "../../lib/tauri";

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: { data: Array<{ name: string; value: number }> }) => (
    <div data-testid="pie">{data.map((d) => <span key={d.name} data-testid={`pie-cell-${d.name}`}>{d.value}</span>)}</div>
  ),
  Cell: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock chatStore
const mockMessages: ChatMessage[] = [];
vi.mock("../../stores/chatStore", async () => {
  const actual = await vi.importActual<typeof import("../../stores/chatStore")>("../../stores/chatStore");
  return {
    ...actual,
    useChatStore: (selector: (state: { messages: Record<string, ChatMessage[]> }) => unknown) =>
      selector({ messages: { "ws-1": mockMessages } }),
  };
});

const baseStats: SessionStats = {
  totalCostUsd: 0.15,
  totalInputTokens: 80_000,
  totalOutputTokens: 12_000,
  numTurns: 5,
  totalCacheReadTokens: 40_000,
  totalCacheCreationTokens: 10_000,
};

function makeAssistantMsg(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  costUsd = 0,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    workspaceId: "ws-1",
    role: "assistant",
    content: [],
    timestamp: new Date().toISOString(),
    metadata: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens: 0,
      totalCostUsd: costUsd,
      numTurns: 1,
      durationMs: 1000,
      durationApiMs: 800,
    },
  };
}

// ---------------------------------------------------------------------------
// computeTurnDeltas unit tests
// ---------------------------------------------------------------------------

describe("computeTurnDeltas", () => {
  it("returns empty array for no messages", () => {
    expect(computeTurnDeltas([])).toEqual([]);
  });

  it("returns single delta for one assistant message", () => {
    const msgs = [makeAssistantMsg(5000, 1000, 2000)];
    const deltas = computeTurnDeltas(msgs);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({
      turn: 1,
      inputTokens: 5000,
      outputTokens: 1000,
      cacheReadTokens: 2000,
    });
  });

  it("computes correct deltas between consecutive messages", () => {
    const msgs = [
      makeAssistantMsg(5000, 1000, 2000),
      makeAssistantMsg(12000, 3000, 5000),
      makeAssistantMsg(20000, 6000, 8000),
    ];
    const deltas = computeTurnDeltas(msgs);
    expect(deltas).toHaveLength(3);
    expect(deltas[1]).toEqual({
      turn: 2,
      inputTokens: 7000,
      outputTokens: 2000,
      cacheReadTokens: 3000,
    });
    expect(deltas[2]).toEqual({
      turn: 3,
      inputTokens: 8000,
      outputTokens: 3000,
      cacheReadTokens: 3000,
    });
  });

  it("skips non-assistant messages and messages without metadata", () => {
    const msgs: ChatMessage[] = [
      { id: "1", workspaceId: "ws-1", role: "user", content: [], timestamp: "" },
      makeAssistantMsg(5000, 1000),
      { id: "2", workspaceId: "ws-1", role: "assistant", content: [], timestamp: "" }, // no metadata
      makeAssistantMsg(10000, 2000),
    ];
    const deltas = computeTurnDeltas(msgs);
    expect(deltas).toHaveLength(2);
    expect(deltas[0].inputTokens).toBe(5000);
    expect(deltas[1].inputTokens).toBe(5000); // 10000 - 5000
  });

  it("clamps negative deltas to zero", () => {
    // Defensive: if cumulative values somehow decrease
    const msgs = [
      makeAssistantMsg(10000, 5000, 3000),
      makeAssistantMsg(8000, 4000, 2000), // lower than previous (shouldn't happen, but defensive)
    ];
    const deltas = computeTurnDeltas(msgs);
    expect(deltas[1].inputTokens).toBe(0);
    expect(deltas[1].outputTokens).toBe(0);
    expect(deltas[1].cacheReadTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ContextBreakdownPopover component tests
// ---------------------------------------------------------------------------

describe("ContextBreakdownPopover", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockMessages.length = 0;
  });

  it("renders the popover with header and stats", () => {
    render(
      <ContextBreakdownPopover stats={baseStats} contextId="ws-1" contextWindowTokens={200_000} onClose={onClose} />,
    );
    expect(screen.getByText("Context Breakdown")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // turns
    expect(screen.getByLabelText("Close context breakdown")).toBeInTheDocument();
  });

  it("shows correct cache hit rate", () => {
    render(
      <ContextBreakdownPopover stats={baseStats} contextId="ws-1" contextWindowTokens={200_000} onClose={onClose} />,
    );
    // 40000 / 80000 = 50%
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows 0% cache hit rate when no input tokens", () => {
    const stats: SessionStats = { ...baseStats, totalInputTokens: 0, totalCacheReadTokens: 0 };
    render(
      <ContextBreakdownPopover stats={stats} contextId="ws-1" onClose={onClose} />,
    );
    // Both the donut center (0% used) and cache hit (0%) show "0%" — just confirm at least one exists
    expect(screen.getAllByText("0%").length).toBeGreaterThanOrEqual(1);
  });

  it("renders donut chart with correct segment values", () => {
    render(
      <ContextBreakdownPopover stats={baseStats} contextId="ws-1" contextWindowTokens={200_000} onClose={onClose} />,
    );
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    // Fresh input = 80000 - 40000 = 40000
    expect(screen.getByTestId("pie-cell-Fresh input")).toHaveTextContent("40000");
    // Cached = 40000
    expect(screen.getByTestId("pie-cell-Cached")).toHaveTextContent("40000");
    // Remaining = 200000 - 80000 = 120000
    expect(screen.getByTestId("pie-cell-Available")).toHaveTextContent("120000");
  });

  it("does not render bar chart with 0 or 1 turn", () => {
    mockMessages.push(makeAssistantMsg(5000, 1000));
    render(
      <ContextBreakdownPopover stats={baseStats} contextId="ws-1" contextWindowTokens={200_000} onClose={onClose} />,
    );
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
  });

  it("renders bar chart with 2+ turns", () => {
    mockMessages.push(makeAssistantMsg(5000, 1000));
    mockMessages.push(makeAssistantMsg(10000, 2000));
    render(
      <ContextBreakdownPopover stats={baseStats} contextId="ws-1" contextWindowTokens={200_000} onClose={onClose} />,
    );
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    render(
      <ContextBreakdownPopover stats={baseStats} contextId="ws-1" contextWindowTokens={200_000} onClose={onClose} />,
    );
    fireEvent.click(screen.getByLabelText("Close context breakdown"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("handles missing optional cache fields", () => {
    const stats: SessionStats = {
      totalCostUsd: 0.05,
      totalInputTokens: 50_000,
      totalOutputTokens: 5_000,
      numTurns: 2,
    };
    render(
      <ContextBreakdownPopover stats={stats} contextId="ws-1" onClose={onClose} />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument(); // cache hit rate
    expect(screen.getByText("Context Breakdown")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ContextUsageIndicator click-to-open tests
// ---------------------------------------------------------------------------

describe("ContextUsageIndicator", () => {
  beforeEach(() => {
    mockMessages.length = 0;
  });

  it("shows tooltip on hover when popover is closed", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    const container = screen.getByLabelText(/Context usage/);
    fireEvent.mouseEnter(container.closest("[class*='relative']")!);
    expect(screen.getByText(/Context/)).toBeInTheDocument();
  });

  it("opens popover on click when contextId is provided", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();
  });

  it("does not open popover when contextId is missing", () => {
    render(<ContextUsageIndicator stats={baseStats} />);
    // No role="button" when no contextId
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides tooltip when popover is open", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    const wrapper = screen.getByLabelText(/Context usage/).closest("[class*='relative']")!;

    // Open popover
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();

    // Hover should not show tooltip
    fireEvent.mouseEnter(wrapper);
    // Tooltip would show "Cache read" but popover shows "Cache hit" — check tooltip-specific text is absent
    // The tooltip has the progress bar div with specific min-width styling
    const tooltipElements = wrapper.querySelectorAll("[style*='minWidth: 180px']");
    expect(tooltipElements).toHaveLength(0);
  });

  it("closes popover on Escape key", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("context-breakdown-popover")).not.toBeInTheDocument();
  });

  it("closes popover on click outside", () => {
    render(
      <div>
        <ContextUsageIndicator stats={baseStats} contextId="ws-1" />
        <div data-testid="outside">Outside</div>
      </div>,
    );
    fireEvent.click(screen.getByLabelText(/Context usage/));
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByTestId("context-breakdown-popover")).not.toBeInTheDocument();
  });

  it("toggles popover on repeated clicks", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    const btn = screen.getByRole("button");

    fireEvent.click(btn);
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.queryByTestId("context-breakdown-popover")).not.toBeInTheDocument();
  });

  it("opens popover with Enter key", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();
  });

  it("opens popover with Space key", () => {
    render(<ContextUsageIndicator stats={baseStats} contextId="ws-1" />);
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(screen.getByTestId("context-breakdown-popover")).toBeInTheDocument();
  });
});
